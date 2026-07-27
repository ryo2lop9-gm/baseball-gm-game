import {
  VELOCITY_BANDS,
  getVelocityBandByVelocity,
} from "../../config/velocityBandConfig.js";
import { PITCH_LOCATION_CONFIG } from "../../config/pitchLocationConfig.js";
import {
  createMeasurementHistogram,
  finalizeMeasurementHistogram,
  mergeMeasurementHistogram,
  recordMeasurementHistogram,
} from "./measurementHistogramService.js";

export const MEASUREMENT_COUNT_KEYS = Object.freeze([
  "0-0", "1-0", "2-0", "3-0",
  "0-1", "1-1", "2-1", "3-1",
  "0-2", "1-2", "2-2", "3-2",
]);
export const MEASUREMENT_PITCH_TYPES = Object.freeze([
  "fourSeam", "slider", "curve", "fork", "unknown",
]);
export const MEASUREMENT_COURSES = Object.freeze(["A", "B", "C", "Ball", "unknown"]);
export const MEASUREMENT_ATTACK_REGIONS = Object.freeze([
  "HEART", "SHADOW", "CHASE", "WASTE", "unknown",
]);
export const MEASUREMENT_ATTACK_REGION_DETAILS = Object.freeze([
  "HEART", "SHADOW_IN", "SHADOW_OUT", "CHASE", "WASTE", "unknown",
]);
export const MEASUREMENT_MEATBALL_KEYS = Object.freeze([
  "MEATBALL", "NON_MEATBALL", "unknown",
]);
export const MEASUREMENT_LOCATION_COURSES = Object.freeze([
  "A", "B", "C", "Ball", "unknown",
]);
export const MEASUREMENT_LOCATION_GRID_KEYS = Object.freeze([
  ...Array.from(
    { length: 25 },
    (_, index) => `r${Math.floor(index / 5)}c${index % 5}`
  ),
  "unknown",
]);
export const MEASUREMENT_OUTCOMES = Object.freeze([
  "out", "single", "double", "triple", "homeRun",
]);
export const MEASUREMENT_QOC_KEYS = Object.freeze([
  "Weak", "Topped", "Under", "Flare", "Solid", "Barrel", "unknown",
]);
export const MEASUREMENT_EV_BANDS = Object.freeze([
  "<70", "70-79.9", "80-89.9", "90-94.9", "95-99.9", "100-104.9", "105+",
]);
export const MEASUREMENT_LA_BANDS = Object.freeze([
  "<-10", "-10-0", "0-10", "10-25", "25-50", "50+",
]);

const SIDES = Object.freeze(["away", "home"]);
const PITCH_RESULTS = new Set([
  "called_ball",
  "called_strike",
  "called_ball_from_nominal_strike",
  "swinging_strike",
  "foul",
  "in_play",
]);
const PA_RESULTS = new Set([
  "walk", "strikeout", "out", "single", "double", "triple", "homeRun",
]);
const RESULT_STRIKES = new Set([
  "called_strike", "swinging_strike", "foul", "in_play",
]);
const COUNT_KEYS = new Set(MEASUREMENT_COUNT_KEYS);
const PITCH_TYPES = new Set(MEASUREMENT_PITCH_TYPES);
const COURSES = new Set(MEASUREMENT_COURSES);
const ATTACK_REGIONS = new Set(MEASUREMENT_ATTACK_REGIONS.slice(0, -1));
const ATTACK_REGION_DETAILS = new Set(
  MEASUREMENT_ATTACK_REGION_DETAILS.slice(0, -1)
);
const LOCATION_COURSES = new Set(MEASUREMENT_LOCATION_COURSES.slice(0, -1));
const ATTACK_REGION_DETAIL_BY_REGION = Object.freeze({
  HEART: Object.freeze(["HEART"]),
  SHADOW: Object.freeze(["SHADOW_IN", "SHADOW_OUT"]),
  CHASE: Object.freeze(["CHASE"]),
  WASTE: Object.freeze(["WASTE"]),
});

const PITCH_FIELDS = Object.freeze([
  "pitches", "zonePitches", "outOfZonePitches", "resultStrikes",
  "swings", "zoneSwings", "chaseSwings", "contacts", "zoneContacts",
  "chaseContacts", "whiffs", "calledStrikes", "calledBalls", "fouls",
  "fairBattedBalls", "firstPitches", "firstPitchStrikes", "PA", "AB",
  "H", "singles", "doubles", "triples", "HR", "BB", "K",
  "swingingK", "lookingK", "outsInPlay", "totalBases", "RBI",
]);
const PITCH = Object.freeze(
  Object.fromEntries(PITCH_FIELDS.map((key, index) => [key, index]))
);

function zeroOutcomes() {
  return Object.fromEntries(MEASUREMENT_OUTCOMES.map((key) => [key, 0]));
}

function createPitchLine() {
  return new Uint32Array(PITCH_FIELDS.length);
}

export function getRawPitchMeasurementValue(line, key) {
  const index = PITCH[key];
  return Number.isInteger(index) ? Number(line?.[index]) || 0 : 0;
}

function createCourseLine() {
  const line = createPitchLine();
  line.batted = createBattedLine();
  return line;
}

function createBattedLine() {
  return {
    BIP: 0,
    ...zeroOutcomes(),
    exitVelocitySum: 0,
    launchAngleSum: 0,
  };
}

function createBattedProfile() {
  return {
    ...createBattedLine(),
    GB: 0,
    LD: 0,
    FB: 0,
    PU: 0,
    hardHit: 0,
    sweetSpot: 0,
    exitVelocityHistogram: createMeasurementHistogram(0.1),
    launchAngleHistogram: createMeasurementHistogram(0.1),
  };
}

function createSmoothingHistograms() {
  return {
    targetWeight: createMeasurementHistogram(0.001),
    targetBattedBalls: createMeasurementHistogram(1),
    neighborEffectiveSampleSize: createMeasurementHistogram(1),
    neighborCount: createMeasurementHistogram(1),
    weightedNeighborBattedBalls: createMeasurementHistogram(1),
    effectivePriorStrength: createMeasurementHistogram(0.1),
    nearestDistanceSquared: createMeasurementHistogram(1),
  };
}

function createAdvancedDiagnostics() {
  return {
    invalidPitchMeasurementEventCount: 0,
    invalidPlateAppearanceResultCount: 0,
    unknownPitchResultCount: 0,
    unknownPitchTypeCount: 0,
    unknownCourseCount: 0,
    unknownBallTypeCount: 0,
    unknownStrikeTypeCount: 0,
    playerAggregationMismatchCount: 0,
    pitcherAggregationMismatchCount: 0,
    battingInvariantMismatchCount: 0,
    pitchInvariantMismatchCount: 0,
    battedBallInvariantMismatchCount: 0,
    invalidPitchLocationMeasurementEventCount: 0,
    pitchLocationFieldMismatchCount: 0,
    pitchLocationAggregationMismatchCount: 0,
  };
}

function initializedMap(keys, factory) {
  return Object.fromEntries(keys.map((key) => [key, factory()]));
}

function createSideMaps(keys, factory) {
  return {
    away: initializedMap(keys, factory),
    home: initializedMap(keys, factory),
  };
}

function createGameDistributionRaw() {
  return {
    games: 0,
    awayWins: 0,
    homeWins: 0,
    oneRunGames: 0,
    extraInningGames: 0,
    walkOffGames: 0,
    awayShutouts: 0,
    homeShutouts: 0,
    runDifferentialSum: 0,
    finalInningSum: 0,
    scoreHistograms: {
      away: createMeasurementHistogram(1),
      home: createMeasurementHistogram(1),
    },
  };
}

