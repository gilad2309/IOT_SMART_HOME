import { ConnectionState, PipelineState, StreamState } from '../types';
import './StatusHeader.css';

interface Props {
  pipelineState: PipelineState;
  videoState: StreamState;
  mqttState: ConnectionState;
  cloudStatus: 'on' | 'off' | 'error' | null;
}

const stateCopy: Record<PipelineState, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  streaming: 'Streaming',
  error: 'Error'
};

export function StatusHeader({
  pipelineState,
  videoState,
  mqttState,
  cloudStatus,
}: Props) {
  return (
    <header className="status-header">
      <div className="title-block">
        <div className="eyebrow">DeepStream Control</div>
        <div className="title-row">
          <h1>Smart surveillance system</h1>
          <div className="status-badges">
            <span className="badge">
              <span className={`dot ${pipelineState}`} />
              {stateCopy[pipelineState]}
            </span>
            <span className="badge secondary">Video: {videoCopy(videoState)}</span>
            <span className="badge secondary">MQTT: {mqttCopy(mqttState)}</span>
            {cloudStatus && (
              <span className="badge secondary">
                <span className={`dot cloud-${cloudStatus}`} />
                Cloud DB: {cloudLabel(cloudStatus)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function videoCopy(state: StreamState) {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'streaming':
      return 'streaming';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

function mqttCopy(state: ConnectionState) {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

function cloudLabel(state: 'on' | 'off' | 'error') {
  switch (state) {
    case 'on':
      return 'publishing';
    case 'off':
      return 'off';
    case 'error':
      return 'error';
    default:
      return 'off';
  }
}
