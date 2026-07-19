#include <windows.h>
#include <sddl.h>
#include <shlwapi.h>

#include <algorithm>
#include <cstdint>
#include <iterator>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr std::uint32_t kBrokerMagic = 0x59484353;
constexpr std::uint32_t kBrokerVersion = 1;
constexpr size_t kMaximumStructureBytes = 512ULL * 1024ULL * 1024ULL;
constexpr size_t kMaximumPngBytes = 64ULL * 1024ULL * 1024ULL;
constexpr DWORD kRenderTimeoutMs = 25'000;

void Trace(const std::wstring& message) {
  DWORD enabled = 0;
  DWORD enabledSize = sizeof(enabled);
  if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Schemy", L"PreviewTrace",
      RRF_RT_REG_DWORD, nullptr, &enabled, &enabledSize) != ERROR_SUCCESS || enabled != 1) return;
  wchar_t temporaryDirectory[MAX_PATH]{};
  const DWORD directoryLength = GetTempPathW(MAX_PATH, temporaryDirectory);
  if (!directoryLength || directoryLength >= MAX_PATH) return;
  const std::wstring logPath = std::wstring(temporaryDirectory) + L"SchemyPreviewBroker.log";
  SYSTEMTIME now{};
  GetLocalTime(&now);
  wchar_t line[2048]{};
  swprintf_s(line, L"%04u-%02u-%02u %02u:%02u:%02u.%03u pid=%lu %s\r\n",
    now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond,
    now.wMilliseconds, GetCurrentProcessId(), message.c_str());
  const int characters = static_cast<int>(wcslen(line));
  const int byteCount = WideCharToMultiByte(CP_UTF8, 0, line, characters, nullptr, 0, nullptr, nullptr);
  if (byteCount <= 0) return;
  std::vector<char> utf8(static_cast<size_t>(byteCount));
  WideCharToMultiByte(CP_UTF8, 0, line, characters, utf8.data(), byteCount, nullptr, nullptr);
  HANDLE log = CreateFileW(logPath.c_str(), FILE_APPEND_DATA,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_ALWAYS,
    FILE_ATTRIBUTE_NORMAL, nullptr);
  if (log == INVALID_HANDLE_VALUE) return;
  DWORD written = 0;
  WriteFile(log, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
  CloseHandle(log);
}

void CloseIfValid(HANDLE& handle) {
  if (handle && handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
  handle = nullptr;
}

bool CurrentUserSid(std::vector<std::uint8_t>& sidBytes, std::wstring& sidString) {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
  DWORD required = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &required);
  std::vector<std::uint8_t> tokenBytes(required);
  if (!required || !GetTokenInformation(token, TokenUser, tokenBytes.data(), required, &required)) {
    CloseHandle(token);
    return false;
  }
  CloseHandle(token);
  const auto user = reinterpret_cast<const TOKEN_USER*>(tokenBytes.data());
  const DWORD sidLength = GetLengthSid(user->User.Sid);
  sidBytes.resize(sidLength);
  if (!CopySid(sidLength, sidBytes.data(), user->User.Sid)) return false;
  wchar_t* converted = nullptr;
  if (!ConvertSidToStringSidW(sidBytes.data(), &converted)) return false;
  sidString.assign(converted);
  LocalFree(converted);
  return true;
}

std::wstring PipeName(const std::wstring& sid) {
  return L"\\\\.\\pipe\\SchemyPreviewBroker-" + sid;
}

std::wstring ShutdownEventName(const std::wstring& sid) {
  return L"Local\\SchemyPreviewBrokerShutdown-" + sid;
}

std::wstring MutexName(const std::wstring& sid) {
  return L"Local\\SchemyPreviewBroker-" + sid;
}

