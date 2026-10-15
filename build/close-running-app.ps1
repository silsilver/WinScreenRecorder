[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [switch]$CheckOnly,
    [ValidateRange(1, 120)][int]$WaitSeconds = 45
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
    $targetPath = [IO.Path]::GetFullPath($AppPath)
    $targetName = [IO.Path]::GetFileName($targetPath)
    if ($targetName -ne 'WinScreen Recorder.exe') { exit 22 }
    $escapedName = $targetName.Replace("'", "''")

    function Get-TargetProcesses {
        $candidates = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='$escapedName'")
        $matches = @()
        foreach ($candidate in $candidates) {
            $candidatePath = $candidate.ExecutablePath
            if (-not $candidatePath) {
                $liveProcess = Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
                if (-not $liveProcess) { continue }
                $candidatePath = $liveProcess.Path
                if (-not $candidatePath) {
                    if ($liveProcess.HasExited) { continue }
                    throw 'No se pudo comprobar la ubicación de un proceso.'
                }
            }
            if ([string]::Equals([IO.Path]::GetFullPath($candidatePath), $targetPath, [StringComparison]::OrdinalIgnoreCase)) {
                $matches += $candidate
            }
        }
        return $matches
    }

    $running = @(Get-TargetProcesses)
    if ($running.Count -eq 0) { exit 0 }
    if ($CheckOnly) { exit 10 }

    $supportPath = Join-Path (Split-Path -Parent $targetPath) 'resources\update-support.json'
    if (-not (Test-Path -LiteralPath $supportPath -PathType Leaf)) { exit 20 }
    $support = Get-Content -LiteralPath $supportPath -Raw | ConvertFrom-Json
    if ($support.schemaVersion -ne 1 -or $support.gracefulShutdown -ne $true -or $support.requestArgument -ne '--prepare-for-update') { exit 20 }

    # The installed application receives the request through its own instance lock.
    # Never terminate processes forcibly or address another executable by name alone.
    $requestProcess = Start-Process -FilePath $targetPath -ArgumentList '--prepare-for-update' -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
    do {
        Start-Sleep -Milliseconds 250
        $running = @(Get-TargetProcesses)
        if ($running.Count -eq 0) { exit 0 }
    } while ([DateTime]::UtcNow -lt $deadline)
    exit 21
} catch {
    Write-Verbose $_.Exception.Message
    Write-Output 'No se pudo comprobar el cierre de la aplicación.'
    exit 22
}
