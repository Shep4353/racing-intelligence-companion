# Racing Intelligence Companion - Distribution Guide

This guide explains how to package and distribute the Racing Intelligence Companion app to users.

## Overview

The Racing Intelligence Companion is a desktop application that runs alongside iRacing and streams telemetry data to the OPR Intelligence web application. Users need to download and run this app on their local machine.

## Distribution Options

### Option 1: GitHub Releases (Recommended)

1. **Create a GitHub Repository**
   ```bash
   # Initialize git in the service directory
   cd iracing-telemetry-service
   git init
   git add .
   git commit -m "Initial release of Racing Intelligence Companion v1.0.0"
   ```

2. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/racing-intelligence-companion.git
   git push -u origin main
   ```

3. **Create a Release**
   - Go to GitHub → Releases → Create new release
   - Tag: `v1.0.0`
   - Title: `Racing Intelligence Companion v1.0.0`
   - Upload a ZIP of the entire `iracing-telemetry-service` folder
   - Include setup instructions in release notes

### Option 2: Package as Executable (Advanced)

Use `pkg` to create a standalone executable:

```bash
npm install -g pkg

# Package for Windows
pkg . --targets node16-win-x64 --output racing-intelligence-companion.exe
```

Create a `pkg` config in `package.json`:
```json
{
  "bin": "src/index.js",
  "pkg": {
    "assets": [
      "src/**/*"
    ],
    "targets": [
      "node16-win-x64"
    ]
  }
}
```

### Option 3: Installer Package

Use tools like:
- **Inno Setup** (Windows installer)
- **NSIS** (Nullsoft Scriptable Install System)
- **Electron Builder** (if converting to Electron app)

## Simple Distribution (ZIP Package)

For quick distribution, create a ZIP file:

1. **Create distribution folder:**
   ```bash
   mkdir racing-intelligence-companion-v1.0.0
   cp -r iracing-telemetry-service/* racing-intelligence-companion-v1.0.0/
   ```

2. **Remove development files:**
   ```bash
   cd racing-intelligence-companion-v1.0.0
   rm -rf node_modules
   rm .env  # Don't include user's credentials
   ```

3. **Create README for users:**
   Create `QUICK_START.md` with simple instructions

4. **Compress to ZIP:**
   ```bash
   zip -r racing-intelligence-companion-v1.0.0.zip racing-intelligence-companion-v1.0.0
   ```

## User Installation Steps

Include these steps in your distribution:

### Quick Start for Users

1. **Download the companion app**
   - Download `racing-intelligence-companion-v1.0.0.zip`
   - Extract to a permanent location (e.g., `C:\RacingIntelligence\`)

2. **Install Node.js**
   - Download from: https://nodejs.org/ (64-bit version)
   - Run installer with default settings
   - Restart your computer

3. **Install dependencies**
   - Open the folder in File Explorer
   - Double-click `install-dependencies.bat` (create this file)

4. **Configure Supabase**
   - Copy `.env.example` to `.env`
   - Edit `.env` with Notepad
   - Add your Supabase credentials (provided by OPR Intelligence)

5. **Run the companion app**
   - Double-click `start-live-telemetry.bat`
   - Keep the window open while using iRacing
   - Launch iRacing and join a session

## Helper Scripts for Users

### install-dependencies.bat

```batch
@echo off
echo ========================================
echo Racing Intelligence Companion
echo Installing Dependencies...
echo ========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Installing required packages...
call npm install

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Copy .env.example to .env
echo 2. Edit .env with your credentials
echo 3. Run start-live-telemetry.bat
echo.
pause
```

### QUICK_START.txt

```
RACING INTELLIGENCE COMPANION - Quick Start Guide
===================================================

What is this?
This companion app runs on your computer alongside iRacing and streams
real-time telemetry data to the OPR Intelligence web application.

Requirements:
- Windows (64-bit)
- Node.js 16 or later (64-bit)
- iRacing subscription

Installation:
1. Install Node.js from https://nodejs.org/ (if not already installed)
2. Run "install-dependencies.bat"
3. Copy ".env.example" to ".env"
4. Edit ".env" and add your Supabase credentials
5. Run "start-live-telemetry.bat"

Usage:
1. Start the companion app (start-live-telemetry.bat)
2. Launch iRacing and join a session
3. Open the Live Calculator in your web browser
4. See real-time fuel data and pit strategy!

Troubleshooting:
- Make sure Node.js is 64-bit: Open CMD and run "node -p process.arch"
  (should show "x64")
- If iRacing won't connect, make sure you're in the car during a session
- Check that port 8080 is not blocked by firewall

Support:
For help and updates, visit: https://github.com/your-repo/racing-intelligence-companion
```

## Update the Web App Download Link

Update the Live Calculator page with the actual download URL:

```typescript
<Button variant="default" size="sm" asChild>
  <a href="https://github.com/YOUR_USERNAME/racing-intelligence-companion/releases/latest"
     target="_blank"
     rel="noopener noreferrer">
    <Download className="h-4 w-4 mr-2" />
    Download Companion App
  </a>
</Button>
```

## Automatic Updates (Future Enhancement)

Consider adding auto-update functionality:

1. **Version Check Endpoint**
   ```javascript
   app.get('/version', (req, res) => {
     res.json({ version: '1.0.0' });
   });
   ```

2. **Check on Startup**
   ```javascript
   const currentVersion = '1.0.0';
   const latestVersion = await fetch('https://api.github.com/repos/USER/REPO/releases/latest');
   // Notify user if update available
   ```

## Security Considerations

1. **Don't Include Credentials**
   - Never include `.env` file in distribution
   - Users should create their own `.env`

2. **Code Signing** (Professional Distribution)
   - Sign executables with a code signing certificate
   - Prevents Windows SmartScreen warnings

3. **Checksum Verification**
   - Provide SHA256 checksums for downloads
   - Users can verify integrity

## Distribution Checklist

- [ ] Remove `.env` file
- [ ] Remove `node_modules` folder
- [ ] Include `.env.example`
- [ ] Include `README.md`
- [ ] Include `QUICK_START.txt`
- [ ] Include `install-dependencies.bat`
- [ ] Include `start-live-telemetry.bat`
- [ ] Test on clean Windows installation
- [ ] Create GitHub release
- [ ] Update web app download URL
- [ ] Document version number

## Recommended GitHub Release Structure

```
racing-intelligence-companion-v1.0.0.zip
├── src/
│   ├── index.js
│   └── services/
├── .env.example
├── .gitignore
├── package.json
├── QUICK_START.txt
├── README.md
├── install-dependencies.bat
└── start-live-telemetry.bat
```

## Release Notes Template

```markdown
## Racing Intelligence Companion v1.0.0

### Features
- Real-time iRacing telemetry streaming
- Fuel level and consumption tracking
- Lap timing and history
- Pit stop detection
- WebSocket streaming to web app
- Optional Supabase cloud storage

### Requirements
- Windows (64-bit)
- Node.js 16+ (64-bit)
- iRacing subscription

### Installation
1. Download and extract the ZIP file
2. Install Node.js from https://nodejs.org/
3. Run `install-dependencies.bat`
4. Configure `.env` with your credentials
5. Run `start-live-telemetry.bat`

### What's New
- Initial release

### Known Issues
- None

### Support
Report issues: https://github.com/YOUR_USERNAME/racing-intelligence-companion/issues
```

## Next Steps

1. Create a GitHub repository for the companion app
2. Set up GitHub Releases
3. Update the web app with the actual download URL
4. Write user documentation
5. Consider creating video tutorials
6. Set up support channels (Discord, GitHub Issues)
