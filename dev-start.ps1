#Requires -Version 5.1
<#
  dev-start.ps1 — Hotel Key local development launcher

  Usage:
    .\dev-start.ps1             # start all TypeScript services
    .\dev-start.ps1 -SkipBuild  # skip package build (faster restart)
    .\dev-start.ps1 -Service auth-service  # start one service only

  Prerequisites:
    - .env file in project root (copy .env.example and fill in values)
    - pnpm installed globally
    - Docker running (for postgres, redis, kafka, mongodb)
#>
param(
    [switch]$SkipBuild,
    [string]$Service = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$LogDir = Join-Path $Root "logs"
$EnvFile = Join-Path $Root ".env"

# ─── Colour helpers ──────────────────────────────────────────────────────────

function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("  " + ("─" * ($msg.Length))) -ForegroundColor DarkCyan
}

function Write-Ok([string]$msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-Info([string]$msg) { Write-Host "  [..] $msg"  -ForegroundColor Gray }

# ─── Service definitions ─────────────────────────────────────────────────────

# name | pnpm package filter | port | DATABASE_URL env var key
$AllServices = @(
    @{ Name="auth-service";            Package="auth-service";            Port=3001; DbVar="AUTH_DATABASE_URL" }
    @{ Name="guest-service";           Package="guest-service";           Port=3002; DbVar="GUEST_DATABASE_URL" }
    @{ Name="reservation-service";     Package="reservation-service";     Port=3003; DbVar="RESERVATION_DATABASE_URL" }
    @{ Name="room-service";            Package="room-service";            Port=3004; DbVar="ROOM_DATABASE_URL" }
    @{ Name="billing-service";         Package="billing-service";         Port=3005; DbVar="BILLING_DATABASE_URL" }
    @{ Name="housekeeping-service";    Package="housekeeping-service";    Port=3006; DbVar="HOUSEKEEPING_DATABASE_URL" }
    @{ Name="notification-service";    Package="notification-service";    Port=3007; DbVar="NOTIFICATION_DATABASE_URL" }
    @{ Name="pms-service";             Package="pms-service";             Port=3008; DbVar="PMS_DATABASE_URL" }
    @{ Name="maintenance-service";     Package="maintenance-service";     Port=3009; DbVar="MAINTENANCE_DATABASE_URL" }
    @{ Name="lock-service";            Package="lock-service";            Port=3010; DbVar="LOCK_DATABASE_URL" }
    @{ Name="channel-manager-service"; Package="channel-manager-service"; Port=3011; DbVar="CHANNEL_MANAGER_DATABASE_URL" }
    @{ Name="vault-service";           Package="vault-service";           Port=3012; DbVar="VAULT_DATABASE_URL" }
    @{ Name="consent-service";         Package="consent-service";         Port=3013; DbVar="CONSENT_DATABASE_URL" }
    @{ Name="webhook-service";         Package="webhook-service";         Port=3014; DbVar="WEBHOOK_DATABASE_URL" }
    @{ Name="integration-service";     Package="integration-service";     Port=3015; DbVar="INTEGRATION_DATABASE_URL" }
    @{ Name="bi-service";              Package="bi-service";              Port=3016; DbVar="BI_DATABASE_URL" }
)

# Required vars that must exist before any service starts
$RequiredVars = @(
    "JWT_PRIVATE_KEY_BASE64"
    "JWT_PUBLIC_KEY_BASE64"
    "MFA_ENCRYPTION_KEY"
    "REDIS_URL"
    "KAFKA_BROKERS"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "SES_FROM_ADDRESS"
    "MONGODB_URL"
    "ASSA_ABLOY_API_BASE_URL"
    "ASSA_ABLOY_API_KEY"
    "SITEMINDER_API_BASE_URL"
    "SITEMINDER_API_KEY"
    "SITEMINDER_WEBHOOK_SECRET"
    "ANTHROPIC_API_KEY"
)

# Per-service DATABASE_URL vars (all must exist)
foreach ($svc in $AllServices) {
    $RequiredVars += $svc.DbVar
}

# ─── Step 1: Load .env ────────────────────────────────────────────────────────

Write-Header "Loading environment"

if (-not (Test-Path $EnvFile)) {
    Write-Fail ".env not found at $EnvFile"
    Write-Fail "Copy .env.example to .env and fill in all values."
    exit 1
}

$EnvMap = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    # Strip surrounding quotes if present
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
        ($val.StartsWith("'") -and $val.EndsWith("'"))) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    $EnvMap[$key] = $val
    [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
}

Write-Ok "Loaded $($EnvMap.Count) variables from .env"

# ─── Step 2: Validate required vars ──────────────────────────────────────────

Write-Header "Validating environment variables"

$Missing = @()
foreach ($var in $RequiredVars) {
    $val = [System.Environment]::GetEnvironmentVariable($var, 'Process')
    if ([string]::IsNullOrWhiteSpace($val) -or
        $val -like "*<*>*" -or
        $val -eq "sk_test_<your-stripe-secret-key>" -or
        $val -eq "sk-ant-<your-anthropic-api-key>") {
        $Missing += $var
    }
}

