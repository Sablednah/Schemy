#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <thumbcache.h>
#include <wincodec.h>
#include <shlwapi.h>
#include <initguid.h>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <new>
#include <string>
#include <vector>

// Separate classes keep thumbnail activation independent from PreviewHost.
DEFINE_GUID(CLSID_SchemyThumbnail,
  0x7d4655e4, 0x6f33, 0x4d56, 0x97, 0xa6, 0x2d, 0x6b, 0x8f, 0x2c, 0x1a, 0x70);
DEFINE_GUID(CLSID_SchemyPreview,
  0x5199ac8d, 0xa310, 0x4bd1, 0xa5, 0x67, 0x84, 0x3d, 0xc7, 0xd0, 0x5a, 0x3e);

namespace {

constexpr wchar_t kThumbnailClsid[] = L"{7D4655E4-6F33-4D56-97A6-2D6B8F2C1A70}";
constexpr wchar_t kPreviewClsid[] = L"{5199AC8D-A310-4BD1-A567-843DC7D05A3E}";
constexpr wchar_t kThumbnailHandler[] = L"{E357FCCD-A995-4576-B01F-234630154E96}";
constexpr wchar_t kPreviewHandler[] = L"{8895B1C6-B41F-4C1C-A562-0D564250836F}";
constexpr wchar_t kPreviewHostAppId[] = L"{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}";
constexpr wchar_t kWindowClass[] = L"SchemyPreviewWindow";
constexpr wchar_t kExtensions[][11] = { L".schematic", L".schem", L".nbt", L".litematic" };
constexpr size_t kMaximumStructureBytes = 512ULL * 1024ULL * 1024ULL;
constexpr size_t kMaximumPngBytes = 64ULL * 1024ULL * 1024ULL;
constexpr DWORD kRenderTimeoutMs = 25'000;

HINSTANCE g_instance = nullptr;
std::atomic<long> g_objects = 0;

template <typename T>
void SafeRelease(T*& value) {
  if (value) {
    value->Release();
    value = nullptr;
  }
}

std::wstring GuidKey(const wchar_t* clsid, const wchar_t* suffix = L"") {
  return std::wstring(L"Software\\Classes\\CLSID\\") + clsid + suffix;
}

HRESULT SetString(HKEY root, const std::wstring& keyPath, const wchar_t* name, const std::wstring& value) {
  HKEY key = nullptr;
  const LONG opened = RegCreateKeyExW(root, keyPath.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr);
  if (opened != ERROR_SUCCESS) return HRESULT_FROM_WIN32(opened);
  const LONG written = RegSetValueExW(key, name, 0, REG_SZ,
    reinterpret_cast<const BYTE*>(value.c_str()), static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
  return HRESULT_FROM_WIN32(written);
}

HRESULT DeleteTree(HKEY root, const std::wstring& keyPath) {
  const LONG result = RegDeleteTreeW(root, keyPath.c_str());
  return result == ERROR_SUCCESS || result == ERROR_FILE_NOT_FOUND ? S_OK : HRESULT_FROM_WIN32(result);
}

std::wstring ModulePath() {
  std::wstring path(32768, L'\0');
  const DWORD length = GetModuleFileNameW(g_instance, path.data(), static_cast<DWORD>(path.size()));
  path.resize(length);
  return path;
}

std::wstring SchemyExecutablePath() {
  std::wstring path = ModulePath();
  if (!PathRemoveFileSpecW(path.data())) return {};
  path.resize(wcslen(path.c_str()));
  if (!PathRemoveFileSpecW(path.data())) return {};
  path.resize(wcslen(path.c_str()));
  if (!PathRemoveFileSpecW(path.data())) return {};
  path.resize(wcslen(path.c_str()));
  path += L"\\Schemy.exe";
  return path;
}

bool ReadStructureStream(IStream* stream, std::vector<std::uint8_t>& bytes) {
  if (!stream) return false;
  LARGE_INTEGER start{};
  if (FAILED(stream->Seek(start, STREAM_SEEK_SET, nullptr))) return false;

  STATSTG stat{};
  if (SUCCEEDED(stream->Stat(&stat, STATFLAG_NONAME))) {
    if (stat.cbSize.QuadPart < 0 || static_cast<ULONGLONG>(stat.cbSize.QuadPart) > kMaximumStructureBytes) return false;
    bytes.reserve(static_cast<size_t>(stat.cbSize.QuadPart));
  }

  std::uint8_t buffer[64 * 1024];
  while (bytes.size() <= kMaximumStructureBytes) {
    ULONG read = 0;
    const HRESULT result = stream->Read(buffer, sizeof(buffer), &read);
    if (FAILED(result)) return false;
    bytes.insert(bytes.end(), buffer, buffer + read);
    if (read == 0 || result == S_FALSE) return !bytes.empty();
  }
  return false;
}

void CloseIfValid(HANDLE& handle) {
  if (handle && handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
  handle = nullptr;
}

bool WritePipe(HANDLE pipe, const void* source, size_t length, ULONGLONG deadline) {
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

bool ReadPipe(HANDLE pipe, void* destination, size_t length, ULONGLONG deadline) {
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
  if (executable.empty() || GetFileAttributesW(executable.c_str()) == INVALID_FILE_ATTRIBUTES) return false;

  const std::wstring pipeName = L"\\\\.\\pipe\\SchemyPreview-" + std::to_wstring(GetCurrentProcessId()) +
    L"-" + std::to_wstring(GetCurrentThreadId()) + L"-" + std::to_wstring(GetTickCount64());
  HANDLE pipe = CreateNamedPipeW(pipeName.c_str(), PIPE_ACCESS_DUPLEX,
    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT, 1, 64 * 1024, 64 * 1024, kRenderTimeoutMs, nullptr);
  if (pipe == INVALID_HANDLE_VALUE) return false;

  HANDLE nullError = INVALID_HANDLE_VALUE;
  SECURITY_ATTRIBUTES security{ sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE };
  nullError = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security,
    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);

  std::wstring command = L"\"" + executable + L"\" --render-thumbnail-pipe \"" + pipeName +
    L"\" --thumbnail-size " + std::to_wstring(size);
  std::vector<wchar_t> commandLine(command.begin(), command.end());
  commandLine.push_back(L'\0');

  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = nullError;
  startup.hStdError = nullError;
  PROCESS_INFORMATION process{};

  const BOOL started = CreateProcessW(executable.c_str(), commandLine.data(), nullptr, nullptr, FALSE,
    CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process);
  CloseIfValid(nullError);
  if (!started) {
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
    WritePipe(pipe, &inputLength, sizeof(inputLength), deadline) &&
    WritePipe(pipe, input.data(), input.size(), deadline) &&
    ReadPipe(pipe, &outputLength, sizeof(outputLength), deadline) &&
    outputLength > 8 && outputLength <= kMaximumPngBytes;
  if (success) {
    png.resize(static_cast<size_t>(outputLength));
    success = ReadPipe(pipe, png.data(), png.size(), deadline);
  }
  if (success) {
    const std::uint8_t acknowledgement = 1;
    success = WritePipe(pipe, &acknowledgement, sizeof(acknowledgement), deadline);
  }
  FlushFileBuffers(pipe);
  DisconnectNamedPipe(pipe);
  CloseIfValid(pipe);
  if (!success && WaitForSingleObject(process.hProcess, 0) != WAIT_OBJECT_0) TerminateProcess(process.hProcess, 1);
  WaitForSingleObject(process.hProcess, 1000);
  DWORD exitCode = 1;
  GetExitCodeProcess(process.hProcess, &exitCode);
  CloseIfValid(process.hThread);
  CloseIfValid(process.hProcess);
  return success && exitCode == 0 && png.size() > 8 &&
    png[0] == 0x89 && png[1] == 'P' && png[2] == 'N' && png[3] == 'G';
}

HRESULT DecodePng(const std::vector<std::uint8_t>& png, HBITMAP* bitmap) {
  *bitmap = nullptr;
  IWICImagingFactory* factory = nullptr;
  IWICStream* stream = nullptr;
  IWICBitmapDecoder* decoder = nullptr;
  IWICBitmapFrameDecode* frame = nullptr;
  IWICFormatConverter* converter = nullptr;

  HRESULT result = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
    IID_PPV_ARGS(&factory));
  if (SUCCEEDED(result)) result = factory->CreateStream(&stream);
  if (SUCCEEDED(result)) result = stream->InitializeFromMemory(
    const_cast<BYTE*>(png.data()), static_cast<DWORD>(png.size()));
  if (SUCCEEDED(result)) result = factory->CreateDecoderFromStream(stream, nullptr,
    WICDecodeMetadataCacheOnLoad, &decoder);
  if (SUCCEEDED(result)) result = decoder->GetFrame(0, &frame);
  if (SUCCEEDED(result)) result = factory->CreateFormatConverter(&converter);
  if (SUCCEEDED(result)) result = converter->Initialize(frame, GUID_WICPixelFormat32bppPBGRA,
    WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom);

  UINT width = 0, height = 0;
  if (SUCCEEDED(result)) result = converter->GetSize(&width, &height);
  if (SUCCEEDED(result) && width && height) {
    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = static_cast<LONG>(width);
    info.bmiHeader.biHeight = -static_cast<LONG>(height);
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    void* pixels = nullptr;
    HBITMAP dib = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
    if (!dib) result = HRESULT_FROM_WIN32(GetLastError());
    else {
      const UINT stride = width * 4;
      result = converter->CopyPixels(nullptr, stride, stride * height, static_cast<BYTE*>(pixels));
      if (SUCCEEDED(result)) *bitmap = dib;
      else DeleteObject(dib);
    }
  }

  SafeRelease(converter);
  SafeRelease(frame);
  SafeRelease(decoder);
  SafeRelease(stream);
  SafeRelease(factory);
  return result;
}

enum class HandlerKind { Thumbnail, Preview };

class SchemyHandler final : public IInitializeWithStream,
                            public IThumbnailProvider,
                            public IPreviewHandler,
                            public IOleWindow,
                            public IObjectWithSite,
                            public IPreviewHandlerVisuals {
public:
  explicit SchemyHandler(HandlerKind kind) : kind_(kind) { ++g_objects; }

  IFACEMETHODIMP QueryInterface(REFIID iid, void** object) override {
    if (!object) return E_POINTER;
    *object = nullptr;
    if (iid == IID_IUnknown || iid == IID_IInitializeWithStream) {
      *object = static_cast<IInitializeWithStream*>(this);
    } else if (kind_ == HandlerKind::Thumbnail && iid == IID_IThumbnailProvider) {
      *object = static_cast<IThumbnailProvider*>(this);
    } else if (kind_ == HandlerKind::Preview && iid == IID_IPreviewHandler) {
      *object = static_cast<IPreviewHandler*>(this);
    } else if (kind_ == HandlerKind::Preview && iid == IID_IOleWindow) {
      *object = static_cast<IOleWindow*>(this);
    } else if (kind_ == HandlerKind::Preview && iid == IID_IObjectWithSite) {
      *object = static_cast<IObjectWithSite*>(this);
    } else if (kind_ == HandlerKind::Preview && iid == IID_IPreviewHandlerVisuals) {
      *object = static_cast<IPreviewHandlerVisuals*>(this);
    } else {
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }

  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
  IFACEMETHODIMP_(ULONG) Release() override {
    const ULONG references = InterlockedDecrement(&references_);
    if (!references) delete this;
    return references;
  }

  IFACEMETHODIMP Initialize(IStream* stream, DWORD) override {
    if (!stream) return E_INVALIDARG;
    if (stream_) return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);
    stream_ = stream;
    stream_->AddRef();
    return S_OK;
  }

  IFACEMETHODIMP GetThumbnail(UINT size, HBITMAP* bitmap, WTS_ALPHATYPE* alphaType) override {
    if (!bitmap || !alphaType) return E_POINTER;
    *bitmap = nullptr;
    *alphaType = WTSAT_UNKNOWN;
    const HRESULT result = Render(std::clamp<UINT>(size, 128, 1024), bitmap);
    if (SUCCEEDED(result)) *alphaType = WTSAT_ARGB;
    return result;
  }

  IFACEMETHODIMP SetWindow(HWND parent, const RECT* rect) override {
    if (!rect) return E_POINTER;
    parent_ = parent;
    rect_ = *rect;
    if (window_) {
      SetParent(window_, parent_);
      ResizePreview();
    }
    return S_OK;
  }

  IFACEMETHODIMP SetRect(const RECT* rect) override {
    if (!rect) return E_POINTER;
    rect_ = *rect;
    ResizePreview();
    return S_OK;
  }

  IFACEMETHODIMP DoPreview() override {
    if (!stream_ || !parent_) return E_UNEXPECTED;
    if (window_) return S_OK;
    const UINT width = static_cast<UINT>(std::max<LONG>(1, rect_.right - rect_.left));
    const UINT height = static_cast<UINT>(std::max<LONG>(1, rect_.bottom - rect_.top));
    const HRESULT rendered = Render(std::clamp<UINT>(std::max(width, height), 256, 1024), &previewBitmap_);
    if (FAILED(rendered)) return rendered;
    window_ = CreateWindowExW(0, kWindowClass, L"", WS_CHILD | WS_VISIBLE,
      rect_.left, rect_.top, width, height, parent_, nullptr, g_instance, this);
    return window_ ? S_OK : HRESULT_FROM_WIN32(GetLastError());
  }

  IFACEMETHODIMP Unload() override {
    if (window_) DestroyWindow(window_);
    window_ = nullptr;
    if (previewBitmap_) DeleteObject(previewBitmap_);
    previewBitmap_ = nullptr;
    SafeRelease(stream_);
    return S_OK;
  }

  IFACEMETHODIMP SetFocus() override {
    if (window_) ::SetFocus(window_);
    return S_OK;
  }

  IFACEMETHODIMP QueryFocus(HWND* focused) override {
    if (!focused) return E_POINTER;
    *focused = GetFocus();
    return *focused ? S_OK : HRESULT_FROM_WIN32(GetLastError());
  }

  IFACEMETHODIMP TranslateAccelerator(MSG* message) override {
    IPreviewHandlerFrame* frame = nullptr;
    const HRESULT result = site_ ? site_->QueryInterface(IID_PPV_ARGS(&frame)) : E_NOINTERFACE;
    if (FAILED(result)) return S_FALSE;
    const HRESULT translated = frame->TranslateAccelerator(message);
    frame->Release();
    return translated;
  }

  IFACEMETHODIMP GetWindow(HWND* window) override {
    if (!window) return E_POINTER;
    *window = window_;
    return window_ ? S_OK : E_FAIL;
  }

  IFACEMETHODIMP ContextSensitiveHelp(BOOL) override { return E_NOTIMPL; }

  IFACEMETHODIMP SetSite(IUnknown* site) override {
    SafeRelease(site_);
    site_ = site;
    if (site_) site_->AddRef();
    return S_OK;
  }

  IFACEMETHODIMP GetSite(REFIID iid, void** site) override {
    if (!site) return E_POINTER;
    return site_ ? site_->QueryInterface(iid, site) : E_FAIL;
  }

  IFACEMETHODIMP SetBackgroundColor(COLORREF color) override {
    background_ = color;
    if (window_) InvalidateRect(window_, nullptr, TRUE);
    return S_OK;
  }

  IFACEMETHODIMP SetFont(const LOGFONTW*) override { return S_OK; }
  IFACEMETHODIMP SetTextColor(COLORREF) override { return S_OK; }

  void Paint() {
    PAINTSTRUCT paint{};
    HDC dc = BeginPaint(window_, &paint);
    RECT client{};
    GetClientRect(window_, &client);
    HBRUSH background = CreateSolidBrush(background_);
    FillRect(dc, &client, background);
    DeleteObject(background);

    if (previewBitmap_) {
      BITMAP source{};
      GetObjectW(previewBitmap_, sizeof(source), &source);
      const int availableWidth = client.right - client.left;
      const int availableHeight = client.bottom - client.top;
      const double scale = std::min(
        static_cast<double>(availableWidth) / source.bmWidth,
        static_cast<double>(availableHeight) / source.bmHeight);
      const int targetWidth = std::max(1, static_cast<int>(source.bmWidth * scale));
      const int targetHeight = std::max(1, static_cast<int>(source.bmHeight * scale));
      const int x = (availableWidth - targetWidth) / 2;
      const int y = (availableHeight - targetHeight) / 2;
      HDC memory = CreateCompatibleDC(dc);
      HGDIOBJ previous = SelectObject(memory, previewBitmap_);
      SetStretchBltMode(dc, HALFTONE);
      StretchBlt(dc, x, y, targetWidth, targetHeight, memory, 0, 0,
        source.bmWidth, source.bmHeight, SRCCOPY);
      SelectObject(memory, previous);
      DeleteDC(memory);
    }
    EndPaint(window_, &paint);
  }

private:
  ~SchemyHandler() {
    Unload();
    SafeRelease(site_);
    --g_objects;
  }

  HRESULT Render(UINT size, HBITMAP* bitmap) {
    if (!stream_) return E_UNEXPECTED;
    std::vector<std::uint8_t> structure;
    if (!ReadStructureStream(stream_, structure)) return E_FAIL;
    std::vector<std::uint8_t> png;
    if (!RunRenderer(structure, size, png)) return E_FAIL;
    return DecodePng(png, bitmap);
  }

  void ResizePreview() {
    if (window_) SetWindowPos(window_, nullptr, rect_.left, rect_.top,
      rect_.right - rect_.left, rect_.bottom - rect_.top, SWP_NOZORDER | SWP_NOACTIVATE);
  }

  long references_ = 1;
  HandlerKind kind_;
  IStream* stream_ = nullptr;
  IUnknown* site_ = nullptr;
  HWND parent_ = nullptr;
  HWND window_ = nullptr;
  RECT rect_{};
  HBITMAP previewBitmap_ = nullptr;
  COLORREF background_ = RGB(16, 20, 16);
};

LRESULT CALLBACK PreviewWindowProcedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  SchemyHandler* handler = reinterpret_cast<SchemyHandler*>(GetWindowLongPtrW(window, GWLP_USERDATA));
  if (message == WM_NCCREATE) {
    const auto create = reinterpret_cast<CREATESTRUCTW*>(lParam);
    handler = static_cast<SchemyHandler*>(create->lpCreateParams);
    SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(handler));
  }
  if (message == WM_PAINT && handler) {
    handler->Paint();
    return 0;
  }
  if (message == WM_ERASEBKGND) return 1;
  return DefWindowProcW(window, message, wParam, lParam);
}

class SchemyClassFactory final : public IClassFactory {
public:
  explicit SchemyClassFactory(HandlerKind kind) : kind_(kind) { ++g_objects; }

