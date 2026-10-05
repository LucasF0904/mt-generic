#!/usr/bin/env node
'use strict';

if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('mt requer Node.js 20 ou superior.');
  process.exit(1);
}

if (process.argv.length === 3 && ['--version', '-V'].includes(process.argv[2])) {
  console.log(require('../package.json').version);
} else {
  // Resolve from the installed package; preserve argv and cwd for assistants and user paths.
  require('../dist/apps/cli/main.js');
}
