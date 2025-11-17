#!/usr/bin/env node

const WebSocket = require('ws');
const irsdk = require('node-irsdk');

console.log('========================================');
console.log('Racing Intelligence Companion v1.0.0');
console.log('========================================');
console.log('');

// Configuration
const WS_PORT = 8080;
const TELEMETRY_UPDATE_INTERVAL = 100; // 100ms = 10 Hz
const SESSION_INFO_UPDATE_INTERVAL = 1000; // 1 second

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket server running on port ${WS_PORT}`);

// Initialize iRacing SDK
const iracing = irsdk.init({
  telemetryUpdateInterval: TELEMETRY_UPDATE_INTERVAL,
  sessionInfoUpdateInterval: SESSION_INFO_UPDATE_INTERVAL
});

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

// iRacing SDK Event Handlers
iracing.on('Connected', () => {
  console.log('✓ Connected to iRacing');
  isConnected = true;

  broadcast({
    type: 'iracing_connected',
    data: { timestamp: new Date().toISOString() }
  });
});

iracing.on('Disconnected', () => {
  console.log('✗ Disconnected from iRacing');
  isConnected = false;

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
});

iracing.on('SessionInfo', (sessionInfo) => {
  const weekendInfo = sessionInfo.data.WeekendInfo || {};
  const sessionData = sessionInfo.data.SessionInfo?.Sessions?.[0] || {};

  const session = {
    sessionId: weekendInfo.SessionID || 0,
    subsessionId: weekendInfo.SubSessionID || null,
    trackName: weekendInfo.TrackDisplayName || weekendInfo.TrackName || 'Unknown',
    trackConfig: weekendInfo.TrackConfigName || null,
    carName: sessionInfo.data.DriverInfo?.Drivers?.[0]?.CarScreenName || 'Unknown',
    sessionType: sessionData.SessionType || 'Unknown',
    sessionLaps: sessionData.SessionLaps === 'unlimited' ? null : parseInt(sessionData.SessionLaps) || null,
    sessionTimeSeconds: parseSessionTime(sessionData.SessionTime),
    isTimeLimited: sessionData.SessionTime !== 'unlimited',
    sessionState: sessionData.SessionState || 'Unknown'
  };

  if (!currentSession) {
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
  }

  broadcast({
    type: 'session_info',
    data: session
  });
});

iracing.on('Telemetry', (telemetry) => {
  if (!currentSession || !isConnected) return;

  const values = telemetry.values;

  const telemetryData = {
    // Timing
    sessionTime: values.SessionTime || 0,
    sessionTimeRemain: values.SessionTimeRemain || 0,

    // Lap data
    lap: values.Lap || 0,
    lapCompleted: values.LapCompleted || 0,
    lapDistPct: values.LapDistPct || 0,

    // Lap times
    lapCurrentTime: values.LapCurrentLapTime || 0,
    lapLastTime: values.LapLastLapTime || 0,
    lapBestTime: values.LapBestLapTime || 0,

    // Fuel
    fuelLevel: values.FuelLevel || 0,
    fuelLevelPct: values.FuelLevelPct || 0,
    fuelUsePerHour: values.FuelUsePerHour || 0,

    // Pit status
    onPitRoad: values.OnPitRoad || false,
    pitstopActive: values.PitstopActive || false,

    // Position
    carIdx: values.PlayerCarIdx || 0,
    position: values.PlayerCarPosition || 0,
    classPosition: values.PlayerCarClassPosition || 0,
    speed: values.Speed || 0,

    // Flags
    sessionFlags: values.SessionFlags || 0,

    // Track state
    trackTemp: values.TrackTemp || 0,
    airTemp: values.AirTemp || 0
  };

  // Broadcast telemetry
  broadcast({
    type: 'telemetry',
    data: telemetryData
  });

  // Initialize fuel level on first telemetry (BEFORE lap processing)
  if (lastFuelLevel === 0 && values.FuelLevel > 0) {
    lastFuelLevel = values.FuelLevel;
    console.log(`Initial fuel level: ${lastFuelLevel.toFixed(2)}L`);
  }

  // Process lap completion
  if (values.LapCompleted > lastLapNumber && lastLapNumber > 0) {
    // Only process if we have a previous lap (skip lap 0 -> lap 1 transition)
    const fuelUsed = lastFuelLevel - values.FuelLevel;

    const lapData = {
      lapNumber: values.LapCompleted,
      lapTime: values.LapLastLapTime,
      sessionTime: values.SessionTime,
      fuelAtStart: lastFuelLevel,
      fuelAtEnd: values.FuelLevel,
      fuelUsed: fuelUsed > 0 ? fuelUsed : 0,
      position: values.PlayerCarPosition,
      classPosition: values.PlayerCarClassPosition,
      isValid: !(values.SessionFlags & 0x00000001),
      isBestLap: values.LapLastLapTime === values.LapBestLapTime
    };

    laps.push(lapData);
    console.log(`Lap ${lapData.lapNumber}: ${lapData.lapTime.toFixed(3)}s - Fuel: ${lapData.fuelUsed.toFixed(2)}L`);

    broadcast({
      type: 'lap_completed',
      data: lapData
    });
  }

  // Update trackers for next lap
  if (values.LapCompleted > lastLapNumber) {
    lastLapNumber = values.LapCompleted;
    lastFuelLevel = values.FuelLevel;
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
});

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
