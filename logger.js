'use strict';

const fs = require('fs');
const path = require('path');

let logPath = null;

function init(dir) {
  logPath = path.join(dir, 'debug.log');
  try {
    fs.writeFileSync(logPath, ''); // truncate on each launch
  } catch (e) {
    logPath = null;
  }
  log('LOGGER', `Log initialized at ${logPath}`);
}

function ts() {
  return new Date().toISOString();
}

function log(tag, ...args) {
  const msg = args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ');
  const line = `[${ts()}] [${tag}] ${msg}`;
  // eslint-disable-next-line no-console
  console.log(line);
  if (logPath) {
    try { fs.appendFileSync(logPath, line + '\n'); } catch (_) { /* ignore */ }
  }
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (_) { return String(obj); }
}

function getLogPath() {
  return logPath;
}

module.exports = { init, log, getLogPath };