if ($Missing.Count -gt 0) {
    Write-Fail "Missing or placeholder values for required variables:"
    foreach ($v in $Missing) { Write-Fail "  - $v" }
    Write-Fail "Update .env and retry."
    exit 1
}

Write-Ok "All required variables present"

# ─── Step 3: Create per-service .env files ────────────────────────────────────
# Each service's tsx --env-file .env needs a .env in its own directory.
# We write the root .env content into each service directory.

Write-Header "Propagating .env to service directories"

$ServiceDirs = Get-ChildItem -Path (Join-Path $Root "services") -Directory
foreach ($dir in $ServiceDirs) {
    $target = Join-Path $dir.FullName ".env"
    # Build a service-specific .env: shared vars + remap DATABASE_URL
    $lines = @()

    # Shared vars
    $SharedKeys = @(
        "NODE_ENV", "LOG_LEVEL", "REDIS_URL", "KAFKA_BROKERS",
        "JWT_PRIVATE_KEY_BASE64", "JWT_PUBLIC_KEY_BASE64",
        "JWT_ACCESS_TOKEN_TTL_SECONDS", "JWT_REFRESH_TOKEN_TTL_DAYS",
        "MFA_ENCRYPTION_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
        "ML_SERVICE_URL", "MONGODB_URL", "SES_FROM_ADDRESS",
        "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER",
        "VAULT_SERVICE_URL", "VAULT_ADDR", "VAULT_TOKEN", "ENCRYPTION_KEY",
        "FABRIC_GATEWAY_ENDPOINT", "FABRIC_MSP_ID",
        "FABRIC_CERT_PATH", "FABRIC_KEY_PATH", "FABRIC_TLS_CERT_PATH",
        "ASSA_ABLOY_API_BASE_URL", "ASSA_ABLOY_API_KEY",
        "SITEMINDER_API_BASE_URL", "SITEMINDER_API_KEY", "SITEMINDER_WEBHOOK_SECRET",
        "ANTHROPIC_API_KEY", "ROOM_SERVICE_URL", "RESERVATION_SERVICE_URL",
        "BILLING_SERVICE_URL", "OTEL_EXPORTER_OTLP_ENDPOINT",
        "LIGHTSPEED_API_KEY", "ORACLE_SIMPHONY_API_KEY", "SQUARE_API_KEY",
        "DORMAKABA_API_KEY", "SALTO_API_KEY", "CLOUDBEDS_API_KEY",
        "RATEGAIN_API_KEY", "GUESTLINE_API_KEY", "HIJIFFY_API_KEY",
        "WHISTLE_API_KEY", "OAKY_API_KEY", "ROOMDEX_API_KEY",
        "IDEAS_API_KEY", "DUETTO_API_KEY", "LODGISTICS_API_KEY",
        "M3_API_KEY", "ECOSMART_API_KEY", "WINNOW_API_KEY",
        "FAILURE_PREDICTION_THRESHOLD", "DELIVERY_MAX_RETRIES", "DELIVERY_TIMEOUT_MS"
    )
    foreach ($k in $SharedKeys) {
        $v = [System.Environment]::GetEnvironmentVariable($k, 'Process')
        if (-not [string]::IsNullOrEmpty($v)) { $lines += "$k=$v" }
    }

    # Map service-specific DATABASE_URL
    $svcDef = $AllServices | Where-Object { $_.Name -eq $dir.Name }
    if ($svcDef) {
        $dbUrl = [System.Environment]::GetEnvironmentVariable($svcDef.DbVar, 'Process')
        if ($dbUrl) { $lines += "DATABASE_URL=$dbUrl" }
    }

    [System.IO.File]::WriteAllLines($target, $lines, [System.Text.UTF8Encoding]::new($false))
}

Write-Ok "Service .env files written"

# ─── Step 4: Ensure logs directory ───────────────────────────────────────────

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# ─── Step 5: Build packages ───────────────────────────────────────────────────

