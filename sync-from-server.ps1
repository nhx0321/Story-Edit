param(
    [string]$ServerHost = "39.107.119.182",
    [string]$ServerUser = "root",
    [string]$DatabaseHost = "127.0.0.1",
    [int]$DatabasePort = 5432,
    [string]$DatabaseName = "story_edit",
    [string]$DatabaseUser = "story_edit",
    [string]$DatabasePassword = "story_edit_dev",
    [string]$RemoteDumpPath = "/tmp/story_edit_core_sync.sql",
    [string]$LocalOutputPath = (Join-Path $PSScriptRoot "server_sync.sql"),
    [switch]$ImportToLocal,
    [switch]$UseLocalDocker,
    [string]$LocalDockerContainer = "story-edit-db",
    [string]$LocalDatabaseHost = "127.0.0.1",
    [int]$LocalDatabasePort = 5432,
    [string]$LocalDatabaseName = "story_edit",
    [string]$LocalDatabaseUser = "story_edit",
    [string]$LocalDatabasePassword = "story_edit_dev"
)

$ErrorActionPreference = "Stop"

function Assert-CommandExists {
    param([string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Missing command: $CommandName"
    }
}

function Invoke-Checked {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

$tables = @(
    "ai_configs",
    "templates",
    "user_groups",
    "ai_roles",
    "system_presets"
)

$resolvedLocalOutputPath = [System.IO.Path]::GetFullPath($LocalOutputPath)
$localOutputDirectory = Split-Path -Parent $resolvedLocalOutputPath
if (-not (Test-Path $localOutputDirectory)) {
    New-Item -ItemType Directory -Path $localOutputDirectory | Out-Null
}

Assert-CommandExists "ssh"
Assert-CommandExists "scp"

Write-Host "Starting server-to-local core data sync..." -ForegroundColor Cyan
Write-Host "  Server: ${ServerUser}@${ServerHost}" -ForegroundColor DarkGray
Write-Host "  Remote database: ${DatabaseUser}@${DatabaseHost}:$DatabasePort/$DatabaseName" -ForegroundColor DarkGray
Write-Host "  Tables: $($tables -join ', ')" -ForegroundColor DarkGray

$tableArgs = ($tables | ForEach-Object { "-t public.$_" }) -join ' '
$remoteDumpCommand = @(
    "set -euo pipefail",
    "PGPASSWORD='$DatabasePassword' pg_dump -h '$DatabaseHost' -p '$DatabasePort' -U '$DatabaseUser' -d '$DatabaseName' --data-only --inserts --column-inserts --no-owner --no-privileges $tableArgs > '$RemoteDumpPath'"
) -join '; '

Write-Host "Exporting data on remote host..." -ForegroundColor Yellow
Invoke-Checked -FilePath "ssh" -Arguments @("${ServerUser}@${ServerHost}", $remoteDumpCommand)

Write-Host "Downloading dump file..." -ForegroundColor Yellow
Invoke-Checked -FilePath "scp" -Arguments @("${ServerUser}@${ServerHost}:${RemoteDumpPath}", $resolvedLocalOutputPath)

Write-Host "Export complete: $resolvedLocalOutputPath" -ForegroundColor Green
Write-Host "Auto-import is disabled by default to avoid accidental overwrite." -ForegroundColor Cyan

if ($ImportToLocal) {
    if ($UseLocalDocker) {
        Assert-CommandExists "docker"
        Write-Host "Importing into local Docker PostgreSQL..." -ForegroundColor Yellow
        Get-Content -Path $resolvedLocalOutputPath | docker exec -i $LocalDockerContainer psql -U $LocalDatabaseUser -d $LocalDatabaseName
        if ($LASTEXITCODE -ne 0) {
            throw "Docker PostgreSQL import failed"
        }
    }
    else {
        Assert-CommandExists "psql"
        Write-Host "Importing into local host PostgreSQL..." -ForegroundColor Yellow
        $env:PGPASSWORD = $LocalDatabasePassword
        try {
            Invoke-Checked -FilePath "psql" -Arguments @(
                "-h", $LocalDatabaseHost,
                "-p", "$LocalDatabasePort",
                "-U", $LocalDatabaseUser,
                "-d", $LocalDatabaseName,
                "-f", $resolvedLocalOutputPath
            )
        }
        finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Local import complete." -ForegroundColor Green
}
else {
    Write-Host "Manual import example (host PostgreSQL):" -ForegroundColor Yellow
    Write-Host ("  `$env:PGPASSWORD = '{0}'" -f $LocalDatabasePassword) -ForegroundColor Gray
    Write-Host ('  psql -h {0} -p {1} -U {2} -d {3} -f "{4}"' -f $LocalDatabaseHost, $LocalDatabasePort, $LocalDatabaseUser, $LocalDatabaseName, $resolvedLocalOutputPath) -ForegroundColor Gray
    Write-Host ""
    Write-Host "Manual import example (local Docker PostgreSQL):" -ForegroundColor Yellow
    Write-Host ('  Get-Content -Path "{0}" | docker exec -i {1} psql -U {2} -d {3}' -f $resolvedLocalOutputPath, $LocalDockerContainer, $LocalDatabaseUser, $LocalDatabaseName) -ForegroundColor Gray
}

Write-Host "Note: the current real local database is the host PostgreSQL at localhost:5432/story_edit, not the empty Docker container." -ForegroundColor Cyan