export function createAdvancedMeasurementAccumulator() {
  return {
    pitchBySide: { away: createPitchLine(), home: createPitchLine() },
    pitchLocation: { away: createPitchLine(), home: createPitchLine() },
    count: createSideMaps(MEASUREMENT_COUNT_KEYS, createPitchLine),
    pitchType: createSideMaps(MEASUREMENT_PITCH_TYPES, createPitchLine),
    velocityBand: createSideMaps(
      VELOCITY_BANDS.map((band) => band.id),
      createPitchLine
    ),
    course: createSideMaps(MEASUREMENT_COURSES, createCourseLine),
    attackRegion: createSideMaps(MEASUREMENT_ATTACK_REGIONS, createPitchLine),
    attackRegionDetail: createSideMaps(
      MEASUREMENT_ATTACK_REGION_DETAILS,
      createPitchLine
    ),
    meatball: createSideMaps(MEASUREMENT_MEATBALL_KEYS, createPitchLine),
    locationCourse: createSideMaps(
      MEASUREMENT_LOCATION_COURSES,
      createPitchLine
    ),
    locationGrid: createSideMaps(
      MEASUREMENT_LOCATION_GRID_KEYS,
      createPitchLine
    ),
    locationModel: createSideMaps(["unknown"], createPitchLine),
    strikeType: { away: Object.create(null), home: Object.create(null) },
    ballType: { away: Object.create(null), home: Object.create(null) },
    mistake: createSideMaps(["mistake", "nonMistake"], createPitchLine),
    drift: createSideMaps(["0", "1", "2", "3+", "unknown"], createPitchLine),
    players: { away: Object.create(null), home: Object.create(null) },
    pitchers: { away: Object.create(null), home: Object.create(null) },
    battedProfile: { away: createBattedProfile(), home: createBattedProfile() },
    battedBreakdowns: {
      evBand: createSideMaps(MEASUREMENT_EV_BANDS, createBattedLine),
      laBand: createSideMaps(MEASUREMENT_LA_BANDS, createBattedLine),
      qoc: createSideMaps(MEASUREMENT_QOC_KEYS, createBattedLine),
      source: { away: Object.create(null), home: Object.create(null) },
      sampleQuality: { away: Object.create(null), home: Object.create(null) },
      neighborMode: { away: Object.create(null), home: Object.create(null) },
      expansionLevel: { away: Object.create(null), home: Object.create(null) },
    },
    smoothing: {
      away: createSmoothingHistograms(),
      home: createSmoothingHistograms(),
    },
    gameDistribution: createGameDistributionRaw(),
    diagnostics: createAdvancedDiagnostics(),
  };
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function getOrCreate(map, key, factory) {
  if (!map[key]) map[key] = factory();
  return map[key];
}

function normalizePitchType(value, diagnostics) {
  if (PITCH_TYPES.has(value)) return value;
  diagnostics.unknownPitchTypeCount += 1;
  return "unknown";
}

function normalizeCourse(event, diagnostics) {
  const value = event.course;
  if (COURSES.has(value)) return value;
  diagnostics.unknownCourseCount += 1;
  return "unknown";
}

function isValidLocationGridCell(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function normalizePitchLocationEvent(event, diagnostics) {
  const actualPointValid =
    event.actualPoint !== null &&
    typeof event.actualPoint === "object" &&
    Number.isFinite(event.actualPoint.x) &&
    Number.isFinite(event.actualPoint.z);
  const normalizedValuesValid = [
    event.normalizedX,
    event.normalizedZ,
    event.normalizedRadius,
    event.normalizedZoneEdgeDistance,
  ].every(Number.isFinite);
  const actualIsZoneValid = typeof event.actualIsZone === "boolean";
  const attackRegionValid = ATTACK_REGIONS.has(event.attackRegion);
  const attackRegionDetailValid = ATTACK_REGION_DETAILS.has(
    event.attackRegionDetail
  );
  const shadowSideValid =
    event.shadowSide === null ||
    event.shadowSide === "IN" ||
    event.shadowSide === "OUT";
  const isMeatballValid = typeof event.isMeatball === "boolean";
  const gridValid =
    isValidLocationGridCell(event.zoneRow) &&
    isValidLocationGridCell(event.zoneCol);
  const locationCourseValid = LOCATION_COURSES.has(event.locationCourse);
  const locationModelValid =
    typeof event.locationModel === "string" &&
    event.locationModel.trim().length > 0;

  if (
    !actualPointValid ||
    !normalizedValuesValid ||
    !actualIsZoneValid ||
    !attackRegionValid ||
    !attackRegionDetailValid ||
    !shadowSideValid ||
    !isMeatballValid ||
    !gridValid ||
    !locationCourseValid ||
    !locationModelValid
  ) {
    diagnostics.invalidPitchLocationMeasurementEventCount += 1;
  }

  let fieldMismatch = false;
  if (actualIsZoneValid && event.isStrike !== event.actualIsZone) {
    fieldMismatch = true;
  }
  if (
    attackRegionValid &&
    attackRegionDetailValid &&
    !ATTACK_REGION_DETAIL_BY_REGION[event.attackRegion].includes(
      event.attackRegionDetail
    )
  ) {
    fieldMismatch = true;
  }
  if (actualIsZoneValid && attackRegionDetailValid) {
    if (
      event.attackRegionDetail === "HEART" ||
      event.attackRegionDetail === "SHADOW_IN"
    ) {
      fieldMismatch ||= !event.actualIsZone;
    } else {
      fieldMismatch ||= event.actualIsZone;
    }
  }
  if (attackRegionDetailValid && shadowSideValid) {
    const expectedShadowSide =
      event.attackRegionDetail === "SHADOW_IN"
        ? "IN"
        : event.attackRegionDetail === "SHADOW_OUT" ? "OUT" : null;
    if (event.shadowSide !== expectedShadowSide) {
      fieldMismatch = true;
    }
  }
  if (
    isMeatballValid &&
    event.isMeatball &&
    event.attackRegion !== "HEART"
  ) {
    fieldMismatch = true;
  }
  if (fieldMismatch) {
    diagnostics.pitchLocationFieldMismatchCount += 1;
  }

  return {
    actualIsZone:
      actualIsZoneValid ? event.actualIsZone : Boolean(event.isStrike),
    attackRegion: attackRegionValid ? event.attackRegion : "unknown",
    attackRegionDetail:
      attackRegionDetailValid ? event.attackRegionDetail : "unknown",
    meatball: isMeatballValid
      ? event.isMeatball ? "MEATBALL" : "NON_MEATBALL"
      : "unknown",
    locationCourse:
      locationCourseValid ? event.locationCourse : "unknown",
    locationGrid: gridValid
      ? `r${event.zoneRow}c${event.zoneCol}`
      : "unknown",
    locationModel: locationModelValid
      ? event.locationModel.trim()
      : "unknown",
  };
}

function normalizeDrift(value) {
  const drift = Number(value);
  if (!Number.isFinite(drift) || drift < 0) return "unknown";
  if (drift >= 3) return "3+";
  return String(Math.floor(drift));
}

function getCountKey(event) {
  const key = `${event.ballsBefore}-${event.strikesBefore}`;
  return COUNT_KEYS.has(key) ? key : null;
}

function getEvBand(value) {
  if (value < 70) return "<70";
  if (value < 80) return "70-79.9";
  if (value < 90) return "80-89.9";
  if (value < 95) return "90-94.9";
  if (value < 100) return "95-99.9";
  if (value < 105) return "100-104.9";
  return "105+";
}

function getLaBand(value) {
  if (value < -10) return "<-10";
  if (value < 0) return "-10-0";
  if (value < 10) return "0-10";
  if (value < 25) return "10-25";
  if (value < 50) return "25-50";
  return "50+";
}

function getBattedBallType(launchAngle) {
  if (launchAngle < 10) return "GB";
  if (launchAngle < 25) return "LD";
  if (launchAngle < 50) return "FB";
  return "PU";
}

function recordTerminalResult(line, event) {
  const result = event.paResult;
  if (!result) return;
  line[PITCH.PA] += 1;
  line[PITCH.RBI] += Math.max(0, Number(event.runsScored) || 0);

  if (result === "walk") {
    line[PITCH.BB] += 1;
    return;
  }

  line[PITCH.AB] += 1;
  if (result === "strikeout") {
    line[PITCH.K] += 1;
    if (event.strikeoutType === "swinging") line[PITCH.swingingK] += 1;
    else if (event.strikeoutType === "looking") line[PITCH.lookingK] += 1;
    return;
  }
  if (result === "out") {
    line[PITCH.outsInPlay] += 1;
    return;
  }

  line[PITCH.H] += 1;
  if (result === "single") {
    line[PITCH.singles] += 1;
    line[PITCH.totalBases] += 1;
  } else if (result === "double") {
    line[PITCH.doubles] += 1;
    line[PITCH.totalBases] += 2;
  } else if (result === "triple") {
    line[PITCH.triples] += 1;
    line[PITCH.totalBases] += 3;
  } else if (result === "homeRun") {
    line[PITCH.HR] += 1;
    line[PITCH.totalBases] += 4;
  }
}

function recordPitchLine(
  line,
  event,
  resultStrike,
  isZone = event.isStrike
) {
  line[PITCH.pitches] += 1;
  line[isZone ? PITCH.zonePitches : PITCH.outOfZonePitches] += 1;
  if (resultStrike) line[PITCH.resultStrikes] += 1;
  if (event.swung) {
    line[PITCH.swings] += 1;
    line[isZone ? PITCH.zoneSwings : PITCH.chaseSwings] += 1;
  }
  if (event.madeContact) {
    line[PITCH.contacts] += 1;
    line[isZone ? PITCH.zoneContacts : PITCH.chaseContacts] += 1;
  }
  if (event.pitchResult === "swinging_strike") line[PITCH.whiffs] += 1;
  if (event.pitchResult === "called_strike") line[PITCH.calledStrikes] += 1;
  if (
    event.pitchResult === "called_ball" ||
    event.pitchResult === "called_ball_from_nominal_strike"
  ) {
    line[PITCH.calledBalls] += 1;
  }
  if (event.pitchResult === "foul") line[PITCH.fouls] += 1;
  if (event.pitchResult === "in_play") line[PITCH.fairBattedBalls] += 1;
  if (event.ballsBefore === 0 && event.strikesBefore === 0) {
    line[PITCH.firstPitches] += 1;
    if (resultStrike) line[PITCH.firstPitchStrikes] += 1;
  }
  recordTerminalResult(line, event);
}

function recordPitchLocation(advanced, side, event, resultStrike) {
  const location = normalizePitchLocationEvent(event, advanced.diagnostics);
  const record = (line) =>
    recordPitchLine(line, event, resultStrike, location.actualIsZone);

  record(advanced.pitchLocation[side]);
  record(advanced.attackRegion[side][location.attackRegion]);
  record(advanced.attackRegionDetail[side][location.attackRegionDetail]);
  record(advanced.meatball[side][location.meatball]);
  record(advanced.locationCourse[side][location.locationCourse]);
  record(advanced.locationGrid[side][location.locationGrid]);
  record(
    getOrCreate(
      advanced.locationModel[side],
      location.locationModel,
      createPitchLine
    )
  );
}

function recordBattedLine(line, event) {
  const exitVelocity = Number(event.exitVelocity);
  const launchAngle = Number(event.launchAngle);
  line.BIP += 1;
  line[event.outcome] += 1;
  line.exitVelocitySum += exitVelocity;
  line.launchAngleSum += launchAngle;
}

function recordBattedProfile(profile, event) {
  recordBattedLine(profile, event);
  const exitVelocity = Number(event.exitVelocity);
  const launchAngle = Number(event.launchAngle);
  profile[getBattedBallType(launchAngle)] += 1;
  if (exitVelocity >= 95) profile.hardHit += 1;
  if (launchAngle >= 8 && launchAngle <= 32) profile.sweetSpot += 1;
  recordMeasurementHistogram(profile.exitVelocityHistogram, exitVelocity);
  recordMeasurementHistogram(profile.launchAngleHistogram, launchAngle);
}

function createPlayerEntry(event) {
  return {
    key: event.batterKey,
    side: event.battingSide,
    lineupIndex: event.lineupIndex,
    name: event.batterName || "-",
    ratings: { ...(event.batterRatings || {}) },
    G: 0,
    R: 0,
    RBI: 0,
    pitch: createPitchLine(),
    batted: createBattedProfile(),
    qoc: Object.fromEntries(MEASUREMENT_QOC_KEYS.map((key) => [key, 0])),
  };
}

function createPitcherEntry(event) {
  return {
    key: event.pitcherKey,
    teamSide: event.defenseSide,
    name: event.pitcherName || "-",
    role: event.pitcherRole || "unknown",
    ratings: { ...(event.pitcherRatings || {}) },
    pitchMix: structuredClone(event.pitchMix || {}),
    G: 0,
    pitch: createPitchLine(),
    pitchTypeCounts: Object.fromEntries(
      MEASUREMENT_PITCH_TYPES.map((key) => [key, 0])
    ),
  };
}

export function recordPitchMeasurement(advanced, event) {
  const side = event?.battingSide;
  const valid =
    SIDES.includes(side) &&
    SIDES.includes(event?.defenseSide) &&
    Number.isInteger(event?.ballsBefore) &&
    Number.isInteger(event?.strikesBefore) &&
    typeof event?.isStrike === "boolean" &&
    typeof event?.swung === "boolean" &&
    typeof event?.madeContact === "boolean";
  if (!valid) {
    advanced.diagnostics.invalidPitchMeasurementEventCount += 1;
    return false;
  }

  if (!PITCH_RESULTS.has(event.pitchResult)) {
    advanced.diagnostics.unknownPitchResultCount += 1;
  }
  if (event.paResult !== null && !PA_RESULTS.has(event.paResult)) {
    advanced.diagnostics.invalidPlateAppearanceResultCount += 1;
  }

  const safeEvent =
    PITCH_RESULTS.has(event.pitchResult) &&
    (event.paResult === null || PA_RESULTS.has(event.paResult))
      ? event
      : {
          ...event,
          pitchResult: PITCH_RESULTS.has(event.pitchResult)
            ? event.pitchResult
            : "unknown",
          paResult: PA_RESULTS.has(event.paResult) ? event.paResult : null,
        };
  const pitchType = normalizePitchType(event.pitchType, advanced.diagnostics);
  const course = normalizeCourse(event, advanced.diagnostics);
  const countKey = getCountKey(event);
  if (!countKey) advanced.diagnostics.invalidPitchMeasurementEventCount += 1;

  if (event.isStrike && !event.strikeType) {
    advanced.diagnostics.unknownStrikeTypeCount += 1;
  }
  if (!event.isStrike && !event.ballType) {
    advanced.diagnostics.unknownBallTypeCount += 1;
  }

  const resultStrike = RESULT_STRIKES.has(safeEvent.pitchResult);
  recordPitchLine(advanced.pitchBySide[side], safeEvent, resultStrike);
  recordPitchLocation(advanced, side, safeEvent, resultStrike);
  if (countKey) {
    recordPitchLine(advanced.count[side][countKey], safeEvent, resultStrike);
  }
  recordPitchLine(advanced.pitchType[side][pitchType], safeEvent, resultStrike);
  const velocityBand = getVelocityBandByVelocity(event.pitchVelocity);
  if (velocityBand) {
    recordPitchLine(
      advanced.velocityBand[side][velocityBand.id],
      safeEvent,
      resultStrike
    );
  }
  recordPitchLine(advanced.course[side][course], safeEvent, resultStrike);
  const strikeType = event.isStrike ? event.strikeType || "unknown" : "none";
  const ballType = !event.isStrike ? event.ballType || "unknown" : "none";
  recordPitchLine(
    getOrCreate(advanced.strikeType[side], strikeType, createPitchLine),
    safeEvent,
    resultStrike
  );
  recordPitchLine(
    getOrCreate(advanced.ballType[side], ballType, createPitchLine),
    safeEvent,
    resultStrike
  );
  recordPitchLine(
    advanced.mistake[side][event.isMistake ? "mistake" : "nonMistake"],
    safeEvent,
    resultStrike
  );
  recordPitchLine(
    advanced.drift[side][normalizeDrift(event.drift)],
    safeEvent,
    resultStrike
  );

  const lineupKey = Number.isInteger(event.lineupIndex)
    ? event.lineupIndex
    : "unknown";
  const batterKey = event.batterKey || `${side}:lineup:${lineupKey}`;
  const player = getOrCreate(
    advanced.players[side],
    batterKey,
    () => createPlayerEntry(
      event.batterKey ? safeEvent : { ...safeEvent, batterKey }
    )
  );
  recordPitchLine(player.pitch, safeEvent, resultStrike);

  const pitcherSide = event.defenseSide;
  const pitcherKey =
    event.pitcherKey ||
    `${pitcherSide}:pitcher:${event.pitcherName || "unknown"}`;
  const pitcher = getOrCreate(
    advanced.pitchers[pitcherSide],
    pitcherKey,
    () => createPitcherEntry(
      event.pitcherKey ? safeEvent : { ...safeEvent, pitcherKey }
    )
  );
  recordPitchLine(pitcher.pitch, safeEvent, resultStrike);
  pitcher.pitchTypeCounts[pitchType] += 1;
  return true;
}

function recordSmoothingHistograms(histograms, event) {
  const values = {
    targetWeight: event.targetWeight,
    targetBattedBalls: event.targetBattedBalls,
    neighborEffectiveSampleSize: event.neighborEffectiveSampleSize,
    neighborCount: event.neighborCount,
    weightedNeighborBattedBalls: event.weightedNeighborBattedBalls,
    effectivePriorStrength: event.effectivePriorStrength,
    nearestDistanceSquared: event.nearestDistanceSquared,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) {
      recordMeasurementHistogram(histograms[key], value);
    }
  }
}

export function recordAdvancedBattedBallMeasurement(advanced, event) {
  const side = event?.battingSide || event?.side;
  const exitVelocity = Number(event?.exitVelocity);
  const launchAngle = Number(event?.launchAngle);
  if (
    !SIDES.includes(side) ||
    !Number.isFinite(exitVelocity) ||
    !Number.isFinite(launchAngle) ||
    !MEASUREMENT_OUTCOMES.includes(event?.outcome)
  ) {
    return false;
  }

  recordBattedProfile(advanced.battedProfile[side], event);
  const course = normalizeCourse(event, advanced.diagnostics);
  recordBattedLine(advanced.course[side][course].batted, event);
  recordBattedLine(advanced.battedBreakdowns.evBand[side][getEvBand(exitVelocity)], event);
  recordBattedLine(advanced.battedBreakdowns.laBand[side][getLaBand(launchAngle)], event);

  const qoc = MEASUREMENT_QOC_KEYS.includes(event.qoc) ? event.qoc : "unknown";
  recordBattedLine(advanced.battedBreakdowns.qoc[side][qoc], event);
  for (const [group, rawKey] of [
    ["source", event.source],
    ["sampleQuality", event.sampleQuality],
    ["neighborMode", event.neighborMode],
    ["expansionLevel", event.expansionLevel],
  ]) {
    const key = rawKey === null || rawKey === undefined || rawKey === ""
      ? "unknown"
      : String(rawKey);
    recordBattedLine(
      getOrCreate(advanced.battedBreakdowns[group][side], key, createBattedLine),
      event
    );
  }

  const lineupKey = Number.isInteger(event.lineupIndex)
    ? event.lineupIndex
    : "unknown";
  const batterKey = event.batterKey || `${side}:lineup:${lineupKey}`;
  const player = getOrCreate(
    advanced.players[side],
    batterKey,
    () => createPlayerEntry({ ...event, battingSide: side, batterKey })
  );
  recordBattedProfile(player.batted, event);
  player.qoc[qoc] += 1;
  recordSmoothingHistograms(advanced.smoothing[side], event);
  return true;
}

function addNumericFields(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value === "number") target[key] = (target[key] || 0) + value;
  }
}