  IFACEMETHODIMP QueryInterface(REFIID iid, void** object) override {
    if (!object) return E_POINTER;
    if (iid == IID_IUnknown || iid == IID_IClassFactory) {
      *object = static_cast<IClassFactory*>(this);
      AddRef();
      return S_OK;
    }
    *object = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
  IFACEMETHODIMP_(ULONG) Release() override {
    const ULONG references = InterlockedDecrement(&references_);
    if (!references) delete this;
    return references;
  }
  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID iid, void** object) override {
    if (outer) return CLASS_E_NOAGGREGATION;
    auto handler = new (std::nothrow) SchemyHandler(kind_);
    if (!handler) return E_OUTOFMEMORY;
    const HRESULT result = handler->QueryInterface(iid, object);
    handler->Release();
    return result;
  }
  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) ++g_objects;
    else --g_objects;
    return S_OK;
  }

private:
  ~SchemyClassFactory() { --g_objects; }
  long references_ = 1;
  HandlerKind kind_;
};

HRESULT RegisterHandler(const wchar_t* clsid, const wchar_t* name, bool preview) {
  const std::wstring module = ModulePath();
  HRESULT result = SetString(HKEY_CURRENT_USER, GuidKey(clsid), nullptr, name);
  if (SUCCEEDED(result)) result = SetString(HKEY_CURRENT_USER, GuidKey(clsid, L"\\InprocServer32"), nullptr, module);
  if (SUCCEEDED(result)) result = SetString(HKEY_CURRENT_USER, GuidKey(clsid, L"\\InprocServer32"), L"ThreadingModel", L"Apartment");
  if (preview && SUCCEEDED(result)) result = SetString(HKEY_CURRENT_USER, GuidKey(clsid), L"AppID", kPreviewHostAppId);
  return result;
}

