export function getMeasurementClass(launchAngle) {
  const value = Number(launchAngle);
  if (!Number.isFinite(value)) {
    const error = new Error("Launch angle must be a finite number.");
    error.code = "MEASUREMENT_CLASS_LA_INVALID";
    error.context = { launchAngle };
    throw error;
  }
  if (value < 10) return "GB";
  if (value < 25) return "LD";
  if (value < 50) return "FB";
  return "PU";
}
