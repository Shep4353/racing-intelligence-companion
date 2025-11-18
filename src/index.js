#!/usr/bin/env node

const WebSocket = require('ws');
const { NativeSDK } = require('@irsdk-node/native');
const YAML = require('yaml');

console.log('========================================');
console.log('Racing Intelligence Companion v1.0.1');
console.log('========================================');
console.log('');

// Configuration
const WS_PORT = process.env.WS_PORT || 8081; // Use 8081 to avoid conflict with Vite dev server
const TELEMETRY_UPDATE_INTERVAL = 100; // 100ms = 10 Hz

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket server running on port ${WS_PORT}`);

// Initialize iRacing SDK
let sdk;
try {
  sdk = new NativeSDK();
  console.log('✓ iRacing SDK initialized successfully');

  // Start the SDK (required before reading data)
  // This will return false if iRacing is not running, but we poll for it
  sdk.startSDK();
} catch (error) {
  console.error('✗ Failed to initialize iRacing SDK:', error.message);
  console.log('Make sure iRacing is installed and running');
  process.exit(1);
}

// Track connected clients
const clients = new Set();

// Track current session state
let currentSession = null;
let isConnected = false;
let lastLapNumber = 0;
let lastFuelLevel = 0;
let pitStopCounter = 0;
let isInPit = false;
let pitEntryData = null;
const laps = [];
const pitStops = [];

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Web browser connected');
  clients.add(ws);

  // Send current connection status
  ws.send(JSON.stringify({
    type: 'connection_status',
    data: {
      isConnected,
      session: currentSession,
      laps: laps.slice(-10), // Send last 10 laps
      pitStops: pitStops
    }
  }));

  ws.on('close', () => {
    console.log('Web browser disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Helper function to parse session time
function parseSessionTime(timeString) {
  if (!timeString || timeString === 'unlimited') return null;

  // Parse time strings like "90 min" or "120.00 min"
  const match = timeString.match(/([\d.]+)\s*min/i);
  if (match) {
    return parseFloat(match[1]) * 60; // Convert to seconds
  }

  // Parse time strings like "2 hours"
  const hourMatch = timeString.match(/([\d.]+)\s*hour/i);
  if (hourMatch) {
    return parseFloat(hourMatch[1]) * 3600;
  }

  return null;
}

// Process session data
function processSessionData(sessionData) {
  if (!sessionData) return;

  // Session data comes as a YAML string, need to parse it
  let parsedData;
  try {
    // If sessionData is a string or buffer, parse it as YAML
    if (typeof sessionData === 'string') {
      parsedData = YAML.parse(sessionData);
    } else if (Buffer.isBuffer(sessionData)) {
      parsedData = YAML.parse(sessionData.toString());
    } else {
      parsedData = sessionData;
    }
  } catch (error) {
    console.error('Failed to parse session data:', error.message);
    return;
  }

  const weekendInfo = parsedData.WeekendInfo || {};
  const sessionInfo = parsedData.SessionInfo?.Sessions?.[0] || {};

  const session = {
    sessionId: weekendInfo.SessionID || 0,
    subsessionId: weekendInfo.SubSessionID || null,
    trackName: weekendInfo.TrackDisplayName || weekendInfo.TrackName || 'Unknown',
    trackConfig: weekendInfo.TrackConfigName || null,
    carName: parsedData.DriverInfo?.Drivers?.[0]?.CarScreenName || 'Unknown',
    sessionType: sessionInfo.SessionType || 'Unknown',
    sessionLaps: sessionInfo.SessionLaps === 'unlimited' ? null : parseInt(sessionInfo.SessionLaps) || null,
    sessionTimeSeconds: parseSessionTime(sessionInfo.SessionTime),
    isTimeLimited: sessionInfo.SessionTime !== 'unlimited',
    sessionState: sessionInfo.SessionState || 'Unknown'
  };

  if (!currentSession || currentSession.sessionId !== session.sessionId) {
    console.log(`New session: ${session.trackName} - ${session.carName}`);
    currentSession = session;

    // Reset counters for new session
    lastLapNumber = 0;
    lastFuelLevel = 0;
    pitStopCounter = 0;
    isInPit = false;
    pitEntryData = null;
    laps.length = 0;
    pitStops.length = 0;

    broadcast({
      type: 'session_info',
      data: session
    });
  }
}

// Helper to extract value from telemetry (SDK returns variable objects)
function getValue(data) {
  if (!data) return 0;

  // If it's a telemetry variable object, extract the value property
  if (typeof data === 'object' && 'value' in data) {
    const val = data.value;

    // Value is an ArrayBuffer - need to convert based on varType
    if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
      const varType = data.varType;
      const buffer = val instanceof ArrayBuffer ? val : val.buffer;
      const view = new DataView(buffer);

      // Check if buffer has data (some telemetry values may be empty)
      if (buffer.byteLength === 0) {
        return 0;
      }

      // varType: 0=char, 1=bool, 2=int, 3=bitfield, 4=float, 5=double
      try {
        switch (varType) {
          case 0: // char
            return view.getInt8(0);
          case 1: // bool
            return view.getInt32(0, true);
          case 2: // int
            return view.getInt32(0, true);
          case 3: // bitfield
            return view.getUint32(0, true);
          case 4: // float
            return view.getFloat32(0, true);
          case 5: // double
            return view.getFloat64(0, true);
          default:
            return 0;
        }
      } catch (err) {
        // Silently return 0 for empty/invalid buffers
        return 0;
      }
    }

    // Value might be a regular array, get first element
    if (Array.isArray(val)) return val[0] || 0;
    return val || 0;
  }

  // If it's already an array, get first element
  if (Array.isArray(data)) return data[0] || 0;

  // Otherwise return as-is
  return data || 0;
}

// Process telemetry data
function processTelemetry(telemetry) {
  if (!currentSession || !isConnected || !telemetry) return;

  // Debug: Check telemetry structure (log once)
  if (!processTelemetry.logged) {
    console.log('Telemetry type:', typeof telemetry);
    console.log('Telemetry keys sample:', Object.keys(telemetry).slice(0, 10));
    console.log('FuelLevel sample:', telemetry.FuelLevel);
    console.log('Lap sample:', telemetry.Lap);
    processTelemetry.logged = true;
  }

  const telemetryData = {
    // Timing
    sessionTime: getValue(telemetry.SessionTime),
    sessionTimeRemain: getValue(telemetry.SessionTimeRemain),

    // Lap data
    lap: getValue(telemetry.Lap),
    lapCompleted: getValue(telemetry.LapCompleted),
    lapDistPct: getValue(telemetry.LapDistPct),

    // Lap times
    lapCurrentTime: getValue(telemetry.LapCurrentLapTime),
    lapLastTime: getValue(telemetry.LapLastLapTime),
    lapBestTime: getValue(telemetry.LapBestLapTime),

    // Fuel
    fuelLevel: getValue(telemetry.FuelLevel),
    fuelLevelPct: getValue(telemetry.FuelLevelPct),
    fuelUsePerHour: getValue(telemetry.FuelUsePerHour),

    // Pit status
    onPitRoad: getValue(telemetry.OnPitRoad) === 1,
    pitstopActive: getValue(telemetry.PitstopActive) === 1,

    // Position
    carIdx: getValue(telemetry.PlayerCarIdx),
    position: getValue(telemetry.PlayerCarPosition),
    classPosition: getValue(telemetry.PlayerCarClassPosition),
    speed: getValue(telemetry.Speed),

    // Flags
    sessionFlags: getValue(telemetry.SessionFlags),

    // Track state
    trackTemp: getValue(telemetry.TrackTemp),
    airTemp: getValue(telemetry.AirTemp)
  };

  // Broadcast telemetry
  broadcast({
    type: 'telemetry',
    data: telemetryData
  });

  // Initialize fuel level on first telemetry (BEFORE lap processing)
  const currentFuel = getValue(telemetry.FuelLevel);
  if (lastFuelLevel === 0 && currentFuel > 0) {
    lastFuelLevel = currentFuel;
    console.log(`Initial fuel level: ${lastFuelLevel.toFixed(2)}L`);
  }

  // Process lap completion
  const currentLapCompleted = getValue(telemetry.LapCompleted);
  if (currentLapCompleted > lastLapNumber && lastLapNumber > 0) {
    // Only process if we have a previous lap (skip lap 0 -> lap 1 transition)
    const fuelUsed = lastFuelLevel - currentFuel;

    const lapData = {
      lapNumber: currentLapCompleted,
      lapTime: getValue(telemetry.LapLastLapTime),
      sessionTime: getValue(telemetry.SessionTime),
      fuelAtStart: lastFuelLevel,
      fuelAtEnd: currentFuel,
      fuelUsed: fuelUsed > 0 ? fuelUsed : 0,
      position: getValue(telemetry.PlayerCarPosition),
      classPosition: getValue(telemetry.PlayerCarClassPosition),
      isValid: !(getValue(telemetry.SessionFlags) & 0x00000001),
      isBestLap: getValue(telemetry.LapLastLapTime) === getValue(telemetry.LapBestLapTime)
    };

    laps.push(lapData);
    console.log(`Lap ${lapData.lapNumber}: ${lapData.lapTime.toFixed(3)}s - Fuel: ${lapData.fuelUsed.toFixed(2)}L`);

    broadcast({
      type: 'lap_completed',
      data: lapData
    });
  }

  // Update trackers for next lap
  if (currentLapCompleted > lastLapNumber) {
    lastLapNumber = currentLapCompleted;
    lastFuelLevel = currentFuel;
  }

  // Process pit entry
  if (telemetryData.onPitRoad && !isInPit) {
    isInPit = true;
    pitStopCounter++;

    pitEntryData = {
      stopNumber: pitStopCounter,
      lapNumber: telemetryData.lap,
      pitInTime: telemetryData.sessionTime,
      fuelBefore: telemetryData.fuelLevel
    };

    console.log(`Pit entry - Lap ${pitEntryData.lapNumber}`);
  }

  // Process pit exit
  if (!telemetryData.onPitRoad && isInPit && pitEntryData) {
    const pitStopData = {
      ...pitEntryData,
      pitOutTime: telemetryData.sessionTime,
      pitDuration: telemetryData.sessionTime - pitEntryData.pitInTime,
      fuelAfter: telemetryData.fuelLevel,
      fuelAdded: telemetryData.fuelLevel - pitEntryData.fuelBefore,
      tyresChanged: false,
      repairsMade: false
    };

    pitStops.push(pitStopData);
    console.log(`Pit exit - Duration: ${pitStopData.pitDuration.toFixed(1)}s, Fuel added: ${pitStopData.fuelAdded.toFixed(1)}L`);

    broadcast({
      type: 'pit_stop',
      data: pitStopData
    });

    isInPit = false;
    pitEntryData = null;
  }
}

// Main polling loop
setInterval(() => {
  try {
    // Try to start SDK if not already running (handles iRacing restart)
    const sdkRunning = sdk.startSDK();

    // Try to get data - this may return null if iRacing isn't running
    let sessionData = null;
    let telemetryData = null;

    if (sdkRunning) {
      try {
        // Wait for fresh data (up to 100ms)
        if (sdk.waitForData(0.1)) {
          sessionData = sdk.getSessionData();
          telemetryData = sdk.getTelemetryData();
        }
      } catch (sdkError) {
        // SDK call failed - iRacing probably not running
        // Silently continue to next iteration
      }
    }

    // Check connection status
    const wasConnected = isConnected;
    isConnected = sessionData !== null && telemetryData !== null;

    // Handle connection changes
    if (isConnected && !wasConnected) {
      console.log('✓ Connected to iRacing');
      broadcast({
        type: 'iracing_connected',
        data: { timestamp: new Date().toISOString() }
      });
    } else if (!isConnected && wasConnected) {
      console.log('✗ Disconnected from iRacing');

      // Reset session data
      currentSession = null;
      lastLapNumber = 0;
      lastFuelLevel = 0;
      pitStopCounter = 0;
      isInPit = false;
      pitEntryData = null;
      laps.length = 0;
      pitStops.length = 0;

      broadcast({
        type: 'iracing_disconnected',
        data: { timestamp: new Date().toISOString() }
      });
    }

    // Process data if connected
    if (isConnected) {
      processSessionData(sessionData);
      processTelemetry(telemetryData);
    }
  } catch (error) {
    // Log errors for debugging
    if (error.message && !error.message.includes('not connected')) {
      console.error('SDK Error:', error.message);
    }
  }
}, TELEMETRY_UPDATE_INTERVAL);

console.log('Waiting for iRacing connection...');
console.log('');
console.log('Status:');
console.log('  • Launch iRacing and join a session');
console.log('  • Open OPR Intelligence Live Calculator in your browser');
console.log('  • Keep this window open while racing!');
console.log('');
console.log('Press Ctrl+C to stop the companion app');
console.log('========================================');
console.log('');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');

  clients.forEach((client) => {
    client.close();
  });

  wss.close(() => {
    console.log('Companion app stopped');
    process.exit(0);
  });
});

// Keep process running
process.stdin.resume();
