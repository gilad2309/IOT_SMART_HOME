import { ConnectionState, PipelineState } from '../types';
import './ControlBar.css';

interface Props {
  state: PipelineState;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  disabled?: boolean;
  error?: string | null;
  mqttState: ConnectionState;
}

export function ControlBar({ state, onStart, onStop, disabled, error, mqttState }: Props) {
  const isBusy = disabled || state === 'starting';
  return (
    <div className="control-bar">
      <div>
        <div className="eyebrow">Pipeline</div>
        <div className="actions">
          <button
            className="primary"
            disabled={isBusy || state === 'streaming'}
            onClick={onStart}
          >
            {state === 'starting' ? 'Starting…' : 'Start Pipeline'}
          </button>
          <button
            className="secondary"
            disabled={isBusy || state === 'idle'}
            onClick={onStop}
          >
            Stop
          </button>
        </div>
      </div>
      <div className="helper">
        {error ? <span className="error">{error}</span> : <span className="pill">{stateCopy(state)}</span>}
      </div>
    </div>
  );
}

function stateCopy(state: PipelineState) {
  switch (state) {
    case 'idle':
      return 'Idle. Click start to launch DeepStream + MediaMTX + MQTT bridge.';
    case 'starting':
      return 'Starting services…';
    case 'streaming':
      return 'Running. Stream should be available at /ds-test/whep.';
    case 'error':
      return 'Error. Check logs.';
    default:
      return '';
  }
}

function mqttCopy(state: ConnectionState) {
  return state;
}
