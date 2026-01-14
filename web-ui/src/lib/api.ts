import { StatusResponse } from '../types';

export async function startPipeline(): Promise<void> {
  const res = await fetch('/api/start', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Start failed: ${res.status} ${res.statusText}`);
  }
}

export async function stopPipeline(): Promise<void> {
  const res = await fetch('/api/stop', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Stop failed: ${res.status} ${res.statusText}`);
  }
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/status');
  if (!res.ok) {
    throw new Error(`Status failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function setNativeMode(enabled: boolean): Promise<void> {
  const res = await fetch(`/api/native/${enabled ? 'on' : 'off'}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Native mode failed: ${res.status} ${res.statusText}`);
  }
}
