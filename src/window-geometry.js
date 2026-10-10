function mapPhysicalRectToDisplay(rect, monitor, display) {
  const values = [
    rect?.x, rect?.y, rect?.width, rect?.height,
    monitor?.x, monitor?.y, monitor?.width, monitor?.height,
    display?.bounds?.x, display?.bounds?.y, display?.bounds?.width, display?.bounds?.height
  ];
  if (!values.every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0
    || monitor.width <= 0 || monitor.height <= 0
    || display.bounds.width <= 0 || display.bounds.height <= 0) {
    throw new Error('Las dimensiones de la ventana no son válidas.');
  }

  return {
    x: display.bounds.x + (rect.x - monitor.x) * display.bounds.width / monitor.width,
    y: display.bounds.y + (rect.y - monitor.y) * display.bounds.height / monitor.height,
    width: rect.width * display.bounds.width / monitor.width,
    height: rect.height * display.bounds.height / monitor.height
  };
}

module.exports = { mapPhysicalRectToDisplay };
