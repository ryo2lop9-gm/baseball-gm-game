import {
  DEFAULT_STRIKE_ZONE,
  PITCH_LOCATION_CONFIG,
} from "../config/pitchLocationConfig.js";
import { getCourseGrade } from "./pitchQualityService.js";

function assertFiniteFields(value, fieldNames, label) {
  if (value === null || typeof value !== "object") {
    throw new TypeError(`${label} must be an object`);
  }

  for (const fieldName of fieldNames) {
    if (!Number.isFinite(value[fieldName])) {
      throw new TypeError(`${label}.${fieldName} must be a finite number`);
    }
  }
}

function validateZoneBounds(zoneBounds) {
  assertFiniteFields(
    zoneBounds,
    ["xMin", "xMax", "zMin", "zMax"],
    "zoneBounds"
  );

  if (zoneBounds.xMin >= zoneBounds.xMax) {
    throw new RangeError("zoneBounds.xMin must be less than zoneBounds.xMax");
  }
  if (zoneBounds.zMin >= zoneBounds.zMax) {
    throw new RangeError("zoneBounds.zMin must be less than zoneBounds.zMax");
  }
}

function getLegacyColumn(normalizedX) {
  const {
    centerHalfExtent,
    firstOutside,
    firstInside,
    center,
    lastInside,
    lastOutside,
  } = PITCH_LOCATION_CONFIG.legacyGrid;

  if (normalizedX < -PITCH_LOCATION_CONFIG.normalizedRadiusLimits.zoneMax) {
    return firstOutside;
  }
  if (normalizedX < -centerHalfExtent) return firstInside;
  if (normalizedX <= centerHalfExtent) return center;
  if (normalizedX <= PITCH_LOCATION_CONFIG.normalizedRadiusLimits.zoneMax) {
    return lastInside;
  }
  return lastOutside;
}

function getLegacyRow(normalizedZ) {
  const {
    centerHalfExtent,
    firstOutside,
    firstInside,
    center,
    lastInside,
    lastOutside,
  } = PITCH_LOCATION_CONFIG.legacyGrid;

  if (normalizedZ > PITCH_LOCATION_CONFIG.normalizedRadiusLimits.zoneMax) {
    return firstOutside;
  }
  if (normalizedZ > centerHalfExtent) return firstInside;
  if (normalizedZ >= -centerHalfExtent) return center;
  if (normalizedZ >= -PITCH_LOCATION_CONFIG.normalizedRadiusLimits.zoneMax) {
    return lastInside;
  }
  return lastOutside;
}

function getAttackRegion(normalizedRadius) {
  const {
    heartMax,
    zoneMax,
    shadowOuterMax,
    chaseMax,
  } = PITCH_LOCATION_CONFIG.normalizedRadiusLimits;

  if (normalizedRadius <= heartMax) {
    return {
      attackRegion: "HEART",
      attackRegionDetail: "HEART",
      shadowSide: null,
    };
  }
  if (normalizedRadius <= zoneMax) {
    return {
      attackRegion: "SHADOW",
      attackRegionDetail: "SHADOW_IN",
      shadowSide: "IN",
    };
  }
  if (normalizedRadius <= shadowOuterMax) {
    return {
      attackRegion: "SHADOW",
      attackRegionDetail: "SHADOW_OUT",
      shadowSide: "OUT",
    };
  }
  if (normalizedRadius <= chaseMax) {
    return {
      attackRegion: "CHASE",
      attackRegionDetail: "CHASE",
      shadowSide: null,
    };
  }
  return {
    attackRegion: "WASTE",
    attackRegionDetail: "WASTE",
    shadowSide: null,
  };
}

export function classifyPitchLocation(
  actualPoint,
  zoneBounds = DEFAULT_STRIKE_ZONE
) {
  assertFiniteFields(actualPoint, ["x", "z"], "actualPoint");
  validateZoneBounds(zoneBounds);

  const zoneCenterX = (zoneBounds.xMin + zoneBounds.xMax) / 2;
  const zoneCenterZ = (zoneBounds.zMin + zoneBounds.zMax) / 2;
  const zoneHalfWidth = (zoneBounds.xMax - zoneBounds.xMin) / 2;
  const zoneHalfHeight = (zoneBounds.zMax - zoneBounds.zMin) / 2;
  const normalizedX = (actualPoint.x - zoneCenterX) / zoneHalfWidth;
  const normalizedZ = (actualPoint.z - zoneCenterZ) / zoneHalfHeight;
  const normalizedRadius = Math.max(
    Math.abs(normalizedX),
    Math.abs(normalizedZ)
  );
  const { meatballMax, zoneMax } =
    PITCH_LOCATION_CONFIG.normalizedRadiusLimits;
  const zoneRow = getLegacyRow(normalizedZ);
  const zoneCol = getLegacyColumn(normalizedX);

  return {
    actualPoint: { x: actualPoint.x, z: actualPoint.z },
    normalizedX,
    normalizedZ,
    normalizedRadius,
    normalizedZoneEdgeDistance: normalizedRadius - zoneMax,
    actualIsZone: normalizedRadius <= zoneMax,
    ...getAttackRegion(normalizedRadius),
    isMeatball: normalizedRadius <= meatballMax,
    zoneRow,
    zoneCol,
    locationCourse: getCourseGrade(zoneRow, zoneCol),
  };
}

export { DEFAULT_STRIKE_ZONE };
