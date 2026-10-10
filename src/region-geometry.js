function mapRegionToBounds(region, frame, bounds) {
  if (!region || !frame || !bounds
    || ![region.x, region.y, region.width, region.height, frame.width, frame.height, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Las dimensiones del área seleccionada no son válidas.');
  }

  return {
    x: Math.round(bounds.x + region.x * bounds.width / frame.width),
    y: Math.round(bounds.y + region.y * bounds.height / frame.height),
    width: Math.max(1, Math.round(region.width * bounds.width / frame.width)),
    height: Math.max(1, Math.round(region.height * bounds.height / frame.height))
  };
}

module.exports = { mapRegionToBounds };
