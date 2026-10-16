'use strict';

const fs = require('node:fs/promises');
const LOW_BYTES = 1024 ** 3;
const CRITICAL_BYTES = 256 * 1024 ** 2;

async function readDiskSpace(directory, statfs = fs.statfs) {
  try {
    const stat = await statfs(directory, { bigint: true });
    const availableBytes = Number(stat.bavail * stat.bsize);
    if (!Number.isFinite(availableBytes) || availableBytes < 0) throw new Error('Capacidad no válida');
    return { availableBytes, level: availableBytes < CRITICAL_BYTES ? 'critical' : availableBytes < LOW_BYTES ? 'low' : 'normal' };
  } catch {
    return { availableBytes: null, level: 'unknown' };
  }
}

async function requireDiskSpace(directory) {
  const status = await readDiskSpace(directory);
  if (status.level === 'critical') throw new Error('Quedan menos de 256 MiB disponibles en el destino. Libera espacio o elige otra carpeta; el original se conserva.');
  return status;
}

module.exports = { readDiskSpace, requireDiskSpace, LOW_BYTES, CRITICAL_BYTES };
