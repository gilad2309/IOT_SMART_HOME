// Lightweight MQTT broker with WebSocket support (no system install needed).
// MQTT TCP: 1883, WebSocket: 9001.

const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const WebSocket = require('ws');

const MQTT_PORT = process.env.MQTT_PORT || 1883;
const WS_PORT = process.env.WS_PORT || 9001;

// TCP MQTT
const server = net.createServer(aedes.handle);
server.listen(MQTT_PORT, () => {
  console.log(`[mqtt-broker] MQTT listening on tcp://0.0.0.0:${MQTT_PORT}`);
});

// WebSocket MQTT
const httpServer = http.createServer();
const wss = new WebSocket.Server({
  server: httpServer,
  handleProtocols: (protocols) => {
    // Accept MQTT subprotocol if requested
    if (protocols && protocols.includes('mqtt')) return 'mqtt';
    return false;
  }
});

wss.on('connection', (ws) => {
  const stream = WebSocket.createWebSocketStream(ws, { encoding: 'binary' });
  aedes.handle(stream);
});

httpServer.listen(WS_PORT, () => {
  console.log(`[mqtt-broker] WebSocket listening on ws://0.0.0.0:${WS_PORT}`);
});

aedes.on('client', (client) => {
  console.log(`[mqtt-broker] client connected: ${client ? client.id : 'unknown'}`);
});

aedes.on('publish', (packet, client) => {
  if (packet && packet.topic === 'deepstream/person_count') {
    console.log(`[mqtt-broker] person_count ${packet.payload.toString()}`);
  }
});
