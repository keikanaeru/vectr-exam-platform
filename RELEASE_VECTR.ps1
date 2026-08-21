param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message,

    [string]$ProductionUrl = $env:VECTR_PRODUCTION_URL,

    [int]$DeployTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

function Step {
    param([string]$Text)

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Text
    Write-Host "============================================================"
}

function Run-Native {
    param(
        [Parameter(Mandatory=$true)]
        [string]$File,

        [string[]]$ArgumentList = @()
    )

    Write-Host "> $File $($ArgumentList -join ' ')"

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        & $File @ArgumentList
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousEap
    }

    if ($exitCode -ne 0) {
        throw "RELEASE STOPPED: $File failed with exit code $exitCode"
    }
}

function Capture-Native {
    param(
        [Parameter(Mandatory=$true)]
        [string]$File,

        [string[]]$ArgumentList = @()
    )

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        $output = & $File @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousEap
    }

    return @{
        Output   = @($output)
        ExitCode = $exitCode
    }
}

function Get-StatusPaths {
    param([string]$Line)

    if ($Line.Length -lt 4) {
        return @()
    }

    $raw = $Line.Substring(3)

    if ($raw -match ' -> ') {
        return @(
            $raw -split ' -> ' |
            ForEach-Object {
                $_.Trim().Trim('"')
            }
        )
    }

    return @(
        $raw.Trim().Trim('"')
    )
}

function Wait-Vercel {
    param(
        [string]$Repository,
        [string]$Sha,
        [int]$TimeoutSeconds
    )

    Step "WAIT FOR VERCEL"

    $uri = "https://api.github.com/repos/$Repository/commits/$Sha/status"

    $headers = @{
        "User-Agent"           = "VECTR-Release-Runner"
        "Accept"               = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastState = ""

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod `
                -Uri $uri `
                -Headers $headers `
                -Method Get `
                -TimeoutSec 30

            $vercel = @(
                $response.statuses |
                Where-Object {
                    $_.context -like "Vercel*"
                }
            ) | Select-Object -First 1

            if ($null -eq $vercel) {
                if ($lastState -ne "waiting") {
                    Write-Host "Vercel: waiting for deployment status..."
                    $lastState = "waiting"
                }
            }
            else {
                $state = [string]$vercel.state

                if ($state -ne $lastState) {
                    Write-Host "Vercel: $state"

                    if ($vercel.target_url) {
                        Write-Host "Dashboard: $($vercel.target_url)"
                    }

                    $lastState = $state
                }

                switch ($state) {
                    "success" {
                        Write-Host "Vercel deployment: READY"
                        return
                    }

                    "failure" {
                        throw "Vercel deployment FAILED."
                    }

                    "error" {
                        throw "Vercel deployment ERROR."
                    }
                }
            }
        }
        catch {
            if (
                $_.Exception.Message -match
                "Vercel deployment (FAILED|ERROR)"
            ) {
                throw
            }

            Write-Host "Status API belum siap, retry..."
        }

        Start-Sleep -Seconds 20
    }

    throw "Timeout menunggu Vercel setelah $TimeoutSeconds detik."
}

function Test-Url {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -MaximumRedirection 5 `
            -TimeoutSec 25 `
            -Headers @{
                "User-Agent" = "VECTR-Release-Smoke"
                "Cache-Control" = "no-cache"
            }

        return (
            $response.StatusCode -ge 200 -and
            $response.StatusCode -lt 400
        )
    }
    catch {
        return $false
    }
}

function Resolve-ProductionUrl {
    param(
        [string]$Preferred,
        [string]$RepoName
    )

    Step "RESOLVE PRODUCTION URL"

    $candidates = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($Preferred)) {
        $candidates.Add(
            $Preferred.Trim().TrimEnd("/")
        )
    }

    # Standard Vercel production alias.
    $candidates.Add(
        "https://$RepoName.vercel.app"
    )

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        Write-Host "Testing: $candidate"

        if (Test-Url "$candidate/login") {
            Write-Host "Production URL: $candidate"
            return $candidate
        }
    }

    throw @"
Production URL tidak dapat ditemukan otomatis.

