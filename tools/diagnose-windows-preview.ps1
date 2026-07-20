param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath,

  [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'preview-diagnostics.txt'),

  [switch]$EnableTrace
)

$ErrorActionPreference = 'Continue'
$previewClsid = '{5199AC8D-A310-4BD1-A567-843DC7D05A3E}'
$previewHandler = '{8895B1C6-B41F-4C1C-A562-0D564250836F}'
$thumbnailHandler = '{E357FCCD-A995-4576-B01F-234630154E96}'
$lines = [System.Collections.Generic.List[string]]::new()

if ($EnableTrace) {
  New-Item 'HKCU:\Software\Schemy' -Force | Out-Null
  New-ItemProperty 'HKCU:\Software\Schemy' -Name PreviewTrace -PropertyType DWord -Value 1 -Force | Out-Null
}

function Add-Line([object]$Value = '') {
  $lines.Add([string]$Value)
}

function Add-Section([string]$Title) {
  Add-Line
  Add-Line "=== $Title ==="
}

function Read-DefaultValue([string]$Path) {
  try {
    return Get-ItemPropertyValue -LiteralPath $Path -Name '(default)' -ErrorAction Stop
  } catch {
    return '<missing>'
  }
}

function Add-RegistryKey([string]$Label, [string]$Path) {
  Add-Line "$Label : $Path"
  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Line '  <missing>'
    return
  }
  try {
    $item = Get-ItemProperty -LiteralPath $Path -ErrorAction Stop
    $properties = $item.PSObject.Properties |
      Where-Object { $_.Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$' }
    if (-not $properties) { Add-Line '  <key exists with no values>' }
    foreach ($property in $properties) { Add-Line "  $($property.Name) = $($property.Value)" }
  } catch {
    Add-Line "  ERROR: $($_.Exception.Message)"
  }
}

try {
  $resolvedFile = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).Path
} catch {
  throw "Test file does not exist: $FilePath"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$extension = [System.IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()

Add-Line 'Schemy Windows Preview diagnostics'
Add-Line "Generated: $([DateTime]::Now.ToString('o'))"
Add-Line "User: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
$processArchitecture = if ([Environment]::Is64BitProcess) { '64-bit' } else { '32-bit' }
Add-Line "PowerShell: $($PSVersionTable.PSVersion) ($processArchitecture)"
Add-Line "Windows: $([Environment]::OSVersion.VersionString)"

Add-Section 'Test file'
$file = Get-Item -LiteralPath $resolvedFile
Add-Line "Path: $resolvedFile"
Add-Line "Extension: $extension"
Add-Line "Length: $($file.Length)"
Add-Line "Attributes: $($file.Attributes)"
$zoneStream = Get-Item -LiteralPath $resolvedFile -Stream Zone.Identifier -ErrorAction SilentlyContinue
Add-Line "Mark of the Web: $([bool]$zoneStream)"
if ($zoneStream) {
  Get-Content -LiteralPath $resolvedFile -Stream Zone.Identifier -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Line "  $_" }
}
try {
  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedFile))
  Add-Line "Drive: $($drive.Name) type=$($drive.DriveType) format=$($drive.DriveFormat) ready=$($drive.IsReady)"
} catch {
  Add-Line "Drive query error: $($_.Exception.Message)"
}

Add-Section 'Active file association'
$userChoicePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$extension\UserChoice"
$userChoice = try { Get-ItemPropertyValue -LiteralPath $userChoicePath -Name ProgId -ErrorAction Stop } catch { $null }
$extensionProgId = Read-DefaultValue "Registry::HKEY_CLASSES_ROOT\$extension"
$activeProgId = if ($userChoice) { $userChoice } elseif ($extensionProgId -ne '<missing>') { $extensionProgId } else { $null }
Add-Line "UserChoice ProgID: $(if ($userChoice) { $userChoice } else { '<none>' })"
Add-Line "HKCR extension ProgID: $extensionProgId"
Add-Line "Effective ProgID: $(if ($activeProgId) { $activeProgId } else { '<unknown>' })"
Add-RegistryKey 'HKCU extension' "Registry::HKEY_CURRENT_USER\Software\Classes\$extension"
Add-RegistryKey 'HKLM extension' "Registry::HKEY_LOCAL_MACHINE\Software\Classes\$extension"

Add-Section 'Preview-handler lookup paths'
Add-RegistryKey 'Extension preview' "Registry::HKEY_CLASSES_ROOT\$extension\shellex\$previewHandler"
Add-RegistryKey 'SystemFileAssociations preview' "Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\$extension\shellex\$previewHandler"
Add-RegistryKey 'SystemFileAssociations thumbnail' "Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\$extension\shellex\$thumbnailHandler"
if ($activeProgId) {
  Add-RegistryKey 'Active ProgID' "Registry::HKEY_CLASSES_ROOT\$activeProgId"
  Add-RegistryKey 'Active ProgID preview' "Registry::HKEY_CLASSES_ROOT\$activeProgId\shellex\$previewHandler"
}
Add-RegistryKey 'Schemy shared ProgID preview' "Registry::HKEY_CLASSES_ROOT\Minecraft Structure\shellex\$previewHandler"

Add-Section 'COM class and Preview Host'
$classPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$previewClsid"
Add-RegistryKey 'Preview CLSID' $classPath
Add-RegistryKey 'InprocServer32' "$classPath\InprocServer32"
Add-RegistryKey '64-bit PreviewHandlers list' 'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
Add-RegistryKey 'Per-user PreviewHandlers list' 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
Add-RegistryKey 'Preview Host AppID' 'Registry::HKEY_CLASSES_ROOT\AppID\{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}'
Add-RegistryKey 'Explorer preview setting' 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'

$dllPath = Read-DefaultValue "$classPath\InprocServer32"
if ($dllPath -and $dllPath -ne '<missing>') {
  Add-Line "DLL exists: $(Test-Path -LiteralPath $dllPath) ($dllPath)"
  if (Test-Path -LiteralPath $dllPath) {
    $signature = Get-AuthenticodeSignature -LiteralPath $dllPath
    Add-Line "DLL signature: $($signature.Status)"
  }
}

Add-Section 'Current processes'
try {
  $processes = Get-CimInstance Win32_Process -ErrorAction Stop |
    Where-Object { $_.Name -in 'prevhost.exe', 'Schemy.exe', 'explorer.exe' }
  if (-not $processes) { Add-Line '<none>' }
  foreach ($process in $processes) {
    Add-Line "$($process.Name) pid=$($process.ProcessId) command=$($process.CommandLine)"
  }
} catch {
  Add-Line "Process query error: $($_.Exception.Message)"
}

Add-Section 'Recent relevant Application events'
try {
  $events = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = (Get-Date).AddHours(-2) } -ErrorAction Stop |
    Where-Object {
      $_.ProviderName -in 'Application Error', 'Windows Error Reporting', 'Application Hang' -and
      $_.Message -match 'prevhost|Schemy|SchemyShell'
    } | Select-Object -First 20
  if (-not $events) { Add-Line '<none in the last two hours>' }
  foreach ($event in $events) {
    Add-Line "$($event.TimeCreated.ToString('o')) provider=$($event.ProviderName) id=$($event.Id)"
    Add-Line ($event.Message -replace "`r?`n", ' | ')
  }
} catch {
  Add-Line "Event-log query error: $($_.Exception.Message)"
}

$outputDirectory = Split-Path -Parent $resolvedOutput
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
[System.IO.File]::WriteAllLines($resolvedOutput, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Diagnostics written to $resolvedOutput"
