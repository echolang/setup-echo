# download (unless cached) and unpack the Windows Echo archive, then put bin on PATH.
# the zip is a toolchain (bin/echoc.exe plus clang, lld-link, lib, sysroot), not two binaries.
#
# env:
#   ECHO_VERSION  resolved tag, e.g. v0.3.0
#   ECHO_ASSET    archive filename, e.g. echo-windows-x86_64.zip
#   RUNNER_TEMP   download cache and extract parent
#   GITHUB_PATH / GITHUB_OUTPUT  set by Actions

$ErrorActionPreference = "Stop"

$Repo = "echolang/echo"

if (-not $env:ECHO_VERSION -or -not $env:ECHO_ASSET) {
    Write-Error "echo: ECHO_VERSION and ECHO_ASSET must be set."
    exit 1
}

$dl = Join-Path $env:RUNNER_TEMP "echo-dl"
$root = Join-Path $env:RUNNER_TEMP "echo"
$zip = Join-Path $dl $env:ECHO_ASSET
$url = "https://github.com/$Repo/releases/download/$($env:ECHO_VERSION)/$($env:ECHO_ASSET)"

New-Item -ItemType Directory -Force -Path $dl | Out-Null
New-Item -ItemType Directory -Force -Path $root | Out-Null

if (-not (Test-Path -LiteralPath $zip)) {
    Write-Host "downloading $($env:ECHO_ASSET) ..."
    $partial = "$zip.partial"
    try {
        curl.exe -fsSL -o $partial $url
        if ($LASTEXITCODE -ne 0) {
            throw "curl exit $LASTEXITCODE"
        }
    }
    catch {
        if (Test-Path -LiteralPath $partial) {
            Remove-Item -LiteralPath $partial -Force
        }
        Write-Error "echo: could not download $url`nsee https://github.com/$Repo/releases for what is available."
        exit 1
    }
    Move-Item -LiteralPath $partial -Destination $zip -Force
}
else {
    Write-Host "using cached $($env:ECHO_ASSET)"
}

tar.exe -xf $zip -C $root
if ($LASTEXITCODE -ne 0) {
    Write-Error "echo: failed to unpack $zip"
    exit 1
}

$bin = Join-Path $root "bin"
$echoc = Join-Path $bin "echoc.exe"
$epm = Join-Path $bin "epm.exe"
if (-not (Test-Path -LiteralPath $echoc) -or -not (Test-Path -LiteralPath $epm)) {
    Write-Error "echo: the downloaded archive does not contain bin\echoc.exe and bin\epm.exe."
    exit 1
}

if ($env:GITHUB_PATH) {
    Add-Content -Path $env:GITHUB_PATH -Value $bin -Encoding utf8
}
if ($env:GITHUB_OUTPUT) {
    Add-Content -Path $env:GITHUB_OUTPUT -Value "echo-dir=$bin" -Encoding utf8
}

Write-Host "installed echoc $echoc"
Write-Host "installed epm $epm"
