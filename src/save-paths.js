'use strict';

const path = require('node:path');

function chooseUniqueMediaPath(targetPath, isOccupied = () => false) {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let suffix = 2;
  while (isOccupied(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name} (${suffix})${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
}

module.exports = { chooseUniqueMediaPath };