std::wstring ModulePath() {
  std::wstring path(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  path.resize(length);
  return path;
}

bool RegisterStartup() {
  HKEY key = nullptr;
  const LONG opened = RegCreateKeyExW(HKEY_CURRENT_USER,
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, nullptr, 0,
    KEY_SET_VALUE, nullptr, &key, nullptr);
  if (opened != ERROR_SUCCESS) {
    SetLastError(opened);
    return false;
  }
  const std::wstring command = L"\"" + ModulePath() + L"\"";
  const LONG written = RegSetValueExW(key, L"Schemy Preview Broker", 0, REG_SZ,
    reinterpret_cast<const BYTE*>(command.c_str()),
    static_cast<DWORD>((command.size() + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
  if (written != ERROR_SUCCESS) SetLastError(written);
  return written == ERROR_SUCCESS;
}

std::wstring SchemyExecutablePath() {
  std::wstring path = ModulePath();
  for (int index = 0; index < 3; ++index) {
    if (!PathRemoveFileSpecW(path.data())) return {};
    path.resize(wcslen(path.c_str()));
  }
  path += L"\\Schemy.exe";
  return path;
}

bool ReadExact(HANDLE pipe, void* destination, size_t length) {
  auto bytes = static_cast<std::uint8_t*>(destination);
  size_t offset = 0;
  while (offset < length) {
    DWORD read = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(64 * 1024, length - offset));
    if (!ReadFile(pipe, bytes + offset, chunk, &read, nullptr) || !read) return false;
    offset += read;
  }
  return true;
}

bool WriteExact(HANDLE pipe, const void* source, size_t length) {
  const auto bytes = static_cast<const std::uint8_t*>(source);
  size_t offset = 0;
  while (offset < length) {
    DWORD written = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(64 * 1024, length - offset));
    if (!WriteFile(pipe, bytes + offset, chunk, &written, nullptr) || !written) return false;
    offset += written;
  }
  return true;
}

bool WriteRendererPipe(HANDLE pipe, const void* source, size_t length, ULONGLONG deadline) {
  const auto bytes = static_cast<const std::uint8_t*>(source);
  size_t offset = 0;
  while (offset < length && GetTickCount64() < deadline) {
    DWORD written = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(64 * 1024, length - offset));
    if (WriteFile(pipe, bytes + offset, chunk, &written, nullptr) && written) offset += written;
    else {
      const DWORD error = GetLastError();
      if (error != ERROR_NO_DATA && error != ERROR_PIPE_LISTENING) return false;
      Sleep(5);
    }
  }
  return offset == length;
}

bool ReadRendererPipe(HANDLE pipe, void* destination, size_t length, ULONGLONG deadline) {
  auto bytes = static_cast<std::uint8_t*>(destination);
  size_t offset = 0;
  while (offset < length && GetTickCount64() < deadline) {
    DWORD read = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(64 * 1024, length - offset));
    if (ReadFile(pipe, bytes + offset, chunk, &read, nullptr) && read) offset += read;
    else {
      const DWORD error = GetLastError();
      if (error != ERROR_NO_DATA && error != ERROR_PIPE_LISTENING) return false;
      Sleep(5);
    }
  }
  return offset == length;
}