function mergePitchLine(target, source) {
  for (let index = 0; index < PITCH_FIELDS.length; index += 1) {
    target[index] += source[index];
  }
}

function mergeBattedLine(target, source) {
  addNumericFields(target, source);
}

function mergeBattedProfile(target, source) {
  addNumericFields(target, source);
  mergeMeasurementHistogram(target.exitVelocityHistogram, source.exitVelocityHistogram);
  mergeMeasurementHistogram(target.launchAngleHistogram, source.launchAngleHistogram);
}

function mergeMap(target, source, factory, merger) {
  for (const [key, value] of Object.entries(source || {})) {
    merger(getOrCreate(target, key, () => factory(value, key)), value);
  }
}

function mergeSideMaps(target, source, factory, merger) {
  for (const side of SIDES) mergeMap(target[side], source[side], factory, merger);
}

function mergePlayer(target, source) {
  target.G += 1;
  target.R += source.R || 0;
  target.RBI += source.RBI || 0;
  mergePitchLine(target.pitch, source.pitch);
  mergeBattedProfile(target.batted, source.batted);
  addNumericFields(target.qoc, source.qoc);
}

function mergePitcher(target, source) {
  target.G += 1;
  mergePitchLine(target.pitch, source.pitch);
  addNumericFields(target.pitchTypeCounts, source.pitchTypeCounts);
}

