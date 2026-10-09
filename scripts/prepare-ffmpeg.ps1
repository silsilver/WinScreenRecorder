$ErrorActionPreference = 'Stop'

$archiveName = 'ffmpeg-N-127259-gb91a82d6dd-win64-lgpl.zip'
$downloadUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-09-14-16/ffmpeg-N-127259-gb91a82d6dd-win64-lgpl.zip'
$expectedSha256 = '0a9d0adfeb2c2008bdc08bdeb1953737c0eecb21ca7d98950ec30a016e442ea2'
$expectedBinarySha256 = '010447ce439d6631622818d73eed4f2f062fe1eac0944ed18db8f596a26c7575'
$expectedLicenseSha256 = 'da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$vendorDirectory = Join-Path $projectRoot 'vendor\ffmpeg'
$licensePath = Join-Path $projectRoot 'LICENSES\FFmpeg-BtbN.txt'
$provenancePath = Join-Path $vendorDirectory 'FFMPEG-PROVENANCE.txt'
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "winscreen-recorder-ffmpeg-$([guid]::NewGuid().ToString('N'))"
$vendorParent = Split-Path -Parent $vendorDirectory
$stagingDirectory = Join-Path $vendorParent ".ffmpeg-stage-$([guid]::NewGuid().ToString('N'))"
$backupDirectory = Join-Path $vendorParent ".ffmpeg-backup-$([guid]::NewGuid().ToString('N'))"
$hadExistingRuntime = $false

function Get-Sha256([string]$filePath) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $fileStream = [System.IO.File]::OpenRead($filePath)
    try {
        return [System.BitConverter]::ToString($sha.ComputeHash($fileStream)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $fileStream.Dispose()
        $sha.Dispose()
    }
}

New-Item -ItemType Directory -Path $vendorDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $tempDirectory | Out-Null
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null

