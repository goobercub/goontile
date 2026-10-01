'use strict';

// Robust launcher: ELECTRON_RUN_AS_NODE forces Electron to behave like plain
// Node (require('electron') returns a string, `app` is undefined → instant crash).
// Some environments (VSCode integrated terminals, certain CLIs) set this. Strip it
// and any related flags before spawning the real Electron GUI process.

const { spawn } = require('child_process');
const electronPath = require('electron'); // path to electron.exe binary

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
// webSecurity is intentionally disabled to load local file:// media; silence the dev warnings.
env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('close', (code) => process.exit(code === null ? 0 : code));
child.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to launch Electron:', err);
  process.exit(1);
});