bool RunRenderer(const std::vector<std::uint8_t>& input, UINT size, std::vector<std::uint8_t>& png) {
  const std::wstring executable = SchemyExecutablePath();
  if (executable.empty() || GetFileAttributesW(executable.c_str()) == INVALID_FILE_ATTRIBUTES) {
    Trace(L"renderer executable missing path=" + executable + L" error=" + std::to_wstring(GetLastError()));
    return false;
  }
  const std::wstring pipeName = L"\\\\.\\pipe\\SchemyPreviewRender-" +
    std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64());
  HANDLE pipe = CreateNamedPipeW(pipeName.c_str(), PIPE_ACCESS_DUPLEX,
    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT, 1, 64 * 1024, 64 * 1024,
    kRenderTimeoutMs, nullptr);
  if (pipe == INVALID_HANDLE_VALUE) return false;

  std::wstring command = L"\"" + executable + L"\" --render-thumbnail-pipe \"" +
    pipeName + L"\" --thumbnail-size " + std::to_wstring(size);
  std::vector<wchar_t> commandLine(command.begin(), command.end());
  commandLine.push_back(L'\0');
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(executable.c_str(), commandLine.data(), nullptr, nullptr, FALSE,
      CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) {
    Trace(L"renderer CreateProcess failed error=" + std::to_wstring(GetLastError()));
    CloseIfValid(pipe);
    return false;
  }

  const ULONGLONG deadline = GetTickCount64() + kRenderTimeoutMs;
  bool connected = false;
  while (!connected && GetTickCount64() < deadline) {
    if (ConnectNamedPipe(pipe, nullptr)) connected = true;
    else {
      const DWORD error = GetLastError();
      if (error == ERROR_PIPE_CONNECTED) connected = true;
      else if (error != ERROR_PIPE_LISTENING && error != ERROR_NO_DATA) break;
    }
    if (!connected) {
      if (WaitForSingleObject(process.hProcess, 10) == WAIT_OBJECT_0) break;
      Sleep(5);
    }
  }

  const std::uint64_t inputLength = input.size();
  std::uint64_t outputLength = 0;
  bool success = connected &&
    WriteRendererPipe(pipe, &inputLength, sizeof(inputLength), deadline) &&
    WriteRendererPipe(pipe, input.data(), input.size(), deadline) &&
    ReadRendererPipe(pipe, &outputLength, sizeof(outputLength), deadline) &&
    outputLength > 8 && outputLength <= kMaximumPngBytes;
  if (success) {
    png.resize(static_cast<size_t>(outputLength));
    success = ReadRendererPipe(pipe, png.data(), png.size(), deadline);
  }
  if (success) {
    const std::uint8_t acknowledgement = 1;
    success = WriteRendererPipe(pipe, &acknowledgement, sizeof(acknowledgement), deadline);
  }
  FlushFileBuffers(pipe);
  DisconnectNamedPipe(pipe);
  CloseIfValid(pipe);
  if (!success && WaitForSingleObject(process.hProcess, 0) != WAIT_OBJECT_0) {
    TerminateProcess(process.hProcess, 1);
  }
  WaitForSingleObject(process.hProcess, 1000);
  DWORD exitCode = 1;
  GetExitCodeProcess(process.hProcess, &exitCode);
  CloseIfValid(process.hThread);
  CloseIfValid(process.hProcess);
  Trace(L"render success=" + std::to_wstring(success) + L" exit=" +
    std::to_wstring(exitCode) + L" png=" + std::to_wstring(png.size()));
  return success && exitCode == 0;
}

bool SameSid(PSID expected, HANDLE token) {
  DWORD required = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &required);
  std::vector<std::uint8_t> bytes(required);
  if (!required || !GetTokenInformation(token, TokenUser, bytes.data(), required, &required)) return false;
  const auto user = reinterpret_cast<const TOKEN_USER*>(bytes.data());
  return EqualSid(expected, user->User.Sid) == TRUE;
}

bool IsLowIntegrity(HANDLE token) {
  DWORD required = 0;
  GetTokenInformation(token, TokenIntegrityLevel, nullptr, 0, &required);
  std::vector<std::uint8_t> bytes(required);
  if (!required || !GetTokenInformation(token, TokenIntegrityLevel, bytes.data(), required, &required)) return false;
  const auto label = reinterpret_cast<const TOKEN_MANDATORY_LABEL*>(bytes.data());
  const DWORD count = *GetSidSubAuthorityCount(label->Label.Sid);
  const DWORD level = *GetSidSubAuthority(label->Label.Sid, count - 1);
  return level < SECURITY_MANDATORY_MEDIUM_RID;
}

bool ValidateClient(HANDLE pipe, PSID expectedUser) {
  ULONG clientProcessId = 0;
  if (!GetNamedPipeClientProcessId(pipe, &clientProcessId)) return false;
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, clientProcessId);
  if (!process) return false;
  wchar_t path[32768]{};
  DWORD pathLength = static_cast<DWORD>(std::size(path));
  const bool expectedImage = QueryFullProcessImageNameW(process, 0, path, &pathLength) &&
    _wcsicmp(PathFindFileNameW(path), L"prevhost.exe") == 0;
  HANDLE token = nullptr;
  const bool openedToken = OpenProcessToken(process, TOKEN_QUERY, &token) == TRUE;
  const bool valid = expectedImage && openedToken && SameSid(expectedUser, token) && IsLowIntegrity(token);
  if (token) CloseHandle(token);
  CloseHandle(process);
  Trace(L"client pid=" + std::to_wstring(clientProcessId) + L" valid=" + std::to_wstring(valid));
  return valid;
}

