const DEFAULT_WHEP = 'http://127.0.0.1:8889/ds-test/whep';
const DEFAULT_MQTT_TOPIC = 'deepstream/person_count';
const DEFAULT_MQTT_WS_URL = 'wss://mqtt-dashboard.com:8884/mqtt';

export function getWhepUrl(): string {
  return import.meta.env.VITE_WHEP_URL || DEFAULT_WHEP;
}

export function getMqttUrl(): string {
  const envUrl = import.meta.env.VITE_MQTT_WS_URL;
  if (envUrl) return envUrl;

  return DEFAULT_MQTT_WS_URL;
}

export function getMqttTopic(): string {
  return DEFAULT_MQTT_TOPIC;
}
