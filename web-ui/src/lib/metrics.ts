import mqtt from 'mqtt/dist/mqtt';
import type { MqttClient } from 'mqtt';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AlarmLevel, ConnectionState } from '../types';
import { getAlarmTopic, getMetricTopic, getMqttUrl, getRelayStatusTopic } from './config';

export interface MetricsState {
  count: number | null;
  gpuUsage: number | null;
  temperature: number | null;
  gpuUpdatedAt: number | null;
  temperatureUpdatedAt: number | null;
  gpuHistory: Array<{ ts: number; value: number }>;
  temperatureHistory: Array<{ ts: number; value: number }>;
  alarm: {
    gpu: AlarmLevel;
    temperature: AlarmLevel;
  };
  relayState: 'on' | 'off' | 'unknown';
}

const initialMetrics: MetricsState = {
  count: null,
  gpuUsage: null,
  temperature: null,
  gpuUpdatedAt: null,
  temperatureUpdatedAt: null,
  gpuHistory: [],
  temperatureHistory: [],
  alarm: {
    gpu: 'normal',
    temperature: 'normal'
  },
  relayState: 'unknown'
};

export function useMetrics(active: boolean) {
  const [metrics, setMetrics] = useState<MetricsState>(initialMetrics);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!active) {
      setStatus('idle');
      setMetrics(initialMetrics);
      setError(null);
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
      return;
    }

    const url = getMqttUrl();
    const topics = {
      person: getMetricTopic('person_count'),
      gpu: getMetricTopic('gpu_usage'),
      temp: getMetricTopic('temperature'),
      alarm: getAlarmTopic(),
      relay: getRelayStatusTopic()
    };

    setStatus('connecting');
    setError(null);

    const client = mqtt.connect(url, {
      clientId: `ui-metrics-${Math.random().toString(16).slice(2)}`,
      keepalive: 30,
      reconnectPeriod: 2000,
      clean: true
    });
    clientRef.current = client;

    client.on('connect', () => {
      if (disposed) return;
      setStatus('connected');
      client.subscribe(Object.values(topics));
    });

    client.on('reconnect', () => {
      if (disposed) return;
      setStatus('connecting');
    });

    client.on('message', (msgTopic, payload) => {
      if (disposed) return;
      try {
        const data = JSON.parse(payload.toString());
        if (msgTopic === topics.person && typeof data.count === 'number') {
          setMetrics((prev) => ({ ...prev, count: data.count }));
        } else if (msgTopic === topics.gpu && typeof data.percent === 'number') {
          const ts = typeof data.ts === 'number' ? data.ts : Date.now();
          setMetrics((prev) => ({
            ...prev,
            gpuUsage: data.percent,
            gpuUpdatedAt: ts,
            gpuHistory: trimHistory(prev.gpuHistory, { ts, value: data.percent })
          }));
        } else if (msgTopic === topics.temp && typeof data.celsius === 'number') {
          const ts = typeof data.ts === 'number' ? data.ts : Date.now();
          setMetrics((prev) => ({
            ...prev,
            temperature: data.celsius,
            temperatureUpdatedAt: ts,
            temperatureHistory: trimHistory(prev.temperatureHistory, { ts, value: data.celsius })
          }));
        } else if (msgTopic === topics.alarm && typeof data.type === 'string') {
          if (data.type === 'gpu_usage' && data.level) {
            setMetrics((prev) => ({
              ...prev,
              alarm: { ...prev.alarm, gpu: data.level }
            }));
          } else if (data.type === 'temperature' && data.level) {
            setMetrics((prev) => ({
              ...prev,
              alarm: { ...prev.alarm, temperature: data.level }
            }));
          }
        } else if (msgTopic === topics.relay && typeof data.state === 'string') {
          const next = data.state === 'on' ? 'on' : 'off';
          setMetrics((prev) => ({ ...prev, relayState: next }));
        }
      } catch (err) {
        setError('Bad MQTT payload');
      }
    });

    client.on('error', (err) => {
      if (disposed) return;
      setStatus('error');
      setError(err?.message || 'MQTT error');
    });

    client.on('close', () => {
      if (disposed) return;
      setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      setMetrics(initialMetrics);
    });

    return () => {
      disposed = true;
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [active]);

  return { ...metrics, status, error };
}

function trimHistory(
  history: Array<{ ts: number; value: number }>,
  next: { ts: number; value: number },
  limit = 720
) {
  const updated = [...history, next];
  if (updated.length <= limit) return updated;
  return updated.slice(updated.length - limit);
}