Set sekali dengan:
`$env:VECTR_PRODUCTION_URL = "https://DOMAIN-PRODUCTION-LU"

Lalu jalankan RELEASE_VECTR.ps1 lagi.
"@
}

function Smoke-Production {
    param([string]$BaseUrl)

    Step "PRODUCTION SMOKE TEST"

    $paths = @(
        "/",
        "/login",
        "/candidate/login"
    )

    foreach ($path in $paths) {
        $url = "$BaseUrl$path"

        Write-Host "GET $url"

        try {
            $response = Invoke-WebRequest `
                -Uri $url `
                -UseBasicParsing `
                -MaximumRedirection 5 `
                -TimeoutSec 30 `
                -Headers @{
                    "User-Agent" = "VECTR-Release-Smoke"
                    "Cache-Control" = "no-cache"
                }

            $status = [int]$response.StatusCode

            if ($status -lt 200 -or $status -ge 400) {
                throw "HTTP $status"
            }

            Write-Host "PASS [$status] $path"
        }
        catch {
            throw "Production smoke FAILED pada $url : $($_.Exception.Message)"
        }
    }

    Write-Host "Production smoke: PASS"
}



function Run-ProductionSafeE2E {
    param([string]$BaseUrl)

    Step "PRODUCTION PLAYWRIGHT SAFE E2E"

    if (-not (Test-Path ".env.e2e.local")) {
        throw ".env.e2e.local tidak ditemukan."
    }

    $oldBase = $env:E2E_BASE_URL
    $oldNoServer = $env:E2E_NO_WEBSERVER

    try {
        $env:E2E_BASE_URL = $BaseUrl
        $env:E2E_NO_WEBSERVER = "1"

        Write-Host "Target         : $BaseUrl"
        Write-Host "Local server   : DISABLED"
        Write-Host "Mutation tests : DISABLED"

        $result = Capture-Native "npm.cmd" @(
            "run",
            "test:e2e:safe",
            "--",
            "--workers=1",
            "--reporter=list"
        )

        $result.Output | ForEach-Object {
            Write-Host $_
        }

        $text = $result.Output -join "`n"

        if (
            $result.ExitCode -ne 0 -and
            $text -match "Executable doesn't exist"
        ) {
            Write-Host ""
            Write-Host "Chromium Playwright belum tersedia."
            Write-Host "Installing Chromium..."

            Run-Native "npx.cmd" @(
                "playwright",
                "install",
                "chromium"
            )

            $result = Capture-Native "npm.cmd" @(
                "run",
                "test:e2e:safe",
                "--",
                "--workers=1",
                "--reporter=list"
            )

            $result.Output | ForEach-Object {
                Write-Host $_
            }

            $text = $result.Output -join "`n"
        }

        if ($result.ExitCode -ne 0) {
            throw "Production Playwright safe E2E FAILED."
        }

        $passed = 0

        foreach (
            $match in [regex]::Matches(
                $text,
                '(?m)(\d+)\s+passed\b'
            )
        ) {
            $value = [int]$match.Groups[1].Value

            if ($value -gt $passed) {
                $passed = $value
            }
        }

        if ($passed -lt 2) {
            throw @"
Playwright exit 0 tetapi safe suite belum terbukti penuh.
Minimal wajib: admin login + candidate login = 2 passed.
Actual passed: $passed
"@
        }

        Write-Host ""
        Write-Host "Production safe E2E: PASS ($passed passed)"
    }
    finally {
        if ($null -eq $oldBase) {
            Remove-Item Env:E2E_BASE_URL `
                -ErrorAction SilentlyContinue
        }
        else {
            $env:E2E_BASE_URL = $oldBase
        }

        if ($null -eq $oldNoServer) {
            Remove-Item Env:E2E_NO_WEBSERVER `
                -ErrorAction SilentlyContinue
        }
        else {
            $env:E2E_NO_WEBSERVER = $oldNoServer
        }
    }
}


