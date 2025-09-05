'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./logger');

/**
 * Ensure the profile directory exists and clean leftover Chrome locks.
 *
 * @param {string} dataPath - The base directory where session data lives.
 */
function prepareProfileDir(
  dataPath = process.env.DATA_PATH || path.resolve('./data')
) {
  fs.mkdirSync(dataPath, { recursive: true });

  const safeFlag = process.env.SAFE_LOCK_CLEANUP;
  if (safeFlag && ['0', 'false'].includes(safeFlag.toLowerCase())) {
    return;
  }

  let pids = [];
  try {
    const stdout = execSync(
      `pgrep -f "chrome.*--user-data-dir=${dataPath}"`,
      { encoding: 'utf8' }
    );
    pids = stdout
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  } catch (err) {
    pids = [];
    logger.warn('Failed to find running Chrome processes:', err.message || err);
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch (err) {
      logger.warn(`Failed to kill Chrome process ${pid}:`, err.message || err);
    }
  }

  for (const file of fs.readdirSync(dataPath)) {
    if (file.startsWith('Singleton')) {
      fs.rmSync(path.join(dataPath, file), { force: true });
    }
  }
}

module.exports = { prepareProfileDir };
