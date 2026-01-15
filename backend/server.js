// Simple local web server + pipeline orchestrator.
// - Serves static files from repo root.
// - POST /api/start starts DeepStream, MediaMTX, and the LED notifier (assumes Mosquitto on 1883/9001).
// - GET /api/status returns running process info.

const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const BACKEND_DIR = __dirname;
const BASE_DIR = path.join(__dirname, '..');
const UI_ROOT = path.join(BASE_DIR, 'web-ui', 'dist');
const LOG_DIR = path.join(BACKEND_DIR, 'data', 'logs');
const PORT = 8081;
const CONFIG_WEB = path.join(BACKEND_DIR, 'deepstream', 'configs/DeepStream-Yolo/deepstream_app_config.txt');
const CONFIG_NATIVE = path.join(
  BACKEND_DIR,
  'deepstream',
  'configs/DeepStream-Yolo/deepstream_app_config_native.txt'
);

const processes = {};
const pipelineProcesses = new Set(['deepstream', 'mediamtx', 'led_notifier']);
let nativeMode = false;
let suppressAutoSwitch = false;

function getDeepstreamEnv() {
  return {
    MQTT_HOST: process.env.DEEPSTREAM_MQTT_HOST || 'mqtt-dashboard.com',
    MQTT_PORT: process.env.DEEPSTREAM_MQTT_PORT || '1883',
    MQTT_TOPIC: process.env.DEEPSTREAM_MQTT_TOPIC || 'deepstream/person_count',
    MQTT_CLIENT_ID: process.env.DEEPSTREAM_MQTT_CLIENT_ID || undefined
  };
}

function parseFlags(argv) {
  return new Set(argv.filter((arg) => arg.startsWith('--')));
}

const flags = parseFlags(process.argv.slice(2));
const ddbFlag =
  flags.has('--ddb') ? '1' : flags.has('--no-ddb') ? '0' : process.env.DDB_ENABLED;
const routes = new Map();

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
}

function killByPattern(pattern) {
  try {
    spawnSync('pkill', ['-f', pattern], { stdio: 'ignore' });
  } catch {
    // Best-effort cleanup.
  }
}

function stopAllDeepstream() {
  stopProcess('deepstream');
  killByPattern('deepstream-test5-app');
}

function stopAllMediamtx() {
  stopProcess('mediamtx');
  killByPattern('mediamtx');
}

function startProcess(name, cmd, args, opts = {}) {
  if (processes[name]) return { status: 'already_running', pid: processes[name].pid };
  ensureLogDir();
  const stdout = fs.openSync(path.join(LOG_DIR, `${name}.out.log`), 'a');
  const stderr = fs.openSync(path.join(LOG_DIR, `${name}.err.log`), 'a');
  const child = spawn(cmd, args, {
    cwd: opts.cwd || BACKEND_DIR,
    env: { ...process.env, ...opts.env },
    detached: false,
    stdio: ['ignore', stdout, stderr]
  });
  processes[name] = child;
  child.on('exit', (code, signal) => {
    delete processes[name];
    const msg = `[${name}] exited code=${code} signal=${signal}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${name}.err.log`), msg);
    if (name === 'deepstream' && nativeMode && !suppressAutoSwitch) {
      switchToWebModeFromNative();
    }
  });
  return { status: 'started', pid: child.pid };
}

function handleStart(req, res) {
  const results = {};
  stopAllDeepstream();
  stopAllMediamtx();
  // DeepStream first.
  results.deepstream = startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', nativeMode ? CONFIG_NATIVE : CONFIG_WEB],
    {
      cwd: path.join(BACKEND_DIR, 'deepstream'),
      env: getDeepstreamEnv()
    }
  );

  const finish = () => {
    results.led_notifier = startProcess('led_notifier', 'python3', [path.join(BACKEND_DIR, 'mqtt', 'person_led_mqtt.py')], {
      env: {
        MQTT_HOST: process.env.LED_MQTT_HOST || 'mqtt-dashboard.com',
        MQTT_PORT: process.env.LED_MQTT_PORT || '1883',
        LED_TOGGLE_TOPIC: process.env.LED_TOGGLE_TOPIC || 'actuator/led_toggle',
        LED_PIN: process.env.LED_PIN || '7',
        LED_HOLD_SECONDS: process.env.LED_HOLD_SECONDS || '5'
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, results }));
  };

  if (nativeMode) {
    finish();
    return;
  }

  waitForPort(8554, '127.0.0.1', 15000)
    .then(() => {
      results.mediamtx = startProcess(
        'mediamtx',
        path.join(BACKEND_DIR, 'mediamtx', 'mediamtx'),
        [path.join(BACKEND_DIR, 'mediamtx', 'mediamtx.yml')],
        { cwd: path.join(BACKEND_DIR, 'mediamtx') }
      );
    })
    .catch(() => {
      results.mediamtx = { status: 'failed_waiting_for_rtsp' };
    })
    .finally(finish);
}

