import { useEffect, useState } from 'preact/hooks';
import { AlarmLevel } from '../types';
import './MetricsPanel.css';

interface Props {
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

function formatValue(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) return '-';
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
  gpuHistory,
  temperatureHistory,
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
            <div className="value">{count === null ? '-' : count}</div>
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
      <div className="chart-card">
        <div className="eyebrow">Live Chart</div>
        <Chart
          gpuSeries={gpuHistory}
          tempSeries={temperatureHistory}
        />
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

function Chart({
  gpuSeries,
  tempSeries
}: {
  gpuSeries: Array<{ ts: number; value: number }>;
  tempSeries: Array<{ ts: number; value: number }>;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 120) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const windowSeconds = 600;
  const maxTs = now;
  const minTs = maxTs - windowSeconds * 1000;

  const width = 640;
  const height = 280;
  const pad = { top: 14, right: 12, bottom: 30, left: 44 };

  const filteredGpu = gpuSeries.filter((p) => p.ts >= minTs);
  const filteredTemp = tempSeries.filter((p) => p.ts >= minTs);
  const values = [...filteredGpu, ...filteredTemp].map((p) => p.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 100;
  const range = max - min || 1;
  const timeRange = maxTs - minTs || 1;
  const pixelsPerSecond = (width - pad.left - pad.right) / windowSeconds;

  const toPoints = (series: Array<{ ts: number; value: number }>) =>
    series.map((p) => {
      const x = pad.left + ((p.ts - minTs) / timeRange) * (width - pad.left - pad.right);
      const y = pad.top + (1 - (p.value - min) / range) * (height - pad.top - pad.bottom);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

  const gpuPoints = toPoints(filteredGpu);
  const tempPoints = toPoints(filteredTemp);
  const lastPoint = (points: string[]) => {
    if (!points.length) return null;
    const [x, y] = points[points.length - 1].split(',');
    return { x, y };
  };
  const gpuLast = lastPoint(gpuPoints);
  const tempLast = lastPoint(tempPoints);

  const ticks = [max, min + range / 2, min];
  const formatTick = (v: number) => v.toFixed(0);

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="GPU and temperature chart"
      style={
        {
          '--grid-shift': `${pixelsPerSecond}px`,
          '--grid-duration': '1s'
        } as Record<string, string>
      }
    >
      <rect x="0" y="0" width={width} height={height} rx="12" ry="12" />
      <line
        className="axis"
        x1={pad.left}
        y1={pad.top}
        x2={pad.left}
        y2={height - pad.bottom}
      />
      <line
        className="axis"
        x1={pad.left}
        y1={height - pad.bottom}
        x2={width - pad.right}
        y2={height - pad.bottom}
      />
      <g className="grid">
        {Array.from({ length: windowSeconds + 1 }).map((_, idx) => {
          const x = pad.left + (idx / windowSeconds) * (width - pad.left - pad.right);
          return <line key={idx} x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} />;
        })}
      </g>
      <g className="ticks">
        {ticks.map((tick, idx) => {
          const y = pad.top + (1 - (tick - min) / range) * (height - pad.top - pad.bottom);
          return (
            <g key={idx} className="tick">
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} />
              <text x={pad.left - 6} y={y + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
      </g>
      {Array.from({ length: windowSeconds + 1 }).map((_, idx) => {
        if (idx % 60 !== 0) return null;
        if (idx === 0 || idx === windowSeconds) return null;
        const x = pad.left + (idx / windowSeconds) * (width - pad.left - pad.right);
        const label = new Date(minTs + idx * 1000).toLocaleTimeString();
        return (
          <text key={idx} className="time-tick" x={x} y={height - 8} textAnchor="middle">
            {label}
          </text>
        );
      })}
      <text className="time-label" x={pad.left} y={height - 8} textAnchor="start">
        {new Date(minTs).toLocaleTimeString()}
      </text>
      <text className="time-label" x={width - pad.right} y={height - 8} textAnchor="end">
        {new Date(maxTs).toLocaleTimeString()}
      </text>
      {gpuPoints.length > 1 && <polyline points={gpuPoints.join(' ')} className="line gpu" />}
      {tempPoints.length > 1 && <polyline points={tempPoints.join(' ')} className="line temp" />}
      {gpuLast && <circle className="dot gpu" cx={gpuLast.x} cy={gpuLast.y} r="3" />}
      {tempLast && <circle className="dot temp" cx={tempLast.x} cy={tempLast.y} r="3" />}
    </svg>
  );
}
