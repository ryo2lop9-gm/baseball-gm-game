import { DEFENSE_POSITIONS } from "./defenseConfig.js";

const baseDistanceFt = 90;
const baseAxisFt = baseDistanceFt / Math.sqrt(2);

function point(x, y) {
  return Object.freeze({ x, y });
}

export const FIELD_GEOMETRY_MODES = Object.freeze(["off", "shadow"]);

export const FIELD_GEOMETRY_CONFIG = Object.freeze({
  defaultMode: "off",
  shadowMode: "shadow",
  model: "provisional_ev_la_geometry_shadow_v1",
  geometryEventSchemaVersion: 2,
  coordinateSystem: "home_plate_xy_feet_v1",
  units: Object.freeze({
    distance: "feet",
    time: "seconds",
    speed: "feet_per_second",
  }),
  fairAngle: Object.freeze({ min: -45, max: 45 }),
  parkId: "neutral_mlb_shadow",
  alignmentModel: "standard_alignment_v1",
  baseDistanceFt,
  baseAxisFt,
  bases: Object.freeze({
    home: point(0, 0),
    first: point(baseAxisFt, baseAxisFt),
    second: point(0, baseDistanceFt * Math.sqrt(2)),
    third: point(-baseAxisFt, baseAxisFt),
  }),
  fielderPositionOrder: DEFENSE_POSITIONS,
  fielderStartPoints: Object.freeze({
    P: point(0, 55),
    C: point(0, -6),
    "1B": point(70, 70),
    "2B": point(35, 115),
    "3B": point(-70, 70),
    SS: point(-35, 115),
    LF: point(-105, 255),
    CF: point(0, 285),
    RF: point(105, 255),
  }),
  fielderAssumptions: Object.freeze({
    reactionTimeSec: 0.25,
    moveSpeedFtPerSec: 24,
  }),
});
