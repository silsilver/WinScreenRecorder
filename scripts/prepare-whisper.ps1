$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$vendorParent = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor'))
if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'El runtime whisper.cpp solo se prepara dentro del proyecto en Windows x64.'
}
$vendorDirectory = Join-Path $vendorParent 'whisper'
$expectedHash = '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
$archiveName = 'whisper-bin-x64.zip'
$downloadUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip'
$provenance = "tag=b5454`narchive=$archiveName`narchive-sha256=$expectedHash"
$expectedFiles = @('whisper-cli.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu-x64.dll')
$markerPath = Join-Path $vendorDirectory 'WHISPER-PROVENANCE.txt'

function Get-Sha256([string]$filePath) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $fileStream = [System.IO.File]::OpenRead($filePath)
    try {
        return [System.BitConverter]::ToString($sha.ComputeHash($fileStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $fileStream.Dispose()
        $sha.Dispose()
    }
}

if ((Test-Path -LiteralPath $markerPath) -and (Get-Content -Raw -LiteralPath $markerPath).Trim() -eq $provenance) {
    $complete = $true
    foreach ($name in $expectedFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $vendorDirectory $name) -PathType Leaf)) { $complete = $false }
    }
    if ($complete) {
        Write-Host 'whisper.cpp b5454 ya está preparado.'
        exit 0
    }
}

$guid = [guid]::NewGuid().ToString('N')
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "winscreen-whisper-$guid"
$archivePath = Join-Path $tempDirectory $archiveName
$extractDirectory = Join-Path $tempDirectory 'extract'
$stagingDirectory = Join-Path $vendorParent ".whisper-stage-$guid"
$backupDirectory = Join-Path $vendorParent ".whisper-backup-$guid"
New-Item -ItemType Directory -Path $tempDirectory, $extractDirectory, $stagingDirectory -Force | Out-Null
$hadExistingRuntime = $false
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
    $actualHash = Get-Sha256 $archivePath
    if ($actualHash -ne $expectedHash) { throw "SHA-256 incorrecto para $archiveName." }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory
    $releaseDirectory = Join-Path $extractDirectory 'Release'
    foreach ($name in $expectedFiles) {
        $source = Join-Path $releaseDirectory $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "El paquete oficial no contiene $name." }
        Copy-Item -LiteralPath $source -Destination (Join-Path $stagingDirectory $name)
    }
    Set-Content -LiteralPath (Join-Path $stagingDirectory 'WHISPER-PROVENANCE.txt') -Value $provenance -Encoding ASCII

    if (Test-Path -LiteralPath $vendorDirectory) {
        Move-Item -LiteralPath $vendorDirectory -Destination $backupDirectory
        $hadExistingRuntime = $true
    }
    try {
        Move-Item -LiteralPath $stagingDirectory -Destination $vendorDirectory
    } catch {
        if ($hadExistingRuntime -and (Test-Path -LiteralPath $backupDirectory)) {
            Move-Item -LiteralPath $backupDirectory -Destination $vendorDirectory
            $hadExistingRuntime = $false
        }
        throw
    }
    if ($hadExistingRuntime) { Remove-Item -LiteralPath $backupDirectory -Recurse -Force }
    Write-Host 'whisper.cpp b5454 preparado; integridad verificada.'
} finally {
    if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
    if (Test-Path -LiteralPath $tempDirectory) { Remove-Item -LiteralPath $tempDirectory -Recurse -Force }
}