function handleStatus(req, res) {
  const status = Object.fromEntries(
    Object.entries(processes)
      .filter(([name]) => pipelineProcesses.has(name))
      .map(([name, child]) => [name, { pid: child.pid }])
  );
  const ddbEnabled = ddbFlag === '1';
  let cloudStatus = 'off';
  if (ddbEnabled) {
    if (!processes.data_manager) {
      cloudStatus = 'error';
    } else {
      const ttlSeconds = Number(process.env.DDB_HEARTBEAT_TTL_SECONDS || '30');
      const heartbeatPath =
        process.env.DDB_HEARTBEAT_PATH || path.join(BACKEND_DIR, 'data', 'ddb_heartbeat.json');
      try {
        const stat = fs.statSync(heartbeatPath);
        const ageMs = Date.now() - stat.mtimeMs;
        cloudStatus = ageMs <= ttlSeconds * 1000 ? 'on' : 'error';
      } catch {
        cloudStatus = 'error';
      }
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      running: status,
      cloud: { provider: 'dynamodb', status: cloudStatus },
      nativeMode
    })
  );
}

routes.set('POST /api/start', handleStart);
routes.set('POST /api/stop', handleStop);
routes.set('POST /api/native/on', handleNativeOn);
routes.set('POST /api/native/off', handleNativeOff);
routes.set('GET /api/status', handleStatus);

function waitForPort(port, host, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect(port, host);
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        retry();
      });
      socket.on('error', () => {
        socket.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('timeout'));
      } else {
        setTimeout(tryConnect, 500);
      }
    };
    tryConnect();
  });
}

function stopProcess(name) {
  const proc = processes[name];
  if (!proc) return { status: 'not_running' };
  proc.kill('SIGTERM');
  delete processes[name];
  return { status: 'stopped' };
}

function handleStop(req, res) {
  suppressAutoSwitch = true;
  const stopped = {
    deepstream: stopProcess('deepstream'),
    mediamtx: stopProcess('mediamtx'),
    led_notifier: stopProcess('led_notifier')
  };
  stopAllDeepstream();
  stopAllMediamtx();
  setTimeout(() => {
    suppressAutoSwitch = false;
  }, 1000);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, stopped }));
}

function handleNativeOn(req, res) {
  nativeMode = true;
  suppressAutoSwitch = true;
  stopAllMediamtx();
  stopAllDeepstream();
  const stopped = { mediamtx: 'stopped', deepstream: 'stopped' };
  const started = startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', CONFIG_NATIVE],
    { cwd: path.join(BACKEND_DIR, 'deepstream'), env: getDeepstreamEnv() }
  );
  setTimeout(() => {
    suppressAutoSwitch = false;
  }, 1000);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, nativeMode, stopped, started }));
}

function handleNativeOff(req, res) {
  nativeMode = false;
  suppressAutoSwitch = true;
  stopAllDeepstream();
  const stopped = 'stopped';
  const started = startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', CONFIG_WEB],
    { cwd: path.join(BACKEND_DIR, 'deepstream'), env: getDeepstreamEnv() }
  );
  waitForPort(8554, '127.0.0.1', 15000)
    .then(() => {
      const startedMediamtx = startProcess(
        'mediamtx',
        path.join(BACKEND_DIR, 'mediamtx', 'mediamtx'),
        [path.join(BACKEND_DIR, 'mediamtx', 'mediamtx.yml')],
        { cwd: path.join(BACKEND_DIR, 'mediamtx') }
      );
      setTimeout(() => {
        suppressAutoSwitch = false;
      }, 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, nativeMode, stopped, started, startedMediamtx }));
    })
    .catch(() => {
      setTimeout(() => {
        suppressAutoSwitch = false;
      }, 1000);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, nativeMode, stopped, started, error: 'failed_waiting_for_rtsp' }));
    });
}

