param(
  [int]$Port = 9222,
  [string]$UserDataDir = "debug-chrome-profile"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"

if (-not (Test-Path (Join-Path $dist "manifest.json"))) {
  throw "dist\manifest.json 不存在，请先运行 npm run build"
}

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $chromeCandidates) {
  throw "没有找到 chrome.exe"
}

$chrome = $chromeCandidates[0]
$profile = if ([System.IO.Path]::IsPathRooted($UserDataDir)) {
  [System.IO.Path]::GetFullPath($UserDataDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $root $UserDataDir))
}
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$args = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  "--disable-extensions-except=$dist",
  "--load-extension=$dist",
  "https://chatgpt.com/"
)

Start-Process -FilePath $chrome -ArgumentList $args
Write-Host "Debug Chrome 已启动: http://127.0.0.1:$Port"
Write-Host "Profile: $profile"
