'use strict';

const UPDATE_ARGUMENT = '--prepare-for-update';

function configureAppLifecycle({ app, args = process.argv, onSecondLaunch, onUpdateRequest }) {
  const updateRequested = args.includes(UPDATE_ARGUMENT);
  const ownsInstance = app.requestSingleInstanceLock({ updateRequested });
  if (!ownsInstance || updateRequested) {
    app.whenReady().then(() => app.quit());
    return false;
  }
  app.on('second-instance', (_event, commandLine, _workingDirectory, additionalData) => {
    if (additionalData?.updateRequested === true || commandLine.includes(UPDATE_ARGUMENT)) onUpdateRequest();
    else onSecondLaunch();
  });
  return true;
}

module.exports = { configureAppLifecycle, UPDATE_ARGUMENT };