void HandleRequest(HANDLE pipe) {
  std::uint32_t magic = 0;
  std::uint32_t version = 0;
  std::uint32_t size = 0;
  std::uint64_t inputLength = 0;
  std::uint32_t status = ERROR_INVALID_DATA;
  std::uint64_t outputLength = 0;
  std::vector<std::uint8_t> input;
  std::vector<std::uint8_t> png;
  const bool validHeader =
    ReadExact(pipe, &magic, sizeof(magic)) &&
    ReadExact(pipe, &version, sizeof(version)) &&
    ReadExact(pipe, &size, sizeof(size)) &&
    ReadExact(pipe, &inputLength, sizeof(inputLength)) &&
    magic == kBrokerMagic && version == kBrokerVersion &&
    size >= 128 && size <= 1024 && inputLength > 0 && inputLength <= kMaximumStructureBytes;
  if (validHeader) {
    input.resize(static_cast<size_t>(inputLength));
    if (ReadExact(pipe, input.data(), input.size()) && RunRenderer(input, size, png)) {
      status = ERROR_SUCCESS;
      outputLength = png.size();
    } else {
      status = ERROR_GEN_FAILURE;
    }
  }
  WriteExact(pipe, &status, sizeof(status));
  WriteExact(pipe, &outputLength, sizeof(outputLength));
  if (status == ERROR_SUCCESS) WriteExact(pipe, png.data(), png.size());
  FlushFileBuffers(pipe);
}

bool SignalShutdown(const std::wstring& sid) {
  HANDLE event = OpenEventW(EVENT_MODIFY_STATE, FALSE, ShutdownEventName(sid).c_str());
  if (!event) return false;
  SetEvent(event);
  CloseHandle(event);
  HANDLE wake = CreateFileW(PipeName(sid).c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (wake != INVALID_HANDLE_VALUE) CloseHandle(wake);
  return true;
}

} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, wchar_t* commandLine, int) {
  std::vector<std::uint8_t> userSid;
  std::wstring sidString;
  if (!CurrentUserSid(userSid, sidString)) return 2;
  if (commandLine && wcsstr(commandLine, L"--shutdown")) return SignalShutdown(sidString) ? 0 : 1;

  if (!RegisterStartup()) Trace(L"startup registration failed error=" + std::to_wstring(GetLastError()));

  HANDLE mutex = CreateMutexW(nullptr, FALSE, MutexName(sidString).c_str());
  if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
    if (mutex) CloseHandle(mutex);
    return 0;
  }
  HANDLE shutdown = CreateEventW(nullptr, TRUE, FALSE, ShutdownEventName(sidString).c_str());
  if (!shutdown) {
    CloseHandle(mutex);
    return 2;
  }
  const std::wstring sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;" + sidString +
    L")S:(ML;;NW;;;LW)";
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1,
      &descriptor, nullptr)) {
    CloseHandle(shutdown);
    CloseHandle(mutex);
    return 2;
  }
  std::thread startupRepair([shutdown]() {
    if (WaitForSingleObject(shutdown, 15'000) == WAIT_TIMEOUT && !RegisterStartup()) {
      Trace(L"delayed startup registration failed error=" + std::to_wstring(GetLastError()));
    }
  });
  SECURITY_ATTRIBUTES security{ sizeof(security), descriptor, FALSE };
  Trace(L"broker started sid=" + sidString);

  while (WaitForSingleObject(shutdown, 0) != WAIT_OBJECT_0) {
    HANDLE pipe = CreateNamedPipeW(PipeName(sidString).c_str(), PIPE_ACCESS_DUPLEX,
      PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
      1, 64 * 1024, 64 * 1024, 0, &security);
    if (pipe == INVALID_HANDLE_VALUE) {
      Trace(L"CreateNamedPipe failed error=" + std::to_wstring(GetLastError()));
      break;
    }
    const BOOL connected = ConnectNamedPipe(pipe, nullptr) ? TRUE : GetLastError() == ERROR_PIPE_CONNECTED;
    if (connected && WaitForSingleObject(shutdown, 0) != WAIT_OBJECT_0 &&
        ValidateClient(pipe, userSid.data())) {
      HandleRequest(pipe);
      RegisterStartup();
    }
    DisconnectNamedPipe(pipe);
    CloseHandle(pipe);
  }

  Trace(L"broker stopped");
  SetEvent(shutdown);
  startupRepair.join();
  LocalFree(descriptor);
  CloseHandle(shutdown);
  CloseHandle(mutex);
  return 0;
}