try {
    $expectedProvenance = "tag=autobuild-2026-10-09-14-16`narchive=$archiveName`narchive-sha256=$expectedSha256`nffmpeg-sha256=$expectedBinarySha256"
    $cachedProvenance = if (Test-Path -LiteralPath $provenancePath) { Get-Content -LiteralPath $provenancePath -Raw } else { '' }
    $hasCachedExecutable = Test-Path -LiteralPath (Join-Path $vendorDirectory 'ffmpeg.exe')
    $hasCachedLicense = Test-Path -LiteralPath (Join-Path $vendorDirectory 'LICENSE.txt')
    $hasMatchingProvenance = $cachedProvenance.Trim() -eq $expectedProvenance
    $hasExpectedBinary = $hasCachedExecutable -and (Get-Sha256 (Join-Path $vendorDirectory 'ffmpeg.exe')) -eq $expectedBinarySha256
    $hasExpectedBuildLicense = $hasCachedLicense -and (Get-Sha256 (Join-Path $vendorDirectory 'LICENSE.txt')) -eq $expectedLicenseSha256
    $needsDownload = -not ($hasExpectedBinary -and $hasExpectedBuildLicense -and $hasMatchingProvenance)

    if ($needsDownload) {
        $archivePath = Join-Path $tempDirectory $archiveName
        $cachedArchive = Join-Path ([System.IO.Path]::GetTempPath()) 'winscreen-ffmpeg-lgpl.zip'
        if (Test-Path -LiteralPath $cachedArchive) {
            Copy-Item -LiteralPath $cachedArchive -Destination $archivePath -Force
        }
        else {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
        }

        $actualSha256 = Get-Sha256 $archivePath
        if ($actualSha256 -ne $expectedSha256) {
            throw "La suma SHA-256 de FFmpeg no coincide. Esperada: $expectedSha256; obtenida: $actualSha256."
        }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
        try {
            $binaryEntry = $archive.Entries | Where-Object { $_.FullName -match '/bin/ffmpeg\.exe$' } | Select-Object -First 1
            $archiveLicenseEntry = $archive.Entries | Where-Object { $_.FullName -match '/LICENSE\.txt$' } | Select-Object -First 1
            if (-not $binaryEntry -or -not $archiveLicenseEntry) {
                throw 'El archivo de FFmpeg no contiene ffmpeg.exe y su licencia.'
            }

            foreach ($entry in @(@($binaryEntry, 'ffmpeg.exe'), @($archiveLicenseEntry, 'LICENSE.txt'))) {
                $sourceStream = $entry[0].Open()
                $targetStream = [System.IO.File]::Create((Join-Path $stagingDirectory $entry[1]))
                try {
                    $sourceStream.CopyTo($targetStream)
                }
                finally {
                    $targetStream.Dispose()
                    $sourceStream.Dispose()
                }
            }
        }
        finally {
            $archive.Dispose()
        }

        $stagedBinary = Join-Path $stagingDirectory 'ffmpeg.exe'
        $stagedLicense = Join-Path $stagingDirectory 'LICENSE.txt'
        if ((Get-Sha256 $stagedBinary) -ne $expectedBinarySha256 -or (Get-Sha256 $stagedLicense) -ne $expectedLicenseSha256) {
            throw 'Los archivos extraídos de FFmpeg no coinciden con las sumas esperadas.'
        }
        Set-Content -LiteralPath (Join-Path $stagingDirectory 'FFMPEG-PROVENANCE.txt') -Value $expectedProvenance -Encoding ASCII
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
    }

    if (-not (Test-Path -LiteralPath $licensePath)) {
        throw 'Falta LICENSES\FFmpeg-BtbN.txt, necesario para distribuir FFmpeg.'
    }
    if ((Get-Sha256 $licensePath) -ne $expectedLicenseSha256) {
        throw 'El texto de licencia de FFmpeg no coincide con la compilación fijada.'
    }

    $ffmpegPath = Join-Path $vendorDirectory 'ffmpeg.exe'
    $versionOutput = (& $ffmpegPath -hide_banner -version 2>&1 | Out-String)
    if ((Get-Sha256 $ffmpegPath) -ne $expectedBinarySha256 -or $LASTEXITCODE -ne 0 -or $versionOutput -notmatch 'N-127259-gb91a82d6dd' -or $versionOutput -match '--enable-gpl(?:\s|$)|--enable-nonfree(?:\s|$)|--enable-libx264(?:\s|$)|--enable-libx265(?:\s|$)') {
        throw 'La compilación de FFmpeg no pasó la verificación LGPL o no se pudo ejecutar.'
    }
    $encoders = (& $ffmpegPath -hide_banner -encoders 2>&1 | Out-String)
    $demuxers = (& $ffmpegPath -hide_banner -demuxers 2>&1 | Out-String)
    $muxers = (& $ffmpegPath -hide_banner -muxers 2>&1 | Out-String)
    $filters = (& $ffmpegPath -hide_banner -filters 2>&1 | Out-String)
    if ($encoders -notmatch 'libopenh264' -or $encoders -notmatch '\baac\b' -or $demuxers -notmatch 'matroska,webm' -or $muxers -notmatch '\bgif\b' -or $muxers -notmatch '\bmatroska\b' -or $muxers -notmatch '\bmp4\b' -or $filters -notmatch 'palettegen' -or $filters -notmatch 'paletteuse') {
        throw 'La compilación de FFmpeg no incluye todas las funciones requeridas (WebM, H.264/AAC, MKV y GIF).'
    }

    Write-Host "FFmpeg LGPL preparado en vendor\ffmpeg (SHA-256 verificada y formatos comprobados)."
    if ($hadExistingRuntime) {
        Remove-Item -LiteralPath $backupDirectory -Recurse -Force
        $hadExistingRuntime = $false
    }
}
catch {
    if ($hadExistingRuntime -and (Test-Path -LiteralPath $backupDirectory)) {
        if (Test-Path -LiteralPath $vendorDirectory) { Remove-Item -LiteralPath $vendorDirectory -Recurse -Force }
        Move-Item -LiteralPath $backupDirectory -Destination $vendorDirectory
        $hadExistingRuntime = $false
    }
    throw
}
finally {
    if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue }
    if ($hadExistingRuntime -and (Test-Path -LiteralPath $backupDirectory)) { Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue }
    $resolvedTempDirectory = [System.IO.Path]::GetFullPath($tempDirectory)
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTempDirectory.StartsWith($resolvedSystemTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedTempDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
