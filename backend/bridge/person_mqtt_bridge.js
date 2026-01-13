// UDP -> MQTT bridge for person counts published by DeepStream pad probe.
// DeepStream sends JSON over UDP on 127.0.0.1:50052; we publish to MQTT.

const dgram = require('dgram');
const mqtt = require('mqtt');

const UDP_PORT = process.env.PERSON_UDP_PORT || 50052;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://mqtt-dashboard.com:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'deepstream/person_count';

const sock = dgram.createSocket('udp4');
const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  console.log(`[person-mqtt] Connected to MQTT ${MQTT_URL}, publishing to ${MQTT_TOPIC}`);
});

client.on('error', (err) => {
  console.error('[person-mqtt] MQTT error', err);
});

sock.on('message', (msg) => {
  try {
    const str = msg.toString();
    const data = JSON.parse(str);
    console.log('[person-mqtt] UDP ->', str);
    client.publish(MQTT_TOPIC, str, { qos: 0, retain: false });
  } catch (e) {
    console.error('[person-mqtt] Failed to parse UDP message', e);
  }
});

sock.on('listening', () => {
  const addr = sock.address();
  console.log(`[person-mqtt] Listening on udp://${addr.address}:${addr.port}`);
});

sock.bind(UDP_PORT, '127.0.0.1');
