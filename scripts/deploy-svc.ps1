param([string]$ServiceName)
$copilot = "C:\Users\emmat\bin\copilot-aws.exe"
Set-Location "C:\Users\emmat\hotel-key"
Write-Host "[$ServiceName] Starting deploy..."
& $copilot svc deploy --name $ServiceName --env demo
$code = $LASTEXITCODE
if ($code -eq 0) { Write-Host "[$ServiceName] SUCCESS" }
else             { Write-Host "[$ServiceName] FAILED (exit $code)" }
exit $code
