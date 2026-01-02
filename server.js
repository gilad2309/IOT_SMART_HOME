// Simple local web server + pipeline orchestrator.
// - Serves static files from repo root.
// - POST /api/start starts DeepStream, MediaMTX, and the MQTT bridge (assumes Mosquitto on 1883/9001).
// - GET /api/status returns running process info.

const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const PORT = 8081;

const processes = {};
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

function startProcess(name, cmd, args, opts = {}) {
  if (processes[name]) return { status: 'already_running', pid: processes[name].pid };
  ensureLogDir();
  const stdout = fs.openSync(path.join(LOG_DIR, `${name}.out.log`), 'a');
  const stderr = fs.openSync(path.join(LOG_DIR, `${name}.err.log`), 'a');
  const child = spawn(cmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    detached: false,
    stdio: ['ignore', stdout, stderr]
  });
  processes[name] = child;
  child.on('exit', (code, signal) => {
    delete processes[name];
    const msg = `[${name}] exited code=${code} signal=${signal}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${name}.err.log`), msg);
  });
  return { status: 'started', pid: child.pid };
}

function handleStart(req, res) {
  const results = {};
  // DeepStream first.
  results.deepstream = startProcess('deepstream', './deepstream-test5-app', ['-c', 'configs/DeepStream-Yolo/deepstream_app_config.txt']);

  // Wait for RTSP 8554 to be reachable before starting MediaMTX.
  waitForPort(8554, '127.0.0.1', 15000)
    .then(() => {
      results.mediamtx = startProcess('mediamtx', './mediamtx', ['mediamtx.yml']);
    })
    .catch(() => {
      results.mediamtx = { status: 'failed_waiting_for_rtsp' };
    })
    .finally(() => {
      // Start MQTT bridge (assumes broker on 1883/9001).
      results.bridge = startProcess('mqtt_bridge', 'node', ['person_mqtt_bridge.js'], {
        env: {
          MQTT_URL: process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
          MQTT_TOPIC: process.env.MQTT_TOPIC || 'deepstream/person_count'
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results }));
    });
}

function handleStatus(req, res) {
  const status = Object.fromEntries(Object.entries(processes).map(([name, child]) => [name, { pid: child.pid }]));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ running: status }));
}

routes.set('POST /api/start', handleStart);
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

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const ct = mime[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes.get(key);
  if (handler) return handler(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Local server running on http://127.0.0.1:${PORT}`);
  console.log(`Serving static files from ${ROOT}`);
  console.log('Endpoints: POST /api/start, GET /api/status');
});

process.on('SIGINT', () => {
  Object.values(processes).forEach((child) => child.kill('SIGTERM'));
  process.exit(0);
});