function switchToWebModeFromNative() {
  nativeMode = false;
  if (processes.deepstream) return;
  startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', CONFIG_WEB],
    { cwd: path.join(BACKEND_DIR, 'deepstream'), env: getDeepstreamEnv() }
  );
  waitForPort(8554, '127.0.0.1', 15000)
    .then(() => {
      startProcess(
        'mediamtx',
        path.join(BACKEND_DIR, 'mediamtx', 'mediamtx'),
        [path.join(BACKEND_DIR, 'mediamtx', 'mediamtx.yml')],
        { cwd: path.join(BACKEND_DIR, 'mediamtx') }
      );
    })
    .catch(() => {});
}

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = 'index.html';
  const requestPath = pathname.replace(/^\/+/, '');
  const roots = [UI_ROOT, BASE_DIR];

  for (const base of roots) {
    const filePath = path.join(base, requestPath);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(base)) continue; // path traversal guard
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      const ct = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      fs.createReadStream(resolved).pipe(res);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes.get(key);
  if (handler) return handler(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Local server running on http://127.0.0.1:${PORT}`);
  console.log(`Serving static files from ${UI_ROOT} (then ${BASE_DIR} fallback)`);
  console.log('Endpoints: POST /api/start, GET /api/status');
});

// Start data manager immediately on server launch.
startProcess('data_manager', 'python3', [path.join(BACKEND_DIR, 'mqtt', 'data_manager.py')], {
  env: {
    MQTT_URL:
      process.env.DATA_MANAGER_MQTT_URL ||
      process.env.MQTT_URL ||
      'mqtt://mqtt-dashboard.com:1883',
    UI_METRICS_PREFIX: process.env.UI_METRICS_PREFIX || 'ui/metrics',
    UI_ALARM_TOPIC: process.env.UI_ALARM_TOPIC || 'ui/alarms',
    TEMP_WARN_C: process.env.TEMP_WARN_C || '70',
    TEMP_ALARM_C: process.env.TEMP_ALARM_C || '80',
    GPU_WARN_PCT: process.env.GPU_WARN_PCT || '85',
    GPU_ALARM_PCT: process.env.GPU_ALARM_PCT || '95',
    DDB_ENABLED: ddbFlag || '0',
    AWS_REGION: process.env.AWS_REGION,
    DDB_METRICS_TABLE: process.env.DDB_METRICS_TABLE || 'metrics',
    DDB_ALARMS_TABLE: process.env.DDB_ALARMS_TABLE || 'alarms',
    DDB_HEARTBEAT_PATH:
      process.env.DDB_HEARTBEAT_PATH || path.join(BACKEND_DIR, 'data', 'ddb_heartbeat.json'),
    PYTHONUNBUFFERED: '1'
  }
});

// Start telemetry immediately on server launch.
startProcess('telemetry', 'python3', [path.join(BACKEND_DIR, 'mqtt', 'jetson_telemetry.py')], {
  env: {
    MQTT_HOST: process.env.TELEMETRY_MQTT_HOST || process.env.MQTT_HOST || 'mqtt-dashboard.com',
    MQTT_PORT: process.env.TELEMETRY_MQTT_PORT || process.env.MQTT_PORT || '1883',
    MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID || 'jetson-telemetry',
    MQTT_QOS: process.env.MQTT_QOS || '0',
    TELEMETRY_INTERVAL_SECONDS: process.env.TELEMETRY_INTERVAL_SECONDS || '5',
    PYTHONUNBUFFERED: '1'
  }
});

// Start fake relay actuator emulator.
startProcess('relay_emulator', 'python3', [path.join(BACKEND_DIR, 'mqtt', 'relay_emulator.py')], {
  env: {
    MQTT_URL: process.env.MQTT_URL || 'mqtt://mqtt-dashboard.com:1883',
    RELAY_COMMAND_TOPIC: process.env.RELAY_COMMAND_TOPIC || 'actuator/relay',
    RELAY_STATUS_TOPIC: process.env.RELAY_STATUS_TOPIC || 'actuator/relay_status'
  }
});

process.on('SIGINT', () => {
  Object.values(processes).forEach((child) => child.kill('SIGTERM'));
  process.exit(0);
});
