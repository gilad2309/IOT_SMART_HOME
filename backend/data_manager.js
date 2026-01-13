// Data Manager: subscribe to device metrics, normalize, forward to UI topics, and emit alarms.

const mqtt = require('mqtt');

const MQTT_URL = process.env.MQTT_URL || 'mqtt://mqtt-dashboard.com:1883';
const METRICS_PREFIX = process.env.UI_METRICS_PREFIX || 'ui/metrics';
const ALARM_TOPIC = process.env.UI_ALARM_TOPIC || 'ui/alarms';

const TEMP_WARN_C = Number(process.env.TEMP_WARN_C || 70);
const TEMP_ALARM_C = Number(process.env.TEMP_ALARM_C || 80);
const GPU_WARN_PCT = Number(process.env.GPU_WARN_PCT || 85);
const GPU_ALARM_PCT = Number(process.env.GPU_ALARM_PCT || 95);

const SOURCE_TOPICS = {
  people: 'deepstream/person_count',
  temperature: 'jetson/internal/temperature',
  gpu: 'jetson/internal/gpu_usage'
};

const state = {
  tempLevel: 'normal',
  gpuLevel: 'normal'
};

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function publishAlarm(client, type, value, warn, alarm) {
  let level = 'normal';
  if (value >= alarm) level = 'alarm';
  else if (value >= warn) level = 'warning';

  const key = type === 'temperature' ? 'tempLevel' : 'gpuLevel';
  if (state[key] === level) return;
  state[key] = level;

  const payload = JSON.stringify({
    type,
    level,
    value,
    threshold: level === 'alarm' ? alarm : warn,
    ts: Date.now()
  });
  client.publish(ALARM_TOPIC, payload, { qos: 0, retain: false });
}

function forwardMetric(client, metric, payload) {
  client.publish(`${METRICS_PREFIX}/${metric}`, payload, { qos: 0, retain: false });
}

const DEBUG = process.env.DATA_MANAGER_DEBUG === '1';

const client = mqtt.connect(MQTT_URL, {
  clean: true,
  keepalive: 30,
  protocolVersion: 4
});

client.on('connect', () => {
  console.log(`[data-manager] connected ${MQTT_URL}`);
  client.subscribe(Object.values(SOURCE_TOPICS));
  if (DEBUG) {
    console.log('[data-manager] subscribed', Object.values(SOURCE_TOPICS));
  }
});

client.on('error', (err) => {
  console.error('[data-manager] MQTT error', err?.message || err);
});

client.on('message', (topic, payload) => {
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch (err) {
    console.error('[data-manager] bad JSON', topic);
    return;
  }

  if (topic === SOURCE_TOPICS.people) {
    const count = toNumber(data.count ?? data.person_count ?? data.value);
    if (Number.isNaN(count)) return;
    const msg = JSON.stringify({ type: 'person_count', count, ts: data.ts ?? Date.now() });
    forwardMetric(client, 'person_count', msg);
    if (DEBUG) console.log('[data-manager] person_count', msg);
    return;
  }

  if (topic === SOURCE_TOPICS.gpu) {
    const percent = toNumber(data.percent ?? data.usage ?? data.value);
    if (Number.isNaN(percent)) return;
    const msg = JSON.stringify({ type: 'gpu_usage', percent, ts: data.ts ?? Date.now() });
    forwardMetric(client, 'gpu_usage', msg);
    publishAlarm(client, 'gpu_usage', percent, GPU_WARN_PCT, GPU_ALARM_PCT);
    if (DEBUG) console.log('[data-manager] gpu_usage', msg);
    return;
  }

  if (topic === SOURCE_TOPICS.temperature) {
    const celsius = toNumber(data.celsius ?? data.temp ?? data.value);
    if (Number.isNaN(celsius)) return;
    const msg = JSON.stringify({ type: 'temperature', celsius, ts: data.ts ?? Date.now() });
    forwardMetric(client, 'temperature', msg);
    publishAlarm(client, 'temperature', celsius, TEMP_WARN_C, TEMP_ALARM_C);
    if (DEBUG) console.log('[data-manager] temperature', msg);
  }
});
