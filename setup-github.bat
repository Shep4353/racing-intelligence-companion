@echo off
echo ========================================
echo GitHub Repository Setup
echo Racing Intelligence Companion
echo ========================================
echo.

echo This script will help you set up the GitHub repository.
echo.
echo BEFORE RUNNING THIS:
echo 1. Create a new repository on GitHub.com
echo 2. Name it: racing-intelligence-companion
echo 3. DO NOT initialize with README (we have one)
echo 4. Copy the repository URL
echo.
echo ========================================
echo.

set /p REPO_URL="Enter your GitHub repository URL (e.g., https://github.com/username/racing-intelligence-companion.git): "

if "%REPO_URL%"=="" (
    echo ERROR: No URL provided!
    pause
    exit /b 1
)

echo.
echo Setting up Git repository...
echo.

REM Initialize git if needed
if not exist ".git" (
    git init
    echo Git repository initialized.
) else (
    echo Git repository already exists.
)

REM Add all files
git add .

REM Create initial commit
git commit -m "Initial commit - Racing Intelligence Companion v1.0.0" 2>nul

if %ERRORLEVEL% EQU 0 (
    echo Commit created successfully.
) else (
    echo Commit already exists or no changes to commit.
)

REM Add remote
git remote add origin %REPO_URL% 2>nul

if %ERRORLEVEL% EQU 0 (
    echo Remote 'origin' added.
) else (
    echo Remote 'origin' already exists. Updating URL...
    git remote set-url origin %REPO_URL%
)

REM Set main branch
git branch -M main

echo.
echo ========================================
echo Ready to Push!
echo ========================================
echo.
echo Next steps:
echo 1. Review the files that will be pushed
echo 2. Run: git push -u origin main
echo 3. Create a release tag: git tag v1.0.0
echo 4. Push the tag: git push origin v1.0.0
echo 5. GitHub will automatically build the .exe!
echo.
echo ========================================
echo.

choice /C YN /M "Do you want to push to GitHub now"

if errorlevel 2 goto :skip
if errorlevel 1 goto :push

:push
echo.
echo Pushing to GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Successfully pushed to GitHub!
    echo ========================================
    echo.
    echo Now create a release tag:
    echo   git tag v1.0.0
    echo   git push origin v1.0.0
    echo.
    echo GitHub Actions will build the .exe automatically!
) else (
    echo.
    echo ERROR: Push failed!
    echo Please check your GitHub credentials and try again.
)
goto :end

:skip
echo.
echo Skipped push. You can push manually later with:
echo   git push -u origin main
echo.

:end
pause
