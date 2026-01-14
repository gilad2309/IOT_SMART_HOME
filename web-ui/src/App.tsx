import { useEffect, useState } from 'preact/hooks';
import { ControlBar } from './components/ControlBar';
import { MetricsPanel } from './components/MetricsPanel';
import { StatusHeader } from './components/StatusHeader';
import { VideoPane } from './components/VideoPane';
import { fetchStatus, setNativeMode, startPipeline, stopPipeline } from './lib/api';
import { useMetrics } from './lib/metrics';
import { PipelineState, StatusResponse, StreamState } from './types';

export default function App() {
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [videoState, setVideoState] = useState<StreamState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'stream' | 'metrics'>('stream');
  const [cloudStatus, setCloudStatus] = useState<'on' | 'off' | 'error' | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [nativeMode, setNativeModeState] = useState(false);

  const {
    count,
    gpuUsage,
    temperature,
    gpuUpdatedAt,
    temperatureUpdatedAt,
    gpuHistory,
    temperatureHistory,
    relayState,
    alarm,
    status: mqttStatus,
    error: mqttError
  } = useMetrics(true, focusMode);
  const displayCount = pipelineState === 'streaming' ? count : null;

  useEffect(() => {
    let cancelled = false;
    if (focusMode) {
      return () => {
        cancelled = true;
      };
    }
    const poll = async () => {
      try {
        const status = await fetchStatus();
        if (cancelled) return;
        const nextState = deriveState(status);
        setPipelineState((prev) => (prev === 'starting' && nextState === 'idle' ? prev : nextState));
        setCloudStatus(status.cloud?.status ?? null);
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
  }, [focusMode]);

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
  const handleNativeToggle = async (enabled: boolean) => {
    setError(null);
    setNativeModeState(enabled);
    try {
      await setNativeMode(enabled);
      if (enabled) {
        setVideoState('idle');
      }
    } catch (err: any) {
      setError(err?.message || 'Native mode failed');
    }
  };

  if (focusMode) {
    return (
      <div className="page focus-mode">
        {nativeMode ? (
          <div className="card">
            <div className="eyebrow">Live Stream</div>
            <div className="helper">Native mode active — web stream disabled.</div>
          </div>
        ) : (
          <VideoPane
            active={pipelineState === 'streaming' && !nativeMode}
            onStatusChange={setVideoState}
            onFullscreenChange={setFocusMode}
            personCount={displayCount}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <StatusHeader
        pipelineState={pipelineState}
        videoState={videoState}
        mqttState={mqttStatus}
        cloudStatus={cloudStatus}
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
          onToggleNative={handleNativeToggle}
          nativeMode={nativeMode}
          disabled={pipelineState === 'starting'}
          error={helperError}
          mqttState={mqttStatus}
        />
      </div>
      {view === 'metrics' ? (
        <div className="card">
          <MetricsPanel
            count={displayCount}
            gpuUsage={gpuUsage}
          temperature={temperature}
          gpuUpdatedAt={gpuUpdatedAt}
          temperatureUpdatedAt={temperatureUpdatedAt}
          gpuHistory={gpuHistory}
          temperatureHistory={temperatureHistory}
          alarm={alarm}
          relayState={relayState}
        />
        </div>
      ) : nativeMode ? (
        <div className="card">
          <div className="eyebrow">Live Stream</div>
          <div className="helper">Native mode active — web stream disabled.</div>
        </div>
      ) : (
        <VideoPane
          active={pipelineState === 'streaming' && !nativeMode}
          onStatusChange={setVideoState}
          onFullscreenChange={setFocusMode}
          personCount={displayCount}
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
