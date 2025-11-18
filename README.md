# Racing Intelligence Companion

A lightweight companion app that streams live iRacing telemetry to the OPR Intelligence web application.

## For Users

### Download & Install

1. **Download** the latest `RacingIntelligenceCompanion.exe` from the releases page
2. **Double-click** to run - that's it!
3. **Open** the Live Calculator page in OPR Intelligence
4. **Launch iRacing** and join a session

No installation, no configuration, no Node.js required!

### What It Does

- Connects to iRacing on your computer
- Streams real-time telemetry to your web browser
- Shows fuel levels, lap times, pit stop predictions
- Completely automatic - just run and race!

### Requirements

- **Windows** (64-bit) - iRacing requirement
- **iRacing** subscription
- That's it!

### Troubleshooting

**Problem:** "iRacing: Not Connected"
**Solution:** Make sure you're IN THE CAR during a session (not in menus)

**Problem:** Windows shows security warning
**Solution:** Click "More info" → "Run anyway" (the app is safe, just unsigned)

**Problem:** Web page won't connect
**Solution:** Make sure the companion app is running and check firewall settings

---

## For Developers

### Building from Source

If you want to build the executable yourself:

1. **Install Node.js** (64-bit) from https://nodejs.org/
2. **Clone this repository**
3. **Run the build script:**
   ```bash
   build.bat
   ```
4. Find the executable in `dist/RacingIntelligenceCompanion.exe`

### Development

```bash
npm install
npm start
```

### How It Works

```
iRacing (Shared Memory)
  ↓
node-irsdk
  ↓
WebSocket Server (port 8081)
  ↓
OPR Intelligence Web App
```

The companion app:
1. Connects to iRacing via the SDK (shared memory)
2. Extracts telemetry data 10 times per second
3. Broadcasts to web browsers via WebSocket
4. No database, no cloud - just direct streaming!

### Architecture

- **Minimal dependencies:** Only `node-irsdk` and `ws`
- **No configuration:** Works out of the box
- **No database:** Data only lives in memory
- **Standalone:** Packaged as single .exe with `pkg`

### WebSocket API

Connect to `ws://localhost:8081`

**Message Types:**
- `connection_status` - Initial state
- `iracing_connected` - iRacing launched
- `iracing_disconnected` - iRacing closed
- `session_info` - Session details
- `telemetry` - Real-time data (10 Hz)
- `lap_completed` - Lap finished
- `pit_stop` - Pit stop completed

**Example:**
```javascript
const ws = new WebSocket('ws://localhost:8081');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.data);
};
```

### Project Structure

```
racing-intelligence-companion/
├── src/
│   └── index.js           # Main server
├── dist/                  # Build output
│   └── RacingIntelligenceCompanion.exe
├── package.json
├── build.bat              # Build executable
├── start.bat              # Development start
└── README.md
```

### Building for Distribution

The `build.bat` script uses `pkg` to create a standalone executable that includes:
- Node.js runtime
- All dependencies
- The application code

Users can simply download and run the .exe - no installation needed!

### License

ISC
