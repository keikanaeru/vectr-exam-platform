param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

function Step($text) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host $text
    Write-Host "============================================================"
}

function Run($cmd) {
    Write-Host "> $cmd"

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        Invoke-Expression $cmd
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousEap
    }

    if ($exitCode -ne 0) {
        throw "RELEASE STOPPED: command failed ($exitCode) -> $cmd"
    }
}

function Capture-Native {
    param(
        [Parameter(Mandatory=$true)]
        [scriptblock]$Command
    )

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        $output = & $Command 2>&1
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

Step "VECTR RELEASE PRE-FLIGHT"

if (-not (Test-Path "package.json")) {
    throw "Jalankan script dari root project VECTR."
}

$branch = (git branch --show-current).Trim()

if ($branch -ne "main") {
    throw "Current branch bukan main: $branch"
}

Write-Host "Branch : $branch"
Write-Host "Message: $Message"


Step "SECURITY GUARD"

$forbidden = @(
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "supabase/.temp",
    ".vercel"
)

$statusLines = @(git status --porcelain)

foreach ($line in $statusLines) {
    $path = $line.Substring(3).Trim('"')

    foreach ($bad in $forbidden) {
        if ($path -eq $bad -or $path.StartsWith("$bad/")) {
            throw "Forbidden file terdeteksi di Git changes: $path"
        }
    }
}

Write-Host "Secret/local-state guard: PASS"


Step "GIT DIFF CHECK"

Run "git diff --check"


Step "FORMAT CHECK"

Run "npm.cmd run format:check"


Step "SPELLCHECK"

Run "npm.cmd run spellcheck"


Step "DEAD CODE"

Run "npm.cmd run deadcode"


Step "FULL APP + DATABASE VERIFY"

Run "npm.cmd run verify"


Step "SUPABASE MIGRATION STATUS"

$dryRunResult = Capture-Native {
    npx.cmd supabase db push --dry-run
}

$dryRun = $dryRunResult.Output
$dryRun | ForEach-Object { Write-Host $_ }

if ($dryRunResult.ExitCode -ne 0) {
    throw "Supabase dry-run gagal (exit $($dryRunResult.ExitCode))."
}

$pending = @(
    $dryRun |
    Where-Object { $_ -match '^\s*[•\-]\s+(.+\.sql)\s*$' } |
    ForEach-Object {
        if ($_ -match '^\s*[•\-]\s+(.+\.sql)\s*$') {
            $Matches[1]
        }
    }
)

if ($pending.Count -gt 1) {
    Write-Host ""
    Write-Host "Pending migrations:"
    $pending | ForEach-Object { Write-Host " - $_" }

    throw "Lebih dari 1 migration pending. Review manual diperlukan."
}

if ($pending.Count -eq 1) {
    Write-Host ""
    Write-Host "Migration baru terdeteksi:"
    Write-Host "  $($pending[0])"

    Step "APPLY SINGLE SUPABASE MIGRATION"

    Run "npx.cmd supabase db push --yes"

    Step "VERIFY AFTER DATABASE MIGRATION"

    Run "npm.cmd run verify"

    $finalDryRunResult = Capture-Native {
        npx.cmd supabase db push --dry-run
    }

    $finalDryRun = $finalDryRunResult.Output
    $finalDryRun | ForEach-Object { Write-Host $_ }

    if ($finalDryRunResult.ExitCode -ne 0) {
        throw "Final Supabase dry-run gagal (exit $($finalDryRunResult.ExitCode))."
    }

    if (
        ($finalDryRun -join "`n") -notmatch
        'Remote database is up to date'
    ) {
        throw "Database belum terbukti up to date setelah migration."
    }

    Write-Host "Database: UP TO DATE"
}
else {
    Write-Host "Tidak ada migration baru."
}


Step "FINAL GIT STATUS"

$status = @(git status --porcelain)

if ($status.Count -eq 0) {
    Write-Host "Tidak ada perubahan untuk di-commit."
    Write-Host ""
    Write-Host "VECTR RELEASE CHECK PASS"
    exit 0
}

$status | ForEach-Object { Write-Host $_ }


Step "SAFE STAGING"

$files = New-Object System.Collections.Generic.List[string]

foreach ($line in $status) {
    $pathText = $line.Substring(3)

    if ($pathText -match ' -> ') {
        $pathText = ($pathText -split ' -> ')[-1]
    }

    $pathText = $pathText.Trim('"')

    if (
        $pathText.StartsWith("supabase/.temp/") -or
        $pathText.StartsWith(".vercel/") -or
        $pathText -eq ".env.local" -or
        $pathText -eq ".env"
    ) {
        continue
    }

    $files.Add($pathText)
}

if ($files.Count -eq 0) {
    throw "Tidak ada file aman untuk di-stage."
}

foreach ($file in $files) {
    git add -- "$file"

    if ($LASTEXITCODE -ne 0) {
        throw "Gagal stage: $file"
    }
}


Step "STAGED DIFF CHECK"

Run "git diff --cached --check"

git --no-pager diff --cached --stat


Step "COMMIT"

git commit -m "$Message"

if ($LASTEXITCODE -ne 0) {
    throw "Commit gagal."
}


Step "PUSH MAIN"

Run "git push origin main"


Step "FINAL LOCAL STATE"

$remaining = @(git status --porcelain)

if ($remaining.Count -gt 0) {
    Write-Host "WARNING: working tree masih punya perubahan:"
    $remaining | ForEach-Object { Write-Host $_ }
}
else {
    Write-Host "Working tree: CLEAN"
}

$commit = (git rev-parse --short HEAD).Trim()

Write-Host ""
Write-Host "============================================================"
Write-Host "VECTR RELEASE PASS"
Write-Host "============================================================"
Write-Host "Commit    : $commit"
Write-Host "Git       : PUSHED"
Write-Host "Database  : UP TO DATE"
Write-Host "Verify    : PASS"
Write-Host "Vercel    : deployment triggered by main push"
Write-Host "============================================================"
