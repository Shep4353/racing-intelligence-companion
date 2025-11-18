#!/usr/bin/env node

const WebSocket = require('ws');
const { NativeSDK } = require('@irsdk-node/native');

console.log('========================================');
console.log('Racing Intelligence Companion v1.0.0');
console.log('========================================');
console.log('');

// Configuration
const WS_PORT = 8080;
const TELEMETRY_UPDATE_INTERVAL = 100; // 100ms = 10 Hz

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket server running on port ${WS_PORT}`);

// Initialize iRacing SDK
const sdk = new NativeSDK();

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

  const weekendInfo = sessionData.WeekendInfo || {};
  const sessionInfo = sessionData.SessionInfo?.Sessions?.[0] || {};

  const session = {
    sessionId: weekendInfo.SessionID || 0,
    subsessionId: weekendInfo.SubSessionID || null,
    trackName: weekendInfo.TrackDisplayName || weekendInfo.TrackName || 'Unknown',
    trackConfig: weekendInfo.TrackConfigName || null,
    carName: sessionData.DriverInfo?.Drivers?.[0]?.CarScreenName || 'Unknown',
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

// Process telemetry data
function processTelemetry(telemetry) {
  if (!currentSession || !isConnected || !telemetry) return;

  const telemetryData = {
    // Timing
    sessionTime: telemetry.SessionTime || 0,
    sessionTimeRemain: telemetry.SessionTimeRemain || 0,

    // Lap data
    lap: telemetry.Lap || 0,
    lapCompleted: telemetry.LapCompleted || 0,
    lapDistPct: telemetry.LapDistPct || 0,

    // Lap times
    lapCurrentTime: telemetry.LapCurrentLapTime || 0,
    lapLastTime: telemetry.LapLastLapTime || 0,
    lapBestTime: telemetry.LapBestLapTime || 0,

    // Fuel
    fuelLevel: telemetry.FuelLevel || 0,
    fuelLevelPct: telemetry.FuelLevelPct || 0,
    fuelUsePerHour: telemetry.FuelUsePerHour || 0,

    // Pit status
    onPitRoad: telemetry.OnPitRoad || false,
    pitstopActive: telemetry.PitstopActive || false,

    // Position
    carIdx: telemetry.PlayerCarIdx || 0,
    position: telemetry.PlayerCarPosition || 0,
    classPosition: telemetry.PlayerCarClassPosition || 0,
    speed: telemetry.Speed || 0,

    // Flags
    sessionFlags: telemetry.SessionFlags || 0,

    // Track state
    trackTemp: telemetry.TrackTemp || 0,
    airTemp: telemetry.AirTemp || 0
  };

  // Broadcast telemetry
  broadcast({
    type: 'telemetry',
    data: telemetryData
  });

  // Initialize fuel level on first telemetry (BEFORE lap processing)
  if (lastFuelLevel === 0 && telemetry.FuelLevel > 0) {
    lastFuelLevel = telemetry.FuelLevel;
    console.log(`Initial fuel level: ${lastFuelLevel.toFixed(2)}L`);
  }

  // Process lap completion
  if (telemetry.LapCompleted > lastLapNumber && lastLapNumber > 0) {
    // Only process if we have a previous lap (skip lap 0 -> lap 1 transition)
    const fuelUsed = lastFuelLevel - telemetry.FuelLevel;

    const lapData = {
      lapNumber: telemetry.LapCompleted,
      lapTime: telemetry.LapLastLapTime,
      sessionTime: telemetry.SessionTime,
      fuelAtStart: lastFuelLevel,
      fuelAtEnd: telemetry.FuelLevel,
      fuelUsed: fuelUsed > 0 ? fuelUsed : 0,
      position: telemetry.PlayerCarPosition,
      classPosition: telemetry.PlayerCarClassPosition,
      isValid: !(telemetry.SessionFlags & 0x00000001),
      isBestLap: telemetry.LapLastLapTime === telemetry.LapBestLapTime
    };

    laps.push(lapData);
    console.log(`Lap ${lapData.lapNumber}: ${lapData.lapTime.toFixed(3)}s - Fuel: ${lapData.fuelUsed.toFixed(2)}L`);

    broadcast({
      type: 'lap_completed',
      data: lapData
    });
  }

  // Update trackers for next lap
  if (telemetry.LapCompleted > lastLapNumber) {
    lastLapNumber = telemetry.LapCompleted;
    lastFuelLevel = telemetry.FuelLevel;
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
    const sessionData = sdk.getSessionData();
    const telemetryData = sdk.getTelemetryData();

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
    // Silently handle errors (iRacing not running, etc.)
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
