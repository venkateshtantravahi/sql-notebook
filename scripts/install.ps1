# install.ps1 -- Install sql-notebook as a CLI command on Windows.
#
# After running this script you can do (in any terminal):
#   sql-notebook                      # open workspace in CWD
#   sql-notebook C:\projects\myapp    # open workspace in a specific directory
#   sql-notebook path\to\file.sqlnb   # open a specific notebook file
#
# The script:
#   1. Builds the Gradle distribution (.\gradlew.bat installDist)
#   2. Installs it to %LOCALAPPDATA%\sql-notebook\
#   3. Creates a sql-notebook.bat wrapper in %LOCALAPPDATA%\sql-notebook\bin\
#   4. Adds that bin directory to your user PATH
#
# Usage (run from the project root in PowerShell):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\install.ps1
#
# To uninstall:
#   Remove-Item -Recurse "$env:LOCALAPPDATA\sql-notebook"
#   Then remove it from your user PATH via System Properties -> Environment Variables

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$InstallDir = "$env:LOCALAPPDATA\sql-notebook"
$BinDir     = "$InstallDir\bin"

Write-Host "Building sql-notebook distribution..."
Push-Location $ProjectDir
& ".\gradlew.bat" installDist -q
Pop-Location
Write-Host "[OK] Build complete"

$Dist = "$ProjectDir\sql-notebook-core\build\install\sql-notebook-core"
if (-not (Test-Path $Dist)) {
    Write-Error "Distribution not found at $Dist"
    exit 1
}

Write-Host "Installing to $InstallDir ..."
if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
Copy-Item -Recurse $Dist $InstallDir

# Write a thin .bat wrapper
$wrapper = @"
@echo off
REM sql-notebook launcher -- pass all arguments through to the JVM
"%~dp0sql-notebook-core.bat" %*
"@
Set-Content -Encoding ASCII -Path "$BinDir\sql-notebook.bat" -Value $wrapper

# Add to user PATH if not already present
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$BinDir", "User")
    Write-Host "[OK] Added $BinDir to user PATH"
    Write-Host "  Open a new terminal for the change to take effect"
} else {
    Write-Host "[OK] $BinDir already in PATH"
}

Write-Host ""
Write-Host "[OK] sql-notebook installed successfully" -ForegroundColor Green
Write-Host ""
Write-Host "  Usage:"
Write-Host "    sql-notebook                       # open workspace in current directory"
Write-Host "    sql-notebook C:\projects\myapp     # open a specific workspace"
Write-Host "    sql-notebook my-notebook.sqlnb     # open a specific notebook"
Write-Host ""
Write-Host "  The app opens at http://localhost:8080"
