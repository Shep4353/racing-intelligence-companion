@echo off
echo ========================================
echo Building Racing Intelligence Companion
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Building standalone executable...
echo This may take a few minutes...
echo.

call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo The executable is located at:
echo   dist\RacingIntelligenceCompanion.exe
echo.
echo You can distribute this .exe file to users
echo No Node.js installation required!
echo.
pause
