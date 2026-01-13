import { AlarmLevel } from '../types';
import './MetricsPanel.css';

interface Props {
  count: number | null;
  gpuUsage: number | null;
  temperature: number | null;
  gpuUpdatedAt: number | null;
  temperatureUpdatedAt: number | null;
  alarm: {
    gpu: AlarmLevel;
    temperature: AlarmLevel;
  };
  relayState: 'on' | 'off' | 'unknown';
}

function formatValue(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}${unit}`;
}

function alarmClass(level: AlarmLevel) {
  switch (level) {
    case 'warning':
      return 'warn';
    case 'alarm':
      return 'alarm';
    default:
      return 'normal';
  }
}

function formatTime(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

export function MetricsPanel({
  count,
  gpuUsage,
  temperature,
  gpuUpdatedAt,
  temperatureUpdatedAt,
  alarm,
  relayState
}: Props) {
  return (
    <div className="metrics-panel">
      <div>
        <div className="eyebrow">Live Metrics</div>
        <div className="metrics-grid">
          <div className="metric">
            <div className="label">People Count</div>
            <div className="value">{count ?? 0}</div>
          </div>
          <div className={`metric ${alarmClass(alarm.gpu)}`}>
            <div className="label">GPU Usage</div>
            <div className="value">{formatValue(gpuUsage, '%')}</div>
            <div className="meta">Updated: {formatTime(gpuUpdatedAt)}</div>
          </div>
          <div className={`metric ${alarmClass(alarm.temperature)}`}>
            <div className="label">Temperature</div>
            <div className="value">{formatValue(temperature, '°C')}</div>
            <div className="meta">Updated: {formatTime(temperatureUpdatedAt)}</div>
          </div>
        </div>
      </div>
      <div className="alarm-status">
        <div className="eyebrow">Alarms</div>
        <div className="alarm-list">
          <span className={`pill ${alarmClass(alarm.gpu)}`}>GPU: {alarm.gpu}</span>
          <span className={`pill ${alarmClass(alarm.temperature)}`}>
            Temp: {alarm.temperature}
          </span>
        </div>
        <div className="relay-status">
          <span className={`pill relay ${relayState}`}>Relay: {relayState}</span>
        </div>
      </div>
    </div>
  );
}