function Wait-GitHubQuality {
    param(
        [string]$Repository,
        [string]$Sha,
        [int]$TimeoutSeconds
    )

    Step "WAIT FOR GITHUB ACTIONS + LIGHTHOUSE"

    $headers = @{
        "User-Agent" = "VECTR-Release-Runner"
        "Accept" = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $run = $null
    $lastStatus = ""

    while ((Get-Date) -lt $deadline) {
        $uri = (
            "https://api.github.com/repos/" +
            "$Repository/actions/runs" +
            "?head_sha=$Sha&event=push&per_page=20"
        )

        try {
            $response = Invoke-RestMethod `
                -Uri $uri `
                -Headers $headers `
                -Method Get `
                -TimeoutSec 30
        }
        catch {
            Write-Host "GitHub API belum siap, retry..."
            Start-Sleep -Seconds 20
            continue
        }

        $run = @(
            $response.workflow_runs |
            Where-Object {
                $_.name -eq "VECTR Quality Gate" -and
                $_.head_sha -eq $Sha
            }
        ) | Select-Object -First 1

        if ($null -eq $run) {
            if ($lastStatus -ne "waiting") {
                Write-Host "Quality workflow belum muncul..."
                $lastStatus = "waiting"
            }

            Start-Sleep -Seconds 20
            continue
        }

        $state = "$($run.status)/$($run.conclusion)"

        if ($state -ne $lastStatus) {
            Write-Host "Workflow  : $($run.status)"
            Write-Host "Conclusion: $($run.conclusion)"
            Write-Host "Run       : $($run.html_url)"

            $lastStatus = $state
        }

        if ($run.status -eq "completed") {
            break
        }

        Start-Sleep -Seconds 20
    }

    if ($null -eq $run) {
        throw "VECTR Quality Gate tidak ditemukan untuk commit $Sha."
    }

    if ($run.status -ne "completed") {
        throw "Timeout menunggu GitHub Actions."
    }

    $jobsUri = (
        "https://api.github.com/repos/" +
        "$Repository/actions/runs/$($run.id)/jobs?per_page=100"
    )

    $jobsResponse = Invoke-RestMethod `
        -Uri $jobsUri `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 30

    $allJobsPassed = $true
    $lighthouseFound = $false
    $lighthousePassed = $false

    foreach ($job in $jobsResponse.jobs) {
        Write-Host ""
        Write-Host "JOB: $($job.name) [$($job.conclusion)]"

        if ($job.conclusion -ne "success") {
            $allJobsPassed = $false
        }

        foreach ($step in $job.steps) {
            $label = switch ($step.conclusion) {
                "success" { "[PASS]" }
                "skipped" { "[SKIP]" }
                default   { "[FAIL]" }
            }

            Write-Host "$label $($step.name)"

            if ($step.name -eq "Lighthouse CI") {
                $lighthouseFound = $true

                if ($step.conclusion -eq "success") {
                    $lighthousePassed = $true
                }
            }
        }
    }

    if ($run.conclusion -ne "success") {
        throw "GitHub VECTR Quality Gate FAILED."
    }

    if (-not $allJobsPassed) {
        throw "GitHub Actions memiliki job yang gagal."
    }

    if (-not $lighthouseFound) {
        throw "Lighthouse CI step tidak ditemukan."
    }

    if (-not $lighthousePassed) {
        throw "Lighthouse CI FAILED."
    }

    Write-Host ""
    Write-Host "GitHub Actions : PASS"
    Write-Host "Lighthouse CI  : PASS"
}

# ============================================================
# PRE-FLIGHT
# ============================================================

Step "VECTR RELEASE V3 PRE-FLIGHT"

if (-not (Test-Path "package.json")) {
    throw "Jalankan RELEASE_VECTR.ps1 dari root project."
}

$branch = (git branch --show-current).Trim()

if ($LASTEXITCODE -ne 0) {
    throw "Tidak dapat membaca Git branch."
}

if ($branch -ne "main") {
    throw "Release hanya boleh dari main. Current: $branch"
}

$origin = (git remote get-url origin).Trim()

if (
    $origin -notmatch
    'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$'
) {
    throw "GitHub origin tidak dikenali: $origin"
}

$repoOwner = $Matches.owner
$repoName = $Matches.repo
$repoFull = "$repoOwner/$repoName"

Write-Host "Repository : $repoFull"
Write-Host "Branch     : $branch"
Write-Host "Message    : $Message"


# ============================================================
# MAKE SURE MAIN IS NOT STALE
# ============================================================

Step "REMOTE SYNC CHECK"

Run-Native "git" @(
    "fetch",
    "origin",
    "main"
)

$localHead = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse origin/main).Trim()