HRESULT RegisterFileHandlers() {
  HRESULT result = RegisterHandler(kThumbnailClsid, L"Schemy Thumbnail Provider", false);
  if (SUCCEEDED(result)) result = RegisterHandler(kPreviewClsid, L"Schemy Preview Handler", true);
  for (const auto& extension : kExtensions) {
    if (FAILED(result)) break;
    const std::wstring base = std::wstring(L"Software\\Classes\\SystemFileAssociations\\") + extension + L"\\shellex\\";
    result = SetString(HKEY_CURRENT_USER, base + kThumbnailHandler, nullptr, kThumbnailClsid);
    if (SUCCEEDED(result)) result = SetString(HKEY_CURRENT_USER, base + kPreviewHandler, nullptr, kPreviewClsid);
  }
  if (SUCCEEDED(result)) result = SetString(HKEY_CURRENT_USER,
    L"Software\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers", kPreviewClsid,
    L"Schemy Structure Preview");
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  return result;
}

HRESULT UnregisterFileHandlers() {
  HRESULT result = S_OK;
  for (const auto& extension : kExtensions) {
    const std::wstring base = std::wstring(L"Software\\Classes\\SystemFileAssociations\\") + extension + L"\\shellex\\";
    const HRESULT thumbnail = DeleteTree(HKEY_CURRENT_USER, base + kThumbnailHandler);
    const HRESULT preview = DeleteTree(HKEY_CURRENT_USER, base + kPreviewHandler);
    if (FAILED(thumbnail)) result = thumbnail;
    if (FAILED(preview)) result = preview;
  }
  DeleteTree(HKEY_CURRENT_USER, GuidKey(kThumbnailClsid));
  DeleteTree(HKEY_CURRENT_USER, GuidKey(kPreviewClsid));
  HKEY handlers = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER,
      L"Software\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers", 0, KEY_SET_VALUE, &handlers) == ERROR_SUCCESS) {
    RegDeleteValueW(handlers, kPreviewClsid);
    RegCloseKey(handlers);
  }
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  return result;
}

} // namespace

extern "C" BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    g_instance = instance;
    DisableThreadLibraryCalls(instance);
    WNDCLASSEXW windowClass{};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.hInstance = instance;
    windowClass.lpfnWndProc = PreviewWindowProcedure;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.lpszClassName = kWindowClass;
    RegisterClassExW(&windowClass);
  }
  return TRUE;
}

extern "C" STDAPI DllCanUnloadNow() {
  return g_objects == 0 ? S_OK : S_FALSE;
}

extern "C" STDAPI DllGetClassObject(REFCLSID clsid, REFIID iid, void** object) {
  HandlerKind kind;
  if (clsid == CLSID_SchemyThumbnail) kind = HandlerKind::Thumbnail;
  else if (clsid == CLSID_SchemyPreview) kind = HandlerKind::Preview;
  else return CLASS_E_CLASSNOTAVAILABLE;

  auto factory = new (std::nothrow) SchemyClassFactory(kind);
  if (!factory) return E_OUTOFMEMORY;
  const HRESULT result = factory->QueryInterface(iid, object);
  factory->Release();
  return result;
}

extern "C" STDAPI DllRegisterServer() {
  return RegisterFileHandlers();
}

extern "C" STDAPI DllUnregisterServer() {
  return UnregisterFileHandlers();
}
