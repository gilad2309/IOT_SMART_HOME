const DEFAULT_WHEP = 'http://127.0.0.1:8889/ds-test/whep';
const DEFAULT_MQTT_WS_URL = 'wss://mqtt-dashboard.com:8884/mqtt';
const DEFAULT_METRICS_PREFIX = 'ui/metrics';
const DEFAULT_ALARM_TOPIC = 'ui/alarms';
const DEFAULT_RELAY_STATUS_TOPIC = 'actuator/relay_status';

export function getWhepUrl(): string {
  return import.meta.env.VITE_WHEP_URL || DEFAULT_WHEP;
}

export function getMqttUrl(): string {
  const envUrl = import.meta.env.VITE_MQTT_WS_URL;
  if (envUrl) return envUrl;

  return DEFAULT_MQTT_WS_URL;
}

export function getMetricsPrefix(): string {
  return import.meta.env.VITE_METRICS_PREFIX || DEFAULT_METRICS_PREFIX;
}

export function getAlarmTopic(): string {
  return import.meta.env.VITE_ALARM_TOPIC || DEFAULT_ALARM_TOPIC;
}

export function getRelayStatusTopic(): string {
  return import.meta.env.VITE_RELAY_STATUS_TOPIC || DEFAULT_RELAY_STATUS_TOPIC;
}

export function getMetricTopic(metric: 'person_count' | 'gpu_usage' | 'temperature'): string {
  return `${getMetricsPrefix()}/${metric}`;
}