function hydratePlayerRuns(advanced, gameState) {
  for (const side of SIDES) {
    const team = side === "away" ? gameState.awayTeam : gameState.homeTeam;
    for (const player of Object.values(advanced.players[side])) {
      const lineupPlayer = team?.lineup?.[player.lineupIndex];
      player.R = Number(lineupPlayer?.gameStats?.R) || 0;
      player.RBI = Number(lineupPlayer?.gameStats?.RBI) || 0;
    }
  }
}

function recordGameDistribution(distribution, gameState) {
  const awayRuns = Number(gameState.score?.away) || 0;
  const homeRuns = Number(gameState.score?.home) || 0;
  const finalInning = Number(gameState.finalInning || gameState.inning) || 0;
  distribution.games += 1;
  distribution.awayWins += awayRuns > homeRuns ? 1 : 0;
  distribution.homeWins += homeRuns > awayRuns ? 1 : 0;
  distribution.oneRunGames += Math.abs(awayRuns - homeRuns) === 1 ? 1 : 0;
  distribution.extraInningGames += finalInning > 9 ? 1 : 0;
  distribution.walkOffGames +=
    gameState.finalHalf === "bottom" && gameState.outs < 3 && homeRuns > awayRuns
      ? 1
      : 0;
  distribution.awayShutouts += awayRuns === 0 ? 1 : 0;
  distribution.homeShutouts += homeRuns === 0 ? 1 : 0;
  distribution.runDifferentialSum += Math.abs(awayRuns - homeRuns);
  distribution.finalInningSum += finalInning;
  recordMeasurementHistogram(distribution.scoreHistograms.away, awayRuns);
  recordMeasurementHistogram(distribution.scoreHistograms.home, homeRuns);
}