if (-not $SkipBuild) {
    Write-Header "Building shared packages"
    Write-Info "Running: turbo run build --filter=@hotel-key/*"

    $buildArgs = @("run", "build", "--filter=@hotel-key/*")
    $buildProc = Start-Process -FilePath "pnpm" -ArgumentList $buildArgs `
        -WorkingDirectory $Root -NoNewWindow -PassThru -Wait

    if ($buildProc.ExitCode -ne 0) {
        Write-Fail "Package build failed (exit $($buildProc.ExitCode)). Fix build errors and retry."
        exit 1
    }
    Write-Ok "Packages built"
} else {
    Write-Warn "Skipping package build (-SkipBuild)"
}

# ─── Step 6: Start services ───────────────────────────────────────────────────

Write-Header "Starting services"

$Services = if ($Service) {
    $AllServices | Where-Object { $_.Name -eq $Service }
} else {
    $AllServices
}

if (-not $Services) {
    Write-Fail "Unknown service: $Service"
    Write-Fail "Valid names: $($AllServices.Name -join ', ')"
    exit 1
}

# Snapshot current env for background jobs
$EnvSnapshot = [System.Collections.Hashtable]::new()
[System.Environment]::GetEnvironmentVariables('Process').GetEnumerator() | ForEach-Object {
    $EnvSnapshot[$_.Key] = $_.Value
}

$Jobs = @{}

foreach ($svc in $Services) {
    $logFile  = Join-Path $LogDir "$($svc.Name).log"
    $errFile  = Join-Path $LogDir "$($svc.Name)-err.log"
    $svcDir   = Join-Path $Root "services" $svc.Name

    # Clear previous logs
    "" | Out-File -FilePath $logFile  -Encoding utf8
    "" | Out-File -FilePath $errFile  -Encoding utf8

    $job = Start-Job -Name $svc.Name -ScriptBlock {
        param($svcDir, $logFile, $errFile, $envSnapshot)

        # Apply env vars into this job's process environment
        foreach ($kv in $envSnapshot.GetEnumerator()) {
            [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process')
        }

        Set-Location $svcDir
        try {
            pnpm dev 2>$errFile | Out-File -FilePath $logFile -Encoding utf8 -Append
        } catch {
            $_ | Out-File -FilePath $errFile -Encoding utf8 -Append
        }
    } -ArgumentList $svcDir, $logFile, $errFile, $EnvSnapshot

    $Jobs[$svc.Name] = $job
    Write-Info "Started $($svc.Name) → logs/$($svc.Name).log  (port $($svc.Port))"
}

# ─── Step 7: Wait for startup ─────────────────────────────────────────────────

Write-Header "Waiting for services to start"

$startupTimeout = 60   # seconds total to wait
$pollInterval   = 3    # seconds between each round of health checks
$elapsed        = 0

$HealthStatus = @{}
foreach ($svc in $Services) { $HealthStatus[$svc.Name] = "STARTING" }

$allReady = $false
while ($elapsed -lt $startupTimeout -and -not $allReady) {
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval

    $pending = 0
    foreach ($svc in $Services) {
        if ($HealthStatus[$svc.Name] -ne "STARTING") { continue }

        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$($svc.Port)/health" `
                -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                $HealthStatus[$svc.Name] = "UP"
            } else {
                $pending++
            }
        } catch {
            $pending++
        }
    }

    $ready   = ($HealthStatus.Values | Where-Object { $_ -eq "UP" }).Count
    $total   = $Services.Count
    Write-Info "[${elapsed}s] $ready/$total ready..."

    if ($pending -eq 0) { $allReady = $true }
}

# Mark anything still STARTING as TIMEOUT
foreach ($svc in $Services) {
    if ($HealthStatus[$svc.Name] -eq "STARTING") {
        $HealthStatus[$svc.Name] = "TIMEOUT"
    }
}

# ─── Step 8: Status table ─────────────────────────────────────────────────────

Write-Host ""
Write-Host ("  {0,-30} {1,-5} {2,-10}" -f "SERVICE", "PORT", "HEALTH") -ForegroundColor White
Write-Host ("  {0,-30} {1,-5} {2,-10}" -f ("─" * 29), ("─" * 4), ("─" * 9)) -ForegroundColor DarkGray

foreach ($svc in $Services) {
    $status = $HealthStatus[$svc.Name]
    $colour = switch ($status) {
        "UP"      { "Green" }
        "TIMEOUT" { "Red" }
        default   { "Yellow" }
    }
    Write-Host ("  {0,-30} {1,-5} " -f $svc.Name, $svc.Port) -NoNewline
    Write-Host ("{0,-10}" -f $status) -ForegroundColor $colour
}

Write-Host ""

$upCount   = ($HealthStatus.Values | Where-Object { $_ -eq "UP" }).Count
$downCount = $Services.Count - $upCount

if ($downCount -gt 0) {
    Write-Warn "$downCount service(s) did not come up in ${startupTimeout}s."
    Write-Warn "Check logs in ./logs/<service-name>.log and ./logs/<service-name>-err.log"
} else {
    Write-Ok "All $upCount service(s) healthy."
}

Write-Host ""
Write-Info "Press Ctrl+C to stop all services."
Write-Host ""

# ─── Step 9: Keep running — forward job output and wait ──────────────────────

try {
    while ($true) {
        Start-Sleep -Seconds 5

        # Surface any jobs that exited unexpectedly
        foreach ($svc in $Services) {
            $job = $Jobs[$svc.Name]
            if ($null -eq $job) { continue }
            if ($job.State -in @("Failed", "Completed", "Stopped")) {
                Write-Warn "$($svc.Name) exited (state: $($job.State)). Check logs/$($svc.Name)-err.log"
                $Jobs[$svc.Name] = $null
            }
        }
    }
} finally {
    Write-Header "Stopping all services"
    foreach ($svc in $Services) {
        $job = $Jobs[$svc.Name]
        if ($job) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
            Write-Info "Stopped $($svc.Name)"
        }
    }
    Write-Ok "Done."
}
