/**
 * DeepSeek Harness 桌面版 — Electron 主进程。
 *
 * 职责：
 *  1. 单实例锁（重复启动时聚焦已有窗口）。
 *  2. 将用户数据目录(DSH_HOME)指向 D:\deepseek harness\data。
 *  3. 用一个空闲端口启动 dsh web（官方 Web UI 的本地服务）。
 *  4. 轮询等服务就绪后，在原生窗口里加载该 UI。
 *  5. 退出时结束 dsh 子进程。
 *
 * dsh 由本应用自带的便携版 Node 运行时（runtime/node/node.exe）执行，
 * 与 node_modules 里原生模块的 ABI 完全匹配，因此整包无需系统 Node 或 npx 缓存，
 * 是自包含的桌面应用。
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
// 用户数据目录。可被环境变量 DSH_HOME 覆盖；默认固定在 D 盘本文件夹下的 data/。
const DEFAULT_DATA_DIR = 'D:\\deepseek harness\\data';
const DATA_DIR = (process.env.DSH_HOME && process.env.DSH_HOME.trim())
  ? process.env.DSH_HOME
  : DEFAULT_DATA_DIR;

const HOST = '127.0.0.1';
// 首次启动要生成 profile 回退链接并加载整套插件，给足时间。
const STARTUP_TIMEOUT_MS = 120 * 1000;
const POLL_INTERVAL_MS = 250;

let mainWindow = null;
let dshProcess = null;

// 简单日志（GUI 应用没有控制台，写进 data 目录便于排查）。
function log(message) {
  try {
    fs.appendFileSync(path.join(DATA_DIR, 'desktop.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) { /* 日志失败不影响主流程 */ }
}

// ---------------------------------------------------------------------------
// 单实例
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start);
}

// dsh CLI 入口（本应用 node_modules 内的 @deepseek-ai/dsh）。
function dshBinPath() {
  return path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

// 运行 dsh 所用的 Node 运行时。
// 优先使用自带的便携版 Node（runtime/node/node.exe），保证自包含且与原生模块 ABI 匹配；
// 其次 DSH_NODE 环境变量，最后回退到系统 PATH 里的 node。
function nodeExecutable() {
  const bundled = path.join(__dirname, 'runtime', 'node', 'node.exe');
  if (process.env.DSH_NODE && fs.existsSync(process.env.DSH_NODE)) return process.env.DSH_NODE;
  if (fs.existsSync(bundled)) return bundled;
  return 'node';
}

// 让操作系统挑一个空闲端口。
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// 轮询等待本地 Web 服务就绪。
function waitForUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(1000, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`无法在 ${timeoutMs}ms 内连上 ${url}`));
        } else {
          setTimeout(tick, POLL_INTERVAL_MS);
        }
      });
    };
    tick();
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    backgroundColor: '#0b0e14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // 外部链接交给系统默认浏览器；仅放行本机服务地址在窗口内打开。
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://127.0.0.1') || target.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);
}

function fail(title, message) {
  dialog.showErrorBox(title, message);
  app.quit();
}

async function start() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  log(`start: DATA_DIR=${DATA_DIR} node=${nodeExecutable()}`);

  const bin = dshBinPath();
  if (!fs.existsSync(bin)) {
    log(`missing dsh CLI: ${bin}`);
    fail('缺少依赖', `找不到 dsh CLI：\n${bin}`);
    return;
  }

  let port;
  try {
    port = await findFreePort();
  } catch (err) {
    log(`findFreePort failed: ${String(err)}`);
    fail('启动失败', `无法分配空闲端口：\n${String(err)}`);
    return;
  }

  const url = `http://${HOST}:${port}`;
  const nodePath = nodeExecutable();
  log(`spawning: ${nodePath} ${bin} web --host ${HOST} --port ${port}`);

  dshProcess = spawn(
    nodePath,
    [bin, 'web', '--host', HOST, '--port', String(port)],
    {
      env: { ...process.env, DSH_HOME: DATA_DIR },
      stdio: 'inherit',
      windowsHide: true
    }
  );

  dshProcess.on('error', (err) => {
    log(`dsh spawn error: ${String(err)}`);
    fail('启动失败', `无法启动 dsh：\n${String(err)}`);
  });

  dshProcess.on('exit', (code, signal) => {
    log(`dsh exited code=${code} signal=${signal}`);
    dshProcess = null;
    // 若非正常退出流程（比如 dsh 崩了），让整个应用随之退出。
    if (!app.isQuitting) {
      fail('dsh 已退出', `dsh 进程意外结束（code=${code} signal=${signal}）`);
    }
  });

  try {
    await waitForUrl(url, STARTUP_TIMEOUT_MS);
  } catch (err) {
    log(`startup timeout: ${String(err && err.message ? err.message : err)}`);
    fail('启动超时', String(err && err.message ? err.message : err));
    return;
  }

  log(`ready: ${url}`);
  createWindow(url);
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
app.isQuitting = false;

app.on('before-quit', () => {
  app.isQuitting = true;
  if (dshProcess) {
    try { dshProcess.kill(); } catch (_) { /* already gone */ }
    dshProcess = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