export function commitAdvancedMeasurementGame(target, source, gameState) {
  hydratePlayerRuns(source, gameState);
  for (const side of SIDES) {
    mergePitchLine(target.pitchBySide[side], source.pitchBySide[side]);
    mergePitchLine(target.pitchLocation[side], source.pitchLocation[side]);
  }
  for (const group of [
    "count",
    "pitchType",
    "velocityBand",
    "mistake",
    "drift",
    "attackRegion",
    "attackRegionDetail",
    "meatball",
    "locationCourse",
    "locationGrid",
    "locationModel",
  ]) {
    mergeSideMaps(target[group], source[group], createPitchLine, mergePitchLine);
  }
  for (const side of SIDES) {
    mergeMap(
      target.course[side],
      source.course[side],
      createCourseLine,
      (next, value) => {
        mergePitchLine(next, value);
        mergeBattedLine(next.batted, value.batted);
      }
    );
  }
  for (const group of ["strikeType", "ballType"]) {
    mergeSideMaps(target[group], source[group], createPitchLine, mergePitchLine);
  }
  for (const side of SIDES) {
    mergeMap(
      target.players[side],
      source.players[side],
      (value) => ({
        key: value.key,
        side: value.side,
        lineupIndex: value.lineupIndex,
        name: value.name,
        ratings: { ...value.ratings },
        G: 0,
        R: 0,
        RBI: 0,
        pitch: createPitchLine(),
        batted: createBattedProfile(),
        qoc: Object.fromEntries(MEASUREMENT_QOC_KEYS.map((key) => [key, 0])),
      }),
      mergePlayer
    );
    mergeMap(
      target.pitchers[side],
      source.pitchers[side],
      (value) => ({
        key: value.key,
        teamSide: value.teamSide,
        name: value.name,
        role: value.role,
        ratings: { ...value.ratings },
        pitchMix: structuredClone(value.pitchMix || {}),
        G: 0,
        pitch: createPitchLine(),
        pitchTypeCounts: Object.fromEntries(
          MEASUREMENT_PITCH_TYPES.map((key) => [key, 0])
        ),
      }),
      mergePitcher
    );
    mergeBattedProfile(target.battedProfile[side], source.battedProfile[side]);
  }
  for (const group of Object.keys(target.battedBreakdowns)) {
    mergeSideMaps(
      target.battedBreakdowns[group],
      source.battedBreakdowns[group],
      createBattedLine,
      mergeBattedLine
    );
  }
  for (const side of SIDES) {
    for (const key of Object.keys(target.smoothing[side])) {
      mergeMeasurementHistogram(target.smoothing[side][key], source.smoothing[side][key]);
    }
  }
  addNumericFields(target.diagnostics, source.diagnostics);
  recordGameDistribution(target.gameDistribution, gameState);
}

function finalizePitchLine(raw) {
  const values = Object.fromEntries(
    PITCH_FIELDS.map((key, index) => [key, raw[index] || 0])
  );
  const singles = values.singles || Math.max(
    0,
    values.H - values.doubles - values.triples - values.HR
  );
  const totalBases = values.totalBases ||
    singles + values.doubles * 2 + values.triples * 3 + values.HR * 4;
  return {
    ...values,
    singles,
    totalBases,
    pitchesPerPA: safeDivide(values.pitches, values.PA),
    zonePct: safeDivide(values.zonePitches, values.pitches),
    resultStrikePct: safeDivide(values.resultStrikes, values.pitches),
    swingPct: safeDivide(values.swings, values.pitches),
    zSwingPct: safeDivide(values.zoneSwings, values.zonePitches),
    chasePct: safeDivide(values.chaseSwings, values.outOfZonePitches),
    contactPct: safeDivide(values.contacts, values.swings),
    zoneContactPct: safeDivide(values.zoneContacts, values.zoneSwings),
    chaseContactPct: safeDivide(values.chaseContacts, values.chaseSwings),
    whiffPct: safeDivide(values.whiffs, values.swings),
    calledStrikePct: safeDivide(values.calledStrikes, values.pitches),
    calledBallPct: safeDivide(values.calledBalls, values.pitches),
    foulPct: safeDivide(values.fouls, values.pitches),
    bipPerPitch: safeDivide(values.fairBattedBalls, values.pitches),
    cswPct: safeDivide(values.calledStrikes + values.whiffs, values.pitches),
    firstPitchStrikePct: safeDivide(values.firstPitchStrikes, values.firstPitches),
    AVG: safeDivide(values.H, values.AB),
    OBP: safeDivide(values.H + values.BB, values.PA),
    SLG: safeDivide(totalBases, values.AB),
    OPS: safeDivide(values.H + values.BB, values.PA) + safeDivide(totalBases, values.AB),
  };
}

function finalizeBattedLine(raw) {
  const hits = raw.single + raw.double + raw.triple + raw.homeRun;
  const totalBases = raw.single + raw.double * 2 + raw.triple * 3 + raw.homeRun * 4;
  return {
    ...raw,
    H: hits,
    totalBases,
    hitPerBIP: safeDivide(hits, raw.BIP),
    totalBasesPerBIP: safeDivide(totalBases, raw.BIP),
    homeRunPerBIP: safeDivide(raw.homeRun, raw.BIP),
    averageExitVelocity: safeDivide(raw.exitVelocitySum, raw.BIP),
    averageLaunchAngle: safeDivide(raw.launchAngleSum, raw.BIP),
    rates: Object.fromEntries(
      MEASUREMENT_OUTCOMES.map((key) => [key, safeDivide(raw[key], raw.BIP)])
    ),
  };
}

function finalizeBattedProfile(raw) {
  const {
    exitVelocityHistogram: _exitVelocityHistogram,
    launchAngleHistogram: _launchAngleHistogram,
    ...base
  } = finalizeBattedLine(raw);
  const ev = finalizeMeasurementHistogram(raw.exitVelocityHistogram);
  const la = finalizeMeasurementHistogram(raw.launchAngleHistogram);
  return {
    ...base,
    GBPct: safeDivide(raw.GB, raw.BIP),
    LDPct: safeDivide(raw.LD, raw.BIP),
    FBPct: safeDivide(raw.FB, raw.BIP),
    PUPct: safeDivide(raw.PU, raw.BIP),
    AIRPct: safeDivide(raw.LD + raw.FB + raw.PU, raw.BIP),
    homeRunPerFlyBall: safeDivide(raw.homeRun, raw.FB),
    hardHitPct: safeDivide(raw.hardHit, raw.BIP),
    sweetSpotPct: safeDivide(raw.sweetSpot, raw.BIP),
    exitVelocity: ev,
    launchAngle: la,
  };
}

