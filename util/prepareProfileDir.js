'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Ensure the profile directory exists and clean leftover Chrome locks.
 */
function prepareProfileDir() {
  const dataPath = process.env.DATA_PATH || path.resolve('./data');
  fs.mkdirSync(dataPath, { recursive: true });

  const safeFlag = process.env.SAFE_LOCK_CLEANUP;
  if (safeFlag && ['0', 'false'].includes(safeFlag.toLowerCase())) {
    return;
  }

  let hasProcess = false;
  try {
    execSync(`pgrep -f "chrome.*--user-data-dir=${dataPath}"`, { stdio: 'ignore' });
    hasProcess = true;
  } catch (err) {
    hasProcess = false;
  }

  if (!hasProcess) {
    for (const file of fs.readdirSync(dataPath)) {
      if (file.startsWith('Singleton')) {
        fs.rmSync(path.join(dataPath, file), { force: true });
      }
    }
  }
}

module.exports = { prepareProfileDir };
