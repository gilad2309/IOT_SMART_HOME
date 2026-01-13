// Fake relay actuator: subscribes to relay commands and logs state changes.

const mqtt = require('mqtt');

const MQTT_URL = process.env.MQTT_URL || 'mqtt://mqtt-dashboard.com:1883';
const RELAY_COMMAND_TOPIC = process.env.RELAY_COMMAND_TOPIC || 'actuator/relay';
const RELAY_STATUS_TOPIC = process.env.RELAY_STATUS_TOPIC || 'actuator/relay_status';

let relayState = 'off';

function normalizeState(value) {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return value > 0 ? 'on' : 'off';
  if (typeof value === 'string') {
    const s = value.toLowerCase();
    if (s === 'on' || s === '1' || s === 'true') return 'on';
    if (s === 'off' || s === '0' || s === 'false') return 'off';
  }
  return null;
}

const client = mqtt.connect(MQTT_URL, { clean: true, keepalive: 30, protocolVersion: 4 });

client.on('connect', () => {
  console.log(`[relay-emulator] connected ${MQTT_URL}`);
  client.subscribe(RELAY_COMMAND_TOPIC);
});

client.on('message', (topic, payload) => {
  if (topic !== RELAY_COMMAND_TOPIC) return;
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    data = { state: payload.toString() };
  }
  const next = normalizeState(data.state ?? data.value);
  if (!next) return;
  if (next === relayState) return;
  relayState = next;
  const status = JSON.stringify({ type: 'relay', state: relayState, ts: Date.now() });
  console.log(`[relay-emulator] state=${relayState}`);
  client.publish(RELAY_STATUS_TOPIC, status, { qos: 0, retain: false });
});

client.on('error', (err) => {
  console.error('[relay-emulator] MQTT error', err?.message || err);
});