function combineRaw(first, second, factory, merger) {
  const combined = factory();
  merger(combined, first);
  merger(combined, second);
  return combined;
}

function finalizeBySide(rawBySide, factory, merger, finalizer) {
  return {
    away: finalizer(rawBySide.away),
    home: finalizer(rawBySide.home),
    combined: finalizer(combineRaw(rawBySide.away, rawBySide.home, factory, merger)),
  };
}

function finalizeGroupedBySide(rawBySide, keys, factory, merger, finalizer) {
  const allKeys = keys || Array.from(new Set([
    ...Object.keys(rawBySide.away || {}),
    ...Object.keys(rawBySide.home || {}),
  ]));
  const result = { away: {}, home: {}, combined: {} };
  for (const key of allKeys) {
    const away = rawBySide.away[key] || factory();
    const home = rawBySide.home[key] || factory();
    result.away[key] = finalizer(away);
    result.home[key] = finalizer(home);
    result.combined[key] = finalizer(combineRaw(away, home, factory, merger));
  }
  return result;
}

function finalizePitchLocationGroup(
  rawBySide,
  keys,
  plateDiscipline,
  decorate = null
) {
  const result = finalizeGroupedBySide(
    rawBySide,
    keys,
    createPitchLine,
    mergePitchLine,
    finalizePitchLine
  );

  for (const side of [...SIDES, "combined"]) {
    const pitchTotal = plateDiscipline[side].pitches;
    for (const [key, value] of Object.entries(result[side])) {
      value.pitchPct = safeDivide(value.pitches, pitchTotal);
      if (decorate) decorate(value, key);
    }
  }
  return result;
}

function decorateLocationGrid(value, key) {
  const match = /^r([0-4])c([0-4])$/.exec(key);
  value.zoneRow = match ? Number(match[1]) : null;
  value.zoneCol = match ? Number(match[2]) : null;
}

function buildPitchLocationSummary(
  advanced,
  plateDiscipline,
  breakdowns
) {
  const locationLines = finalizeBySide(
    advanced.pitchLocation,
    createPitchLine,
    mergePitchLine,
    finalizePitchLine
  );
  const result = {};

  for (const side of [...SIDES, "combined"]) {
    const line = locationLines[side];
    const attackRegion = breakdowns.attackRegion[side];
    const detail = breakdowns.attackRegionDetail[side];
    const meatball = breakdowns.meatball[side];
    const shadowPct = attackRegion.SHADOW.pitchPct;

    result[side] = {
      pitches: line.pitches,
      geometricZonePitches: line.zonePitches,
      geometricZonePct: line.zonePct,
      resultStrikes: line.resultStrikes,
      resultStrikePct: line.resultStrikePct,
      calledStrikes: line.calledStrikes,
      calledStrikePct: line.calledStrikePct,
      outOfZonePitches: line.outOfZonePitches,
      outOfZoneSwings: line.chaseSwings,
      chasePct: plateDiscipline[side].chasePct,
      heartPct: attackRegion.HEART.pitchPct,
      shadowPct,
      edgePct: shadowPct,
      shadowInPct: detail.SHADOW_IN.pitchPct,
      shadowOutPct: detail.SHADOW_OUT.pitchPct,
      chaseRegionPct: attackRegion.CHASE.pitchPct,
      wastePct: attackRegion.WASTE.pitchPct,
      meatballPct: meatball.MEATBALL.pitchPct,
    };
  }

  const modelCounts = breakdowns.locationModel.combined;
  const activeModels = Object.entries(modelCounts)
    .filter(([key, value]) => key !== "unknown" && value.pitches > 0)
    .map(([key]) => key);
  const totalPitches = result.combined.pitches;
  const legacyModel =
    PITCH_LOCATION_CONFIG.legacyGridCompatibility.locationModel;
  const legacyPitches = modelCounts[legacyModel]?.pitches || 0;
  const unknownPitches = modelCounts.unknown?.pitches || 0;

  result.compatibility = {
    activeLocationModel:
      activeModels.length === 1
        ? activeModels[0]
        : activeModels.length > 1 ? "mixed" : "unknown",
    legacyGridCompatNoChaseByDesign:
      totalPitches > 0 && legacyPitches === totalPitches,
    continuousLocationDistributionAvailable:
      totalPitches - legacyPitches - unknownPitches > 0,
  };
  return result;
}

function finalizeCourse(rawBySide) {
  const result = { away: {}, home: {}, combined: {} };
  for (const key of MEASUREMENT_COURSES) {
    const away = rawBySide.away[key];
    const home = rawBySide.home[key];
    const combined = createCourseLine();
    mergePitchLine(combined, away);
    mergePitchLine(combined, home);
    mergeBattedLine(combined.batted, away.batted);
    mergeBattedLine(combined.batted, home.batted);
    for (const [side, raw] of [["away", away], ["home", home], ["combined", combined]]) {
      result[side][key] = { ...finalizePitchLine(raw), batted: finalizeBattedLine(raw.batted) };
    }
  }
  return result;
}

function finalizeSmoothing(raw) {
  const result = { away: {}, home: {}, combined: {} };
  for (const key of Object.keys(raw.away)) {
    result.away[key] = finalizeMeasurementHistogram(raw.away[key]);
    result.home[key] = finalizeMeasurementHistogram(raw.home[key]);
    const combined = createMeasurementHistogram(raw.away[key].binWidth);
    mergeMeasurementHistogram(combined, raw.away[key]);
    mergeMeasurementHistogram(combined, raw.home[key]);
    result.combined[key] = finalizeMeasurementHistogram(combined);
  }
  return result;
}

function finalizePlayers(players) {
  return Object.fromEntries(SIDES.map((side) => [
    side,
    Object.values(players[side])
      .sort((a, b) => a.lineupIndex - b.lineupIndex)
      .map((player) => {
        const pitch = finalizePitchLine(player.pitch);
        const batted = finalizeBattedProfile(player.batted);
        const qocTotal = Object.values(player.qoc).reduce((sum, value) => sum + value, 0);
        return {
          key: player.key,
          side,
          lineupOrder: player.lineupIndex + 1,
          name: player.name,
          ratings: player.ratings,
          G: player.G,
          PA: pitch.PA,
          AB: pitch.AB,
          H: pitch.H,
          singles: pitch.singles,
          doubles: pitch.doubles,
          triples: pitch.triples,
          HR: pitch.HR,
          BB: pitch.BB,
          K: pitch.K,
          swingingK: pitch.swingingK,
          lookingK: pitch.lookingK,
          R: player.R,
          RBI: player.RBI,
          totalBases: pitch.totalBases,
          AVG: pitch.AVG,
          OBP: pitch.OBP,
          SLG: pitch.SLG,
          OPS: pitch.OPS,
          ISO: pitch.SLG - pitch.AVG,
          BABIP: safeDivide(pitch.H - pitch.HR, pitch.AB - pitch.K - pitch.HR),
          BBPct: safeDivide(pitch.BB, pitch.PA),
          KPct: safeDivide(pitch.K, pitch.PA),
          swingPct: pitch.swingPct,
          zSwingPct: pitch.zSwingPct,
          chasePct: pitch.chasePct,
          contactPct: pitch.contactPct,
          zoneContactPct: pitch.zoneContactPct,
          chaseContactPct: pitch.chaseContactPct,
          pitchesPerPA: pitch.pitchesPerPA,
          calledStrikePct: pitch.calledStrikePct,
          cswPct: pitch.cswPct,
          whiffPct: pitch.whiffPct,
          BIP: batted.BIP,
          averageExitVelocity: batted.averageExitVelocity,
          maxExitVelocity: batted.exitVelocity.max,
          hardHitPct: batted.hardHitPct,
          GBPct: batted.GBPct,
          LDPct: batted.LDPct,
          FBPct: batted.FBPct,
          PUPct: batted.PUPct,
          qoc: Object.fromEntries(
            Object.entries(player.qoc).map(([key, count]) => [
              key,
              { count, pct: safeDivide(count, qocTotal) },
            ])
          ),
        };
      }),
  ]));
}

