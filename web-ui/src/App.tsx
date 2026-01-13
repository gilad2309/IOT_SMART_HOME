import { useEffect, useMemo, useState } from 'preact/hooks';
import { ControlBar } from './components/ControlBar';
import { MetricsPanel } from './components/MetricsPanel';
import { StatusHeader } from './components/StatusHeader';
import { VideoPane } from './components/VideoPane';
import { fetchStatus, startPipeline, stopPipeline } from './lib/api';
import { useMetrics } from './lib/metrics';
import { PipelineState, StatusResponse, StreamState } from './types';

export default function App() {
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [videoState, setVideoState] = useState<StreamState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<'stream' | 'metrics'>('stream');

  const host = useMemo(() => window.location.host, []);
  const {
    count,
    gpuUsage,
    temperature,
    gpuUpdatedAt,
    temperatureUpdatedAt,
    relayState,
    alarm,
    status: mqttStatus,
    error: mqttError
  } = useMetrics(true);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await fetchStatus();
        if (cancelled) return;
        const nextState = deriveState(status);
        setPipelineState((prev) => (prev === 'starting' && nextState === 'idle' ? prev : nextState));
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError('Failed to fetch status');
          setPipelineState((prev) => (prev === 'starting' ? prev : 'error'));
        }
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleStart = async () => {
    setError(null);
    setPipelineState('starting');
    try {
      await startPipeline();
      // Remain in "starting" until the status poll sees running processes.
      setPipelineState('starting');
    } catch (err: any) {
      setError(err?.message || 'Start failed');
      setPipelineState('error');
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      await stopPipeline();
      setPipelineState('idle');
    } catch (err: any) {
      setError(err?.message || 'Stop failed');
      setPipelineState('error');
    }
  };

  const helperError = error || mqttError;

  return (
    <div className="page">
      <StatusHeader
        pipelineState={pipelineState}
        videoState={videoState}
        mqttState={mqttStatus}
        host={host}
        lastUpdated={lastUpdated}
      />
      <div className="view-toggle">
        <button
          className={view === 'stream' ? 'primary' : 'secondary'}
          onClick={() => setView('stream')}
        >
          Live Stream
        </button>
        <button
          className={view === 'metrics' ? 'primary' : 'secondary'}
          onClick={() => setView('metrics')}
        >
          Live Metrics
        </button>
      </div>
      <div className="card">
        <ControlBar
          state={pipelineState}
          onStart={handleStart}
          onStop={handleStop}
          disabled={pipelineState === 'starting'}
          error={helperError}
          mqttState={mqttStatus}
        />
      </div>
      {view === 'metrics' ? (
        <div className="card">
        <MetricsPanel
          count={count}
          gpuUsage={gpuUsage}
          temperature={temperature}
          gpuUpdatedAt={gpuUpdatedAt}
          temperatureUpdatedAt={temperatureUpdatedAt}
          alarm={alarm}
          relayState={relayState}
        />
        </div>
      ) : (
        <VideoPane
          active={pipelineState === 'streaming'}
          onStatusChange={setVideoState}
          personCount={count}
        />
      )}
    </div>
  );
}

function deriveState(status: StatusResponse): PipelineState {
  const runningCount = Object.keys(status.running || {}).length;
  if (runningCount === 0) return 'idle';
  return 'streaming';
}
