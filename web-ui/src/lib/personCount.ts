import mqtt from 'mqtt/dist/mqtt';
import type { MqttClient } from 'mqtt';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ConnectionState } from '../types';
import { getMetricTopic, getMqttUrl } from './config';

export function usePersonCount(active: boolean) {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!active) {
      setStatus('idle');
      setCount(null);
      setError(null);
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
      return;
    }

    const url = getMqttUrl();
    const topic = getMetricTopic('person_count');
    setStatus('connecting');
    setError(null);

    const client = mqtt.connect(url, {
      clientId: `webclient-${Math.random().toString(16).slice(2)}`,
      keepalive: 30,
      reconnectPeriod: 2000,
      clean: true
    });
    clientRef.current = client;

    client.on('connect', () => {
      if (disposed) return;
      setStatus('connected');
      client.subscribe(topic);
    });

    client.on('reconnect', () => {
      if (disposed) return;
      setStatus('connecting');
    });

    client.on('message', (msgTopic, payload) => {
      if (disposed) return;
      if (msgTopic !== topic) return;
      try {
        const data = JSON.parse(payload.toString());
        if (data?.type === 'person_count' && typeof data.count === 'number') {
          setCount(data.count);
          setError(null);
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
    });

    return () => {
      disposed = true;
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [active]);

  return { count, status, error };
}