function formatInnings(outs) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function finalizePitchers(pitchers) {
  return Object.fromEntries(SIDES.map((side) => [
    side,
    Object.values(pitchers[side]).map((pitcher) => {
      const pitch = finalizePitchLine(pitcher.pitch);
      const pitchTypeUsage = Object.fromEntries(
        Object.entries(pitcher.pitchTypeCounts).map(([key, count]) => [
          key,
          { count, pct: safeDivide(count, pitch.pitches) },
        ])
      );
      const outsRecorded = pitch.K + pitch.outsInPlay;
      return {
        key: pitcher.key,
        teamSide: side,
        name: pitcher.name,
        role: pitcher.role,
        G: pitcher.G,
        pitches: pitch.pitches,
        BF: pitch.PA,
        outsRecorded,
        inningsPitched: formatInnings(outsRecorded),
        H: pitch.H,
        HR: pitch.HR,
        BB: pitch.BB,
        K: pitch.K,
        swingingK: pitch.swingingK,
        lookingK: pitch.lookingK,
        WHIP: safeDivide(pitch.H + pitch.BB, outsRecorded / 3),
        KPct: safeDivide(pitch.K, pitch.PA),
        BBPct: safeDivide(pitch.BB, pitch.PA),
        zonePct: pitch.zonePct,
        swingPct: pitch.swingPct,
        chasePct: pitch.chasePct,
        contactPct: pitch.contactPct,
        whiffPct: pitch.whiffPct,
        pitchTypeUsage,
      };
    }),
  ]));
}

function finalizeGameDistribution(raw) {
  const combinedScores = createMeasurementHistogram(1);
  mergeMeasurementHistogram(combinedScores, raw.scoreHistograms.away);
  mergeMeasurementHistogram(combinedScores, raw.scoreHistograms.home);
  const away = finalizeMeasurementHistogram(raw.scoreHistograms.away);
  const home = finalizeMeasurementHistogram(raw.scoreHistograms.home);
  const combined = finalizeMeasurementHistogram(combinedScores);
  return {
    games: raw.games,
    score: {
      away: { ...away, histogram: { ...raw.scoreHistograms.away.bins } },
      home: { ...home, histogram: { ...raw.scoreHistograms.home.bins } },
      combined: {
        ...combined,
        histogram: Object.fromEntries(
          Object.entries(combinedScores.bins).map(([key, value]) => [key, value])
        ),
      },
    },
    averageRunDifferential: safeDivide(raw.runDifferentialSum, raw.games),
    oneRunGamePct: safeDivide(raw.oneRunGames, raw.games),
    shutoutPct: safeDivide(raw.awayShutouts + raw.homeShutouts, raw.games * 2),
    extraInningPct: safeDivide(raw.extraInningGames, raw.games),
    averageFinalInning: safeDivide(raw.finalInningSum, raw.games),
    awayWinPct: safeDivide(raw.awayWins, raw.games),
    homeWinPct: safeDivide(raw.homeWins, raw.games),
    walkOffPct: safeDivide(raw.walkOffGames, raw.games),
    counts: {
      awayWins: raw.awayWins,
      homeWins: raw.homeWins,
      oneRunGames: raw.oneRunGames,
      shutoutTeamGames: raw.awayShutouts + raw.homeShutouts,
      extraInningGames: raw.extraInningGames,
      walkOffGames: raw.walkOffGames,
    },
  };
}

function countInvariant(condition) {
  return condition ? 0 : 1;
}

function getRawPitchLineForSide(rawBySide, side) {
  if (side !== "combined") return rawBySide[side];
  return combineRaw(
    rawBySide.away,
    rawBySide.home,
    createPitchLine,
    mergePitchLine
  );
}

function getRawBreakdownPitchCount(rawBySide, side, key) {
  if (side === "combined") {
    return (
      (rawBySide.away[key]?.[PITCH.pitches] || 0) +
      (rawBySide.home[key]?.[PITCH.pitches] || 0)
    );
  }
  return rawBySide[side][key]?.[PITCH.pitches] || 0;
}

function getRawBreakdownPitchTotal(rawBySide, side) {
  if (side === "combined") {
    return SIDES.reduce(
      (sum, currentSide) =>
        sum +
        Object.values(rawBySide[currentSide]).reduce(
          (sideSum, line) => sideSum + line[PITCH.pitches],
          0
        ),
      0
    );
  }
  return Object.values(rawBySide[side]).reduce(
    (sum, line) => sum + line[PITCH.pitches],
    0
  );
}

