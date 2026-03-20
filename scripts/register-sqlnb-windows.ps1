# register-sqlnb-windows.ps1
#
# Registers the .sqlnb file extension on Windows via the registry.
# Double-clicking a .sqlnb file in Explorer will:
#   1. Copy the file to %USERPROFILE%\.sqlnotebook\drafts\current.sqlnb
#   2. Open http://localhost:8080 in your default browser
#      (start sql-notebook separately if it is not already running)
#
# Usage (run from the project root in PowerShell as your normal user):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\register-sqlnb-windows.ps1
#
# To unregister:
#   Remove-Item -Recurse "HKCU:\Software\Classes\.sqlnb"
#   Remove-Item -Recurse "HKCU:\Software\Classes\sqlnotebook.sqlnb.1"

$ErrorActionPreference = "Stop"

$draftDir  = "$env:USERPROFILE\.sqlnotebook\drafts"
$binDir    = "$env:LOCALAPPDATA\sql-notebook"
$launcher  = "$binDir\open-sqlnb.bat"

# ----- Launcher batch file -----
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $draftDir | Out-Null

@"
@echo off
REM Called by Windows Shell with the .sqlnb path as %1
SET FILE=%~f1
IF "%FILE%"=="" EXIT /B 1

REM Atomic copy: write to .tmp then rename
COPY /Y "%FILE%" "%USERPROFILE%\.sqlnotebook\drafts\current.sqlnb.tmp" >NUL
MOVE /Y "%USERPROFILE%\.sqlnotebook\drafts\current.sqlnb.tmp" "%USERPROFILE%\.sqlnotebook\drafts\current.sqlnb" >NUL

REM Open default browser
START "" "http://localhost:8080"
"@ | Set-Content -Encoding ASCII -Path $launcher

# ----- Registry entries (HKCU -- no admin needed) -----
$progId = "sqlnotebook.sqlnb.1"

# .sqlnb extension -> ProgID
New-Item -Force -Path "HKCU:\Software\Classes\.sqlnb" | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\.sqlnb" -Name "(default)" -Value $progId
Set-ItemProperty -Path "HKCU:\Software\Classes\.sqlnb" -Name "Content Type" -Value "application/x-sqlnotebook"

# ProgID -> description and icon
New-Item -Force -Path "HKCU:\Software\Classes\$progId" | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name "(default)" -Value "SQL Notebook"

New-Item -Force -Path "HKCU:\Software\Classes\$progId\DefaultIcon" | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\DefaultIcon" -Name "(default)" -Value "%SystemRoot%\System32\SHELL32.dll,1"

# ProgID -> open command
New-Item -Force -Path "HKCU:\Software\Classes\$progId\shell\open\command" | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\shell\open\command" `
    -Name "(default)" `
    -Value "`"$launcher`" `"%1`""

# Notify the shell so Explorer updates immediately (no reboot needed)
$code = @"
using System.Runtime.InteropServices;
public class Shell { [DllImport("shell32")] public static extern void SHChangeNotify(int e,uint f,System.IntPtr i,System.IntPtr j); }
"@
Add-Type -TypeDefinition $code
[Shell]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)

Write-Host ""
Write-Host "[OK] .sqlnb files are now associated with sql-notebook" -ForegroundColor Green
Write-Host "  Launcher: $launcher"
Write-Host ""
Write-Host "  To open a notebook:  double-click any .sqlnb file in Explorer"
Write-Host "  Make sure the server is running first:  sql-notebook (or gradlew run)"