if ($localHead -ne $remoteHead) {
    throw @"
Local main tidak sama dengan origin/main.

Local : $localHead
Remote: $remoteHead

Sync/review dulu sebelum release.
"@
}

Write-Host "Local main = origin/main: PASS"


# ============================================================
# SECURITY GUARD
# ============================================================

Step "SECURITY GUARD"

$trackedSensitive = @(
    git ls-files -- `
        ".env" `
        ".env.local" `
        ".env.production" `
        ".env.development"
)

if ($trackedSensitive.Count -gt 0) {
    throw "Sensitive env file tracked Git: $($trackedSensitive -join ', ')"
}

$statusLines = @(
    git status --porcelain --untracked-files=all
)

$forbiddenPrefixes = @(
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "supabase/.temp",
    ".vercel"
)

foreach ($line in $statusLines) {
    foreach ($path in (Get-StatusPaths $line)) {
        $normalized = $path.Replace("\", "/")

        foreach ($bad in $forbiddenPrefixes) {
            if (
                $normalized -eq $bad -or
                $normalized.StartsWith("$bad/")
            ) {
                throw "Forbidden local file terdeteksi: $path"
            }
        }
    }
}

Write-Host "Secret/local-state guard: PASS"


# ============================================================
# QUALITY GATES
# ============================================================

Step "GIT DIFF CHECK"
Run-Native "git" @("diff", "--check")

Step "FORMAT CHECK"
Run-Native "npm.cmd" @("run", "format:check")

Step "SPELLCHECK"
Run-Native "npm.cmd" @("run", "spellcheck")

Step "DEAD CODE"
Run-Native "npm.cmd" @("run", "deadcode")

Step "FULL APP + DATABASE VERIFY"
Run-Native "npm.cmd" @("run", "verify")


# ============================================================
# SUPABASE
# ============================================================

Step "SUPABASE MIGRATION STATUS"

$dryRunResult = Capture-Native `
    "npx.cmd" `
    @(
        "supabase",
        "db",
        "push",
        "--dry-run"
    )

$dryRun = $dryRunResult.Output

$dryRun | ForEach-Object {
    Write-Host $_
}

if ($dryRunResult.ExitCode -ne 0) {
    throw "Supabase dry-run gagal."
}

$pending = @(
    $dryRun |
    Where-Object {
        $_ -match '^\s*[•\-]\s+(.+\.sql)\s*$'
    } |
    ForEach-Object {
        if (
            $_ -match
            '^\s*[•\-]\s+(.+\.sql)\s*$'
        ) {
            $Matches[1]
        }
    }
)

if ($pending.Count -gt 1) {
    Write-Host "Pending migrations:"

    $pending | ForEach-Object {
        Write-Host " - $_"
    }

    throw "Lebih dari satu migration pending. Manual review required."
}

if ($pending.Count -eq 1) {
    Write-Host ""
    Write-Host "Single migration detected:"
    Write-Host " - $($pending[0])"

    Step "APPLY SINGLE MIGRATION"

    Run-Native "npx.cmd" @(
        "supabase",
        "db",
        "push",
        "--yes"
    )

    Step "POST-MIGRATION VERIFY"

    Run-Native "npm.cmd" @(
        "run",
        "verify"
    )

    $finalDryResult = Capture-Native `
        "npx.cmd" `
        @(
            "supabase",
            "db",
            "push",
            "--dry-run"
        )

    $finalDry = $finalDryResult.Output

    $finalDry | ForEach-Object {
        Write-Host $_
    }

    if ($finalDryResult.ExitCode -ne 0) {
        throw "Final Supabase dry-run gagal."
    }

    if (
        ($finalDry -join "`n") -notmatch
        "Remote database is up to date"
    ) {
        throw "Database belum up to date setelah migration."
    }
}
elseif (
    ($dryRun -join "`n") -notmatch
    "Remote database is up to date"
) {
    throw "Tidak dapat memastikan status migration Supabase."
}

Write-Host "Database: UP TO DATE"


# ============================================================
# DETERMINE CHANGES
# ============================================================

Step "FINAL GIT STATUS"

$status = @(
    git status --porcelain --untracked-files=all
)

if ($status.Count -eq 0) {
    Write-Host "Tidak ada perubahan untuk di-commit."

    $prod = Resolve-ProductionUrl `
        $ProductionUrl `
        $repoName

    Smoke-Production $prod

    Run-ProductionSafeE2E $prod

    $currentCommit = (git rev-parse HEAD).Trim()

    Wait-GitHubQuality `
        $repoFull `
        $currentCommit `
        $DeployTimeoutSeconds

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "VECTR RELEASE CHECK PASS"
    Write-Host "============================================================"
    Write-Host "Git        : NO CHANGES"
    Write-Host "Database   : UP TO DATE"
    Write-Host "Quality    : PASS"
    Write-Host "Smoke      : PASS"
    Write-Host "Playwright : PASS"
    Write-Host "CI         : PASS"
    Write-Host "Lighthouse : PASS"
    Write-Host "============================================================"

    exit 0
}

$status | ForEach-Object {
    Write-Host $_
}


# ============================================================
# SAFE STAGING
# ============================================================

Step "SAFE STAGING"

$files = New-Object System.Collections.Generic.List[string]

foreach ($line in $status) {
    foreach ($path in (Get-StatusPaths $line)) {
        if (-not [string]::IsNullOrWhiteSpace($path)) {
            if (-not $files.Contains($path)) {
                $files.Add($path)
            }
        }
    }
}

if ($files.Count -eq 0) {
    throw "Tidak ada file aman untuk stage."
}

foreach ($file in $files) {
    Run-Native "git" @(
        "add",
        "--",
        $file
    )
}


# ============================================================
# STAGED SECURITY CHECK
# ============================================================

Step "STAGED DIFF CHECK"

Run-Native "git" @(
    "diff",
    "--cached",
    "--check"
)

$stagedFiles = @(
    git diff --cached --name-only
)

foreach ($file in $stagedFiles) {
    $normalized = $file.Replace("\", "/")

    foreach ($bad in $forbiddenPrefixes) {
        if (
            $normalized -eq $bad -or
            $normalized.StartsWith("$bad/")
        ) {
            throw "Forbidden file staged: $file"
        }
    }
}

git --no-pager diff --cached --stat


# ============================================================
# COMMIT
# ============================================================

Step "COMMIT"

& git commit -m "$Message"

if ($LASTEXITCODE -ne 0) {
    throw "Commit gagal."
}

$commitFull = (git rev-parse HEAD).Trim()
$commitShort = (git rev-parse --short HEAD).Trim()


# ============================================================
# PUSH
# ============================================================

Step "PUSH MAIN"

Run-Native "git" @(
    "push",
    "origin",
    "main"
)


# ============================================================
# WAIT FOR PRODUCTION DEPLOYMENT
# ============================================================

Wait-Vercel `
    $repoFull `
    $commitFull `
    $DeployTimeoutSeconds


# ============================================================
# PRODUCTION SMOKE
# ============================================================

$prodUrl = Resolve-ProductionUrl `
    $ProductionUrl `
    $repoName

Smoke-Production $prodUrl


# ============================================================
# PRODUCTION SAFE E2E
# ============================================================

Run-ProductionSafeE2E $prodUrl


# ============================================================
# GITHUB ACTIONS + LIGHTHOUSE
# ============================================================

Wait-GitHubQuality `
    $repoFull `
    $commitFull `
    $DeployTimeoutSeconds


# ============================================================
# FINAL STATE
# ============================================================

Step "FINAL LOCAL STATE"

$remaining = @(
    git status --porcelain --untracked-files=all
)

if ($remaining.Count -gt 0) {
    $remaining | ForEach-Object {
        Write-Host $_
    }

    throw "Working tree tidak clean setelah release."
}

Write-Host "Working tree: CLEAN"


Write-Host ""
Write-Host "============================================================"
Write-Host "VECTR PRODUCTION RELEASE PASS"
Write-Host "============================================================"
Write-Host "Commit     : $commitShort"
Write-Host "Git        : PUSHED"
Write-Host "Database   : UP TO DATE"
Write-Host "Quality    : PASS"
Write-Host "Vercel     : READY"
Write-Host "Production : $prodUrl"
Write-Host "Smoke      : PASS"
Write-Host "Playwright : PASS"
Write-Host "CI         : PASS"
Write-Host "Lighthouse : PASS"
Write-Host "============================================================"