function calculateInvariantDiagnostics(
  advanced,
  results,
  qoc,
  battedBallMetrics,
  pitchLocation
) {
  const diagnostics = { ...advanced.diagnostics };
  for (const side of [...SIDES, "combined"]) {
    const batting = results[side];
    const pitch = side === "combined"
      ? finalizePitchLine(combineRaw(
          advanced.pitchBySide.away,
          advanced.pitchBySide.home,
          createPitchLine,
          mergePitchLine
        ))
      : finalizePitchLine(advanced.pitchBySide[side]);
    diagnostics.battingInvariantMismatchCount +=
      countInvariant(batting.PA === batting.AB + batting.BB) +
      countInvariant(batting.H === batting.singles + batting.doubles + batting.triples + batting.HR) +
      countInvariant(batting.K === batting.swingingK + batting.lookingK) +
      countInvariant(batting.AB === batting.H + batting.K + batting.outsInPlay);
    diagnostics.pitchInvariantMismatchCount +=
      countInvariant(pitch.swings === pitch.whiffs + pitch.contacts) +
      countInvariant(pitch.contacts === pitch.fouls + pitch.fairBattedBalls) +
      countInvariant(pitch.zonePitches + pitch.outOfZonePitches === pitch.pitches) +
      countInvariant(pitch.zoneSwings + pitch.chaseSwings === pitch.swings);
  }

  const combinedProfile = combineRaw(
    advanced.battedProfile.away,
    advanced.battedProfile.home,
    createBattedProfile,
    mergeBattedProfile
  );
  const outcomeTotal = MEASUREMENT_OUTCOMES.reduce(
    (sum, key) => sum + combinedProfile[key],
    0
  );
  diagnostics.battedBallInvariantMismatchCount +=
    countInvariant(outcomeTotal === combinedProfile.BIP) +
    countInvariant(
      combinedProfile.GB + combinedProfile.LD + combinedProfile.FB + combinedProfile.PU ===
        combinedProfile.BIP
    ) +
    countInvariant(
      Object.values(qoc.combined || {}).reduce((sum, value) => sum + value.count, 0) ===
        battedBallMetrics.fairBattedBalls
    );
  const coursePitchTotal = SIDES.reduce(
    (sum, side) =>
      sum + MEASUREMENT_COURSES.reduce(
        (courseSum, course) => courseSum + advanced.course[side][course][PITCH.pitches],
        0
      ),
    0
  );
  const courseBattedBallTotal = SIDES.reduce(
    (sum, side) =>
      sum + MEASUREMENT_COURSES.reduce(
        (courseSum, course) => courseSum + advanced.course[side][course].batted.BIP,
        0
      ),
    0
  );
  diagnostics.pitchInvariantMismatchCount += countInvariant(
    coursePitchTotal ===
      advanced.pitchBySide.away[PITCH.pitches] +
        advanced.pitchBySide.home[PITCH.pitches]
  );
  diagnostics.battedBallInvariantMismatchCount += countInvariant(
    courseBattedBallTotal === battedBallMetrics.fairBattedBalls
  );
  for (const group of ["source", "sampleQuality", "neighborMode", "expansionLevel"]) {
    const total = SIDES.reduce(
      (sum, side) =>
        sum + Object.values(advanced.battedBreakdowns[group][side]).reduce(
          (sideSum, line) => sideSum + line.BIP,
          0
        ),
      0
    );
    diagnostics.battedBallInvariantMismatchCount += countInvariant(
      total === battedBallMetrics.fairBattedBalls
    );
  }

  const playerTotals = { PA: 0, AB: 0, H: 0, BB: 0, K: 0 };
  for (const side of SIDES) {
    for (const player of Object.values(advanced.players[side])) {
      for (const key of Object.keys(playerTotals)) {
        playerTotals[key] += player.pitch[PITCH[key]];
      }
    }
  }
  for (const key of Object.keys(playerTotals)) {
    diagnostics.playerAggregationMismatchCount += countInvariant(
      playerTotals[key] === results.combined[key]
    );
  }

  const pitcherBF = SIDES.reduce(
    (sum, side) =>
      sum + Object.values(advanced.pitchers[side]).reduce(
        (pitcherSum, pitcher) => pitcherSum + pitcher.pitch[PITCH.PA],
        0
      ),
    0
  );
  diagnostics.pitcherAggregationMismatchCount += countInvariant(
    pitcherBF === results.combined.PA
  );

  for (const side of [...SIDES, "combined"]) {
    const locationLine = getRawPitchLineForSide(
      advanced.pitchLocation,
      side
    );
    const pitches = locationLine[PITCH.pitches];
    for (const group of [
      "attackRegion",
      "attackRegionDetail",
      "meatball",
      "locationCourse",
      "locationGrid",
      "locationModel",
    ]) {
      diagnostics.pitchLocationAggregationMismatchCount += countInvariant(
        getRawBreakdownPitchTotal(advanced[group], side) === pitches
      );
    }

    const heart = getRawBreakdownPitchCount(
      advanced.attackRegion,
      side,
      "HEART"
    );
    const shadowIn = getRawBreakdownPitchCount(
      advanced.attackRegionDetail,
      side,
      "SHADOW_IN"
    );
    const shadowOut = getRawBreakdownPitchCount(
      advanced.attackRegionDetail,
      side,
      "SHADOW_OUT"
    );
    const chase = getRawBreakdownPitchCount(
      advanced.attackRegion,
      side,
      "CHASE"
    );
    const waste = getRawBreakdownPitchCount(
      advanced.attackRegion,
      side,
      "WASTE"
    );
    const meatball = getRawBreakdownPitchCount(
      advanced.meatball,
      side,
      "MEATBALL"
    );
    const legacyPitches = getRawBreakdownPitchCount(
      advanced.locationModel,
      side,
      PITCH_LOCATION_CONFIG.legacyGridCompatibility.locationModel
    );

    diagnostics.pitchLocationAggregationMismatchCount +=
      countInvariant(
        heart + shadowIn === locationLine[PITCH.zonePitches]
      ) +
      countInvariant(
        shadowOut + chase + waste ===
          locationLine[PITCH.outOfZonePitches]
      ) +
      countInvariant(meatball <= heart) +
      countInvariant(
        pitchLocation[side].edgePct === pitchLocation[side].shadowPct
      );
    if (pitches > 0 && legacyPitches === pitches) {
      diagnostics.pitchLocationAggregationMismatchCount += countInvariant(
        chase === 0
      );
    }
  }
  return diagnostics;
}

export function finalizeAdvancedMeasurement(
  advanced,
  { results, qoc, battedBallMetrics }
) {
  const plateDiscipline = finalizeBySide(
    advanced.pitchBySide,
    createPitchLine,
    mergePitchLine,
    finalizePitchLine
  );
  const battingProfiles = finalizeBySide(
    advanced.battedProfile,
    createBattedProfile,
    mergeBattedProfile,
    finalizeBattedProfile
  );
  const breakdowns = {
    count: finalizeGroupedBySide(
      advanced.count,
      MEASUREMENT_COUNT_KEYS,
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    pitchType: finalizeGroupedBySide(
      advanced.pitchType,
      MEASUREMENT_PITCH_TYPES,
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    velocityBand: finalizeGroupedBySide(
      advanced.velocityBand,
      VELOCITY_BANDS.map((band) => band.id),
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    course: finalizeCourse(advanced.course),
    attackRegion: finalizePitchLocationGroup(
      advanced.attackRegion,
      MEASUREMENT_ATTACK_REGIONS,
      plateDiscipline
    ),
    attackRegionDetail: finalizePitchLocationGroup(
      advanced.attackRegionDetail,
      MEASUREMENT_ATTACK_REGION_DETAILS,
      plateDiscipline
    ),
    meatball: finalizePitchLocationGroup(
      advanced.meatball,
      MEASUREMENT_MEATBALL_KEYS,
      plateDiscipline
    ),
    locationCourse: finalizePitchLocationGroup(
      advanced.locationCourse,
      MEASUREMENT_LOCATION_COURSES,
      plateDiscipline
    ),
    locationGrid: finalizePitchLocationGroup(
      advanced.locationGrid,
      MEASUREMENT_LOCATION_GRID_KEYS,
      plateDiscipline,
      decorateLocationGrid
    ),
    locationModel: finalizePitchLocationGroup(
      advanced.locationModel,
      null,
      plateDiscipline
    ),
    strikeType: finalizeGroupedBySide(
      advanced.strikeType,
      null,
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    ballType: finalizeGroupedBySide(
      advanced.ballType,
      null,
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    mistake: finalizeGroupedBySide(
      advanced.mistake,
      ["mistake", "nonMistake"],
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
    drift: finalizeGroupedBySide(
      advanced.drift,
      ["0", "1", "2", "3+", "unknown"],
      createPitchLine,
      mergePitchLine,
      finalizePitchLine
    ),
  };

  for (const group of Object.keys(advanced.battedBreakdowns)) {
    breakdowns[group] = finalizeGroupedBySide(
      advanced.battedBreakdowns[group],
      null,
      createBattedLine,
      mergeBattedLine,
      finalizeBattedLine
    );
  }

  for (const side of [...SIDES, "combined"]) {
    const pitchTotal = plateDiscipline[side].pitches;
    for (const value of Object.values(breakdowns.pitchType[side])) {
      value.usagePct = safeDivide(value.pitches, pitchTotal);
    }
  }

  const pitchLocation = buildPitchLocationSummary(
    advanced,
    plateDiscipline,
    breakdowns
  );

  return {
    plateDiscipline,
    pitchLocation,
    battingProfiles,
    breakdowns,
    smoothingDiagnostics: finalizeSmoothing(advanced.smoothing),
    players: finalizePlayers(advanced.players),
    pitchers: finalizePitchers(advanced.pitchers),
    gameDistribution: finalizeGameDistribution(advanced.gameDistribution),
    diagnostics: calculateInvariantDiagnostics(
      advanced,
      results,
      qoc,
      battedBallMetrics,
      pitchLocation
    ),
  };
}
