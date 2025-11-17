@echo off
echo ========================================
echo Racing Intelligence Companion
echo Installing Dependencies...
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js (64-bit) from https://nodejs.org/
    echo.
    echo Press any key to open the download page...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

REM Check if Node.js is 64-bit
for /f "tokens=*" %%a in ('node -p "process.arch"') do set ARCH=%%a
if not "%ARCH%"=="x64" (
    echo WARNING: Node.js is not 64-bit!
    echo The Racing Intelligence Companion requires 64-bit Node.js
    echo Current architecture: %ARCH%
    echo.
    echo Please install the 64-bit version from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js detected: 64-bit
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo Version: %NODE_VERSION%
echo.

echo Installing required packages...
echo This may take a few minutes...
echo.

call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Installation failed!
    echo Please check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Copy .env.example to .env
echo 2. Edit .env with your Supabase credentials
echo 3. Run start-live-telemetry.bat
echo.
echo Press any key to continue...
pause >nul
