'use strict';
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

async function writeJsonAtomically(file, value) {
  const partial = `${file}.${randomUUID()}.partial`;
  try {
    await fs.writeFile(partial, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(partial, file);
  } finally {
    await fs.rm(partial, { force: true }).catch(() => {});
  }
}
module.exports = { writeJsonAtomically };
