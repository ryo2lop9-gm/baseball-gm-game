import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTuningBootstrap } from "../bootstrap/tuningBootstrap.js";
import { BATTED_BALL_DIRECTION_CONFIG } from "../config/battedBallDirectionConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../config/defenseProbabilityConfig.js";
import { DEFENSE_POSITIONS } from "../config/defenseConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../config/fieldGeometryConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../config/resolutionAuthorityConfig.js";
import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import {
  createGameBatter,
  createGamePitcher,
  createSeasonBatterSnapshot,
} from "../models/playerModels.js";
import {
  createDefaultLeagueTeams,
  createDefaultTeams,
  createGmBasicReferenceValidationTeams,
  createMlbAverageValidationTeams,
} from "../models/teamModels.js";
import { generateGeometryShadow } from "../services/defense/battedBallGeometryService.js";
import {
  buildDefenseOpportunity,
  evaluateAverageDefenseCandidate,
} from "../services/defense/defenseOpportunityService.js";
import { generateDefenseShadow } from "../services/defense/defenseShadowService.js";
import {
  resolveActiveDefense,
} from "../services/defensiveAlignmentService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  createEmptyMeasurementAccumulator,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  createDefenseMeasurementAccumulator,
} from "../services/measurement/measurementDefenseService.js";
import {
  createSeededRandom,
  deriveNamespacedSeed,
} from "../services/seededRandomService.js";
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const teams = createMlbAverageValidationTeams();
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function directionShadow(sprayAngle = 12) {
  return {
    mode: BATTED_BALL_DIRECTION_CONFIG.shadowMode,
    model: BATTED_BALL_DIRECTION_CONFIG.model,
    sprayAngle,
    fieldSector:
      sprayAngle < -15 ? "left" : sprayAngle > 15 ? "right" : "center",
  };
}

function geometryFixture({
  eventId = "codex17:event:1",
  exitVelocity = 95,
  launchAngle = 30,
  sprayAngle = 12,
} = {}) {
  const direction = directionShadow(sprayAngle);
  return {
    direction,
    geometry: generateGeometryShadow({
      mode: "shadow",
      battedBallEventId: eventId,
      exitVelocity,
      launchAngle,
      directionShadow: direction,
    }),
  };
}

function activeDefenseFixture({
  speed = 50,
  fielding = 50,
  arm = 50,
  idPrefix = "player",
  namePrefix = "Player",
} = {}) {
  return Object.fromEntries(
    DEFENSE_POSITIONS.map((position) => [
      position,
      {
        profile: { id: `${idPrefix}:${position}` },
        name: `${namePrefix} ${position}`,
        ratings: { speed },
        defense: { fielding, arm },
      },
    ])
  );
}

function defenseFixture({
  eventId = "codex17:event:1",
  exitVelocity = 95,
  launchAngle = 30,
  sprayAngle = 12,
  speed = 50,
  fielding = 50,
  arm = 50,
  defenseSeed = 987654321,
  extra = {},
} = {}) {
  const { direction, geometry } = geometryFixture({
    eventId,
    exitVelocity,
    launchAngle,
    sprayAngle,
  });
  return generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: eventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture({ speed, fielding, arm }),
    defenseSeed,
    ...extra,
  });
}

function candidateFixture({
  pathDistanceFt = 48,
  ballTimeSec = 3,
  startPoint = { x: 0, y: 100 },
  targetPoint = { x: 0, y: 52 },
} = {}) {
  const fielderEtaSec = 0.25 + pathDistanceFt / 24;
  return {
    position: "CF",
    startPoint,
    targetPoint,
    pathDistanceFt,
    fielderEtaSec,
    ballTimeSec,
    arrivalMarginSec: ballTimeSec - fielderEtaSec,
  };
}

function legacyEventProjection(event) {
  return {
    exitVelocity: event.exitVelocity,
    launchAngle: event.launchAngle,
    qoc: event.qoc,
    evLaKey: event.evLaKey,
    source: event.source,
    sampleQuality: event.sampleQuality,
    neighborMode: event.neighborMode,
    expansionLevel: event.expansionLevel,
    outcome: event.outcome,
  };
}

function directionProjection(event) {
  return {
    battedBallEventId: event.battedBallEventId,
    directionMode: event.directionMode,
    directionModel: event.directionModel,
    direction: event.direction,
    fieldSector: event.fieldSector,
    sprayAngle: event.sprayAngle,
    horizontalLocation: event.horizontalLocation,
    verticalLocation: event.verticalLocation,
  };
}

function geometryProjection(event) {
  return {
    battedBallEventId: event.battedBallEventId,
    geometryMode: event.geometryMode,
    geometryModel: event.geometryModel,
    trajectoryClass: event.trajectoryClass,
    trajectoryKind: event.trajectoryKind,
    radialDistanceFt: event.radialDistanceFt,
    hangTimeSec: event.hangTimeSec,
    landingX: event.landingX,
    landingY: event.landingY,
    firstGroundTimeSec: event.firstGroundTimeSec,
    firstGroundDistanceFt: event.firstGroundDistanceFt,
    stopTimeSec: event.stopTimeSec,
    stopDistanceFt: event.stopDistanceFt,
    stopX: event.stopX,
    stopY: event.stopY,
    fielderGeometryCandidates: event.fielderGeometryCandidates,
  };
}

function pitchProjection(event) {
  return {
    actualPoint: event.actualPoint,
    normalizedX: event.normalizedX,
    normalizedZ: event.normalizedZ,
    normalizedRadius: event.normalizedRadius,
    actualIsZone: event.actualIsZone,
    attackRegion: event.attackRegion,
    attackRegionDetail: event.attackRegionDetail,
    zoneRow: event.zoneRow,
    zoneCol: event.zoneCol,
    locationCourse: event.locationCourse,
    locationModel: event.locationModel,
    pitchResult: event.pitchResult,
    paResult: event.paResult,
  };
}

function runGame(defenseMode, defenseSeed = 123456) {
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const mainSource = createSeededRandom(12345);
  const directionSource = createSeededRandom(
    deriveNamespacedSeed(12345, BATTED_BALL_DIRECTION_CONFIG.model)
  );
  let mainRngCalls = 0;
  let directionRngCalls = 0;
  const battedBalls = [];
  const pitches = [];
  const logs = [];
  const patches = [];
  simulateGameMutable(state, {
    ...createFastSimulationOptions({
      random: () => {
        mainRngCalls += 1;
        return mainSource();
      },
      directionMode: "shadow",
      directionRandom: () => {
        directionRngCalls += 1;
        return directionSource();
      },
      geometryMode: "shadow",
      defenseMode,
      defenseSeed,
      gameKey: "seed:12345:game:1",
      onBattedBallMeasurement: (event) => battedBalls.push(event),
      onPitchMeasurement: (event) => pitches.push(event),
    }),
    onLog: (line) => logs.push(line),
    onLastPitchPatch: (patch) => patches.push(patch),
  });
  return {
    state,
    battedBalls,
    pitches,
    logs,
    patches,
    mainRngCalls,
    directionRngCalls,
    legacyDigest: digest(battedBalls.map(legacyEventProjection)),
    directionDigest: digest(battedBalls.map(directionProjection)),
    geometryDigest: digest(battedBalls.map(geometryProjection)),
    pitchDigest: digest(pitches.map(pitchProjection)),
    eventIdDigest: digest(battedBalls.map((event) => event.battedBallEventId)),
  };
}

function createAllPublicGameableTeams() {
  const defaultTeams = createDefaultTeams();
  const mlbTeams = createMlbAverageValidationTeams();
  const gmTeams = createGmBasicReferenceValidationTeams();
  const result = [
    defaultTeams.away,
    defaultTeams.home,
    ...createDefaultLeagueTeams(),
    mlbTeams.away,
    mlbTeams.home,
    gmTeams.away,
    gmTeams.home,
  ];
  const tuning = createTuningBootstrap();
  for (const createBundle of [
    tuning.createDefaultRosterBundle,
    tuning.createMlbValidationRosterBundle,
    tuning.createGmBasicReferenceRosterBundle,
  ]) {
    const pair = tuning.buildCurrentTuningTeams(createBundle());
    result.push(pair.away, pair.home);
  }
  return result;
}

const engineOffRun = runGame("off");
const engineShadowRun = runGame("shadow");
const measurementSummary = await runMeasurementBatches({
  awayTeam: teams.away,
  homeTeam: teams.home,
  gameCount: 10,
  seed: 13579,
  runtime: { yieldControl: async () => {} },
});
const measurementReport = buildMeasurementReportObject({
  summary: measurementSummary,
  teams,
  generatedAt: "2026-07-29T00:00:00.000Z",
});

test("1 Defense default mode is off", () => {
  assert.equal(BATTED_BALL_DEFENSE_CONFIG.defaultMode, "off");
  assert.equal(createFastSimulationOptions().defenseMode, undefined);
});

test("2 high-speed measurement default mode is shadow", () => {
  assert.equal(measurementSummary.run.defenseMode, "shadow");
  assert.equal(measurementSummary.defense.mode, "shadow");
});

test("3 Geometry off with Defense shadow is rejected", async () => {
  await assert.rejects(
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 1,
      seed: 1,
      runtime: { geometryMode: "off", defenseMode: "shadow" },
    }),
    { code: "BATTED_BALL_DEFENSE_GEOMETRY_REQUIRED" }
  );
});

test("4 Direction off with Defense shadow is rejected", async () => {
  await assert.rejects(
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 1,
      seed: 1,
      runtime: {
        directionMode: "off",
        geometryMode: "shadow",
        defenseMode: "shadow",
      },
    }),
    { code: "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED" }
  );
});

test("5 SPD defaults to 50 for batters and pitchers", () => {
  assert.equal(createGameBatter("B", 50, 50, 50).ratings.speed, 50);
  assert.equal(createGamePitcher("P", 50, 50).ratings.speed, 50);
});

test("6 SPD accepts 0, 50, and 100 and snapshots preserve it", () => {
  for (const speed of [0, 50, 100]) {
    const batter = createGameBatter("B", 50, 50, 50, { speed });
    const pitcher = createGamePitcher("P", 50, 50, {}, { speed });
    assert.equal(batter.ratings.speed, speed);
    assert.equal(pitcher.ratings.speed, speed);
    assert.equal("speed" in batter.profile, false);
    assert.equal("speed" in pitcher.profile, false);
    assert.equal(createSeasonBatterSnapshot(batter).ratings.speed, speed);
  }
});

test("7 invalid SPD is rejected without correction", () => {
  for (const speed of [-1, 101, NaN, Infinity, "50", null]) {
    assert.throws(
      () => createGameBatter("B", 50, 50, 50, { speed }),
      { code: "PLAYER_SPEED_INVALID" }
    );
    assert.throws(
      () => createGamePitcher("P", 50, 50, {}, { speed }),
      { code: "PLAYER_SPEED_INVALID" }
    );
  }
});

test("8 all 16 public teams retain valid nine-position defense with SPD", () => {
  const publicTeams = createAllPublicGameableTeams();
  assert.equal(publicTeams.length, 16);
  for (const team of publicTeams) {
    for (const player of [
      ...team.lineup,
      team.startingPitcher,
      ...(team.bullpen || []),
    ]) {
      assert.equal(player.ratings.speed, 50, player.name);
    }
    const state = createInitialSimState(
      structuredClone(team),
      structuredClone(team)
    );
    assert.deepEqual(
      Object.keys(resolveActiveDefense(state, "home")),
      DEFENSE_POSITIONS
    );
  }
});

test("9 only fly and popup are eligible", () => {
  assert.equal(defenseFixture({ launchAngle: 30 }).eligible, true);
  assert.equal(defenseFixture({ launchAngle: 55 }).eligible, true);
});

test("10 ground and both liner classes are excluded with reasons", () => {
  for (const [launchAngle, reason] of [
    [-5, "trajectory_ground"],
    [5, "trajectory_low_liner"],
    [15, "trajectory_air_liner"],
  ]) {
    const event = defenseFixture({ launchAngle });
    assert.equal(event.eligible, false);
    assert.equal(event.exclusionReason, reason);
    assert.equal(event.probabilities, null);
  }
});

test("11 ineligible opportunities consume zero Defense RNG", () => {
  assert.equal(defenseFixture({ launchAngle: 15 }).defenseRngCalls, 0);
});

test("12 eligible opportunities consume exactly two Defense RNG calls", () => {
  assert.equal(defenseFixture().defenseRngCalls, 2);
});

test("13 all Defense probabilities are finite and within zero to one", () => {
  for (const value of Object.values(defenseFixture().probabilities)) {
    assert.equal(Number.isFinite(value), true);
    assert.equal(value >= 0 && value <= 1, true);
  }
});

test("14 increasing margin does not reduce pReach", () => {
  const low = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({ ballTimeSec: 2 }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  const high = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({ ballTimeSec: 4 }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  assert.ok(high.pReachAverage >= low.pReachAverage);
});

test("15 increasing distance does not increase pReach", () => {
  const near = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({
      pathDistanceFt: 24,
      targetPoint: { x: 0, y: 76 },
    }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  const far = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({
      pathDistanceFt: 72,
      targetPoint: { x: 0, y: 28 },
    }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  assert.ok(far.pReachAverage <= near.pReachAverage);
});

test("16 increasing available time does not reduce pReach", () => {
  const shortTime = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({ ballTimeSec: 2.5 }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  const longTime = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({ ballTimeSec: 4.5 }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  assert.ok(longTime.pReachAverage >= shortTime.pReachAverage);
});

test("17 back movement is not easier than equivalent toward-home movement", () => {
  const back = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({
      pathDistanceFt: 50,
      startPoint: { x: 0, y: 100 },
      targetPoint: { x: 0, y: 150 },
    }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  const toward = evaluateAverageDefenseCandidate({
    candidate: candidateFixture({
      pathDistanceFt: 50,
      startPoint: { x: 0, y: 100 },
      targetPoint: { x: 0, y: 50 },
    }),
    trajectoryClass: "fly",
    exitVelocity: 95,
  });
  assert.equal(back.movementDirection, "back");
  assert.equal(toward.movementDirection, "toward_home");
  assert.ok(back.pReachAverage <= toward.pReachAverage);
});

test("18 higher EV does not increase equivalent pSecure", () => {
  const candidate = candidateFixture();
  const low = evaluateAverageDefenseCandidate({
    candidate,
    trajectoryClass: "fly",
    exitVelocity: 85,
  });
  const high = evaluateAverageDefenseCandidate({
    candidate,
    trajectoryClass: "fly",
    exitVelocity: 105,
  });
  assert.ok(high.pSecureAverage <= low.pSecureAverage);
});

test("19 higher SPD does not reduce pReachActual", () => {
  assert.ok(
    defenseFixture({ speed: 100 }).probabilities.pReachActual >=
      defenseFixture({ speed: 0 }).probabilities.pReachActual
  );
});

test("20 higher FLD does not reduce pReachActual", () => {
  assert.ok(
    defenseFixture({ fielding: 100 }).probabilities.pReachActual >=
      defenseFixture({ fielding: 0 }).probabilities.pReachActual
  );
});

test("21 higher FLD does not reduce pSecureActual", () => {
  assert.ok(
    defenseFixture({ fielding: 100 }).probabilities.pSecureActual >=
      defenseFixture({ fielding: 0 }).probabilities.pSecureActual
  );
});

test("22 ARM changes do not affect responsible fielder or probabilities", () => {
  const low = defenseFixture({ arm: 0 });
  const high = defenseFixture({ arm: 100 });
  assert.equal(
    low.responsibleFielder.position,
    high.responsibleFielder.position
  );
  assert.deepEqual(low.probabilities, high.probabilities);
});

test("23 responsible fielder has the maximum average catch probability", () => {
  const { geometry, direction } = geometryFixture();
  const opportunity = buildDefenseOpportunity({
    geometryShadow: geometry,
    directionShadow: direction,
  });
  const event = generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture(),
    defenseSeed: 987654321,
  });
  const maximum = Math.max(
    ...opportunity.candidateEvaluations.map(
      (candidate) => candidate.pCatchAverage
    )
  );
  const responsible = opportunity.candidateEvaluations.find(
    (candidate) =>
      candidate.position === event.responsibleFielder.position
  );
  assert.equal(responsible.pCatchAverage, maximum);
});

test("24 equal average probabilities use fixed position order", () => {
  const { direction, geometry } = geometryFixture();
  const equalCandidate = {
    startPoint: { x: 0, y: 100 },
    targetPoint: { x: 0, y: 50 },
    pathDistanceFt: 50,
    reactionTimeSec: 0.25,
    moveSpeedFtPerSec: 24,
    fielderEtaSec: 0.25 + 50 / 24,
    ballTimeSec: 4,
    arrivalMarginSec: 4 - (0.25 + 50 / 24),
  };
  const tiedGeometry = {
    ...geometry,
    fielderCandidates: DEFENSE_POSITIONS.map((position) => ({
      ...equalCandidate,
      position,
    })),
  };
  const event = generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: tiedGeometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture(),
    defenseSeed: 1,
  });
  assert.equal(event.responsibleFielder.position, DEFENSE_POSITIONS[0]);
});

test("25 actual FLD changes do not change responsible position", () => {
  assert.equal(
    defenseFixture({ fielding: 0 }).responsibleFielder.position,
    defenseFixture({ fielding: 100 }).responsibleFielder.position
  );
});

test("26 actual SPD changes do not change responsible position", () => {
  assert.equal(
    defenseFixture({ speed: 0 }).responsibleFielder.position,
    defenseFixture({ speed: 100 }).responsibleFielder.position
  );
});

test("27 player identity changes do not change responsible position", () => {
  const { direction, geometry } = geometryFixture();
  const first = generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture({
      idPrefix: "first",
      namePrefix: "First",
    }),
    defenseSeed: 1,
  });
  const second = generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture({
      idPrefix: "second",
      namePrefix: "Second",
    }),
    defenseSeed: 1,
  });
  assert.equal(
    first.responsibleFielder.position,
    second.responsibleFielder.position
  );
  assert.deepEqual(first.probabilities, second.probabilities);
});

test("28 pActualOut equals pReachActual times pSecureActual", () => {
  const probabilities = defenseFixture().probabilities;
  assert.equal(
    probabilities.pActualOut,
    probabilities.pReachActual * probabilities.pSecureActual
  );
});

test("29 v1 standard and aligned average probabilities are equal", () => {
  const probabilities = defenseFixture().probabilities;
  assert.equal(
    probabilities.pStandardAlignmentOut,
    probabilities.pAlignedAverageOut
  );
});

test("30 positioningExpectedOuts is zero in v1", () => {
  assert.equal(defenseFixture().metrics.positioningExpectedOuts, 0);
});

test("31 reach failure still generates secure roll without attempting secure", () => {
  let event = null;
  for (let index = 0; index < 1000; index += 1) {
    const candidate = defenseFixture({
      eventId: `codex17:reach-fail:${index}`,
      launchAngle: 30,
    });
    if (!candidate.shadowCatchResult.reachSuccess) {
      event = candidate;
      break;
    }
  }
  assert.ok(event);
  assert.equal(Number.isFinite(event.shadowCatchResult.secureRoll), true);
  assert.equal(event.shadowCatchResult.secureAttempted, false);
  assert.equal(event.shadowCatchResult.secureSuccess, null);
});

test("32 identical seed and event ID reproduce the Shadow result", () => {
  assert.deepEqual(
    defenseFixture().shadowCatchResult,
    defenseFixture().shadowCatchResult
  );
});

test("33 changing event ID separates Defense substreams", () => {
  assert.notDeepEqual(
    defenseFixture({ eventId: "event:a" }).shadowCatchResult,
    defenseFixture({ eventId: "event:b" }).shadowCatchResult
  );
});

test("34 reach namespace activity cannot shift the secure namespace roll", () => {
  const eventId = "codex17:namespace";
  const defenseSeed = 777;
  const event = defenseFixture({ eventId, defenseSeed });
  const unrelatedReach = createSeededRandom(
    deriveNamespacedSeed(defenseSeed, `${eventId}:future_reach_stage`)
  );
  for (let index = 0; index < 20; index += 1) unrelatedReach();
  const secureRoll = createSeededRandom(
    deriveNamespacedSeed(
      defenseSeed,
      `${eventId}:${BATTED_BALL_DEFENSE_CONFIG.rngNamespaces.secure}`
    )
  )();
  assert.equal(event.shadowCatchResult.secureRoll, secureRoll);
});

test("35 Defense shadow consumes no additional main RNG", () => {
  assert.equal(engineShadowRun.mainRngCalls, engineOffRun.mainRngCalls);
});

test("36 Defense shadow consumes no additional Direction RNG", () => {
  assert.equal(
    engineShadowRun.directionRngCalls,
    engineOffRun.directionRngCalls
  );
  assert.equal(engineShadowRun.directionDigest, engineOffRun.directionDigest);
});

test("37 Geometry digest is identical with Defense off and shadow", () => {
  assert.equal(engineShadowRun.geometryDigest, engineOffRun.geometryDigest);
  assert.equal(
    engineShadowRun.battedBalls.reduce(
      (sum, event) => sum + event.geometryRngCalls,
      0
    ),
    0
  );
});

test("38 changing Defense seed leaves the legacy digest unchanged", () => {
  const first = runGame("shadow", 1);
  const second = runGame("shadow", 2);
  assert.equal(first.legacyDigest, second.legacyDigest);
  assert.equal(digest(first.state), digest(second.state));
});

test("39 simCatchOAA formula holds and is centered in a large average fixture", () => {
  const event = defenseFixture();
  assert.equal(
    event.metrics.simCatchOAA,
    (event.shadowCatchResult.caught ? 1 : 0) -
      event.probabilities.pAlignedAverageOut
  );
  let sum = 0;
  const trials = 4000;
  for (let index = 0; index < trials; index += 1) {
    sum += defenseFixture({
      eventId: `codex17:oaa:${index}`,
    }).metrics.simCatchOAA;
  }
  assert.ok(Math.abs(sum / trials) < 0.03);
});

test("40 expectedSkillOuts plus residual equals simCatchOAA", () => {
  const metrics = defenseFixture().metrics;
  assert.equal(
    metrics.expectedSkillOuts + metrics.executionResidual,
    metrics.simCatchOAA
  );
});

test("41 team OAA conservation identity holds", () => {
  const metrics = defenseFixture().metrics;
  assert.equal(
    metrics.teamExecutionOAA + metrics.positioningExpectedOuts,
    metrics.teamOAA_vsStandard
  );
});

test("42 OAA is not clamped to a probability interval", () => {
  let negative = null;
  for (let index = 0; index < 1000; index += 1) {
    const event = defenseFixture({ eventId: `codex17:oaa-negative:${index}` });
    if (!event.shadowCatchResult.caught) {
      negative = event.metrics.simCatchOAA;
      break;
    }
  }
  assert.ok(negative < 0);
});

test("43 selectedOutcome metadata alone cannot change Defense", () => {
  const base = defenseFixture();
  const changed = defenseFixture({ extra: { selectedOutcome: "homeRun" } });
  assert.deepEqual(changed, base);
});

test("44 QoC metadata alone cannot change Defense", () => {
  assert.deepEqual(
    defenseFixture({ extra: { qoc: "Barrel" } }),
    defenseFixture({ extra: { qoc: "Weak" } })
  );
});

test("45 course metadata alone cannot change Defense", () => {
  assert.deepEqual(
    defenseFixture({ extra: { course: "A", locationCourse: "Ball" } }),
    defenseFixture({ extra: { course: "Ball", locationCourse: "C" } })
  );
});

test("46 game situation metadata cannot change catch probabilities", () => {
  const first = defenseFixture({
    extra: { runners: {}, score: { away: 0, home: 0 }, inning: 1 },
  });
  const second = defenseFixture({
    extra: {
      runners: { first: "runner" },
      score: { away: 10, home: 0 },
      inning: 9,
      outs: 2,
    },
  });
  assert.deepEqual(first.probabilities, second.probabilities);
});

test("47 Defense service does not mutate its inputs", () => {
  const { direction, geometry } = geometryFixture();
  const activeDefense = activeDefenseFixture();
  const before = structuredClone({ direction, geometry, activeDefense });
  generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense,
    defenseSeed: 1,
  });
  assert.deepEqual({ direction, geometry, activeDefense }, before);
});

test("48 exactly one Defense evaluation is emitted per fair batted ball", () => {
  assert.equal(
    engineShadowRun.battedBalls.length,
    new Set(
      engineShadowRun.battedBalls.map(
        (event) => event.battedBallEventId
      )
    ).size
  );
  assert.ok(
    engineShadowRun.battedBalls.every(
      (event) => event.defenseMode === "shadow"
    )
  );
});

test("49 Defense accumulator retains no raw events, probabilities, or rolls", () => {
  const serialized = JSON.stringify(
    createDefenseMeasurementAccumulator()
  );
  assert.doesNotMatch(
    serialized,
    /battedBallEventId|rawEvents|probabilityValues|reachRoll|secureRoll/
  );
  assert.equal("events" in createEmptyMeasurementAccumulator().defense, false);
});

test("50 Summary and Report schema versions are 8", () => {
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 8);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 8);
  assert.equal(measurementSummary.reportSchemaVersion, 8);
  assert.equal(measurementReport.reportSchemaVersion, 8);
});

test("51 every schema v5 top-level field remains present", () => {
  const summaryFields = [
    "battedBallMetrics", "battingProfiles", "breakdowns",
    "contactDisposition", "diagnostics", "direction",
    "gameDistribution", "geometry", "pitchLocation", "pitchers",
    "plateDiscipline", "players", "qoc", "referenceBenchmark",
    "referenceComparison", "reportSchemaVersion", "results", "run",
    "simulationErrors", "smoothingDiagnostics", "status",
  ];
  const reportFields = [
    "battedBallMetrics", "battedBallProfiles", "batting", "breakdowns",
    "contactDisposition", "definitions", "diagnostics", "direction",
    "engineConfig", "gameDistribution", "generatedAt", "geometry",
    "modelLimitations", "partial", "pitchLocation", "pitchers",
    "pitching", "plateDiscipline", "players", "qoc",
    "referenceBenchmark", "referenceComparison", "reportSchemaVersion",
    "reportType", "results", "run", "simulationErrors",
    "smoothingDiagnostics", "status", "teams", "validationPreset",
    "validationPresetLabel",
  ];
  for (const field of summaryFields) {
    assert.equal(Object.hasOwn(measurementSummary, field), true, field);
  }
  for (const field of reportFields) {
    assert.equal(Object.hasOwn(measurementReport, field), true, field);
  }
});

test("52 Markdown includes Defense aggregates and required limitations", () => {
  const markdown = buildMeasurementMarkdown({
    summary: measurementSummary,
    teams,
    generatedAt: "2026-07-29T00:00:00.000Z",
  });
  for (const expected of [
    "Simple Catch Defense Shadow",
    "fly and popup",
    "ground, low_liner, and air_liner",
    "not official or calibrated Statcast",
    "contact as t = 0",
    "differs from MLB Catch Probability Opportunity Time",
    "Responsible Fielder is selected",
    "pStandardAlignmentOut equals pAlignedAverageOut",
    "diagnostic_only",
    "selectedOutcome",
    "Walls, liner en-route catches",
    "https://www.mlb.com/glossary/statcast/catch-probability",
    "https://www.mlb.com/glossary/statcast/outs-above-average",
  ]) {
    assert.match(markdown, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("53 Debugger uses pure Geometry and Defense services directly", async () => {
  const html = await readFile(
    new URL("../geometry-debugger.html", import.meta.url),
    "utf8"
  );
  const page = await readFile(
    new URL("../pages/geometryDebuggerPage.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /battedBallGeometryService\.js/);
  assert.match(page, /defenseOpportunityService\.js/);
  assert.match(page, /defenseShadowService\.js/);
  assert.match(page, /generateDefenseShadow/);
  assert.match(html, /Responsible Fielder FLD/);
  assert.match(html, /Responsible Fielder SPD/);
  assert.doesNotMatch(page, /selectBattedBallOutcome|getEvLaOutcomeProbabilities/);
});

test("54 normal UI, lastPitch patches, logs, and legacy game remain unchanged", () => {
  assert.equal(engineShadowRun.legacyDigest, engineOffRun.legacyDigest);
  assert.equal(digest(engineShadowRun.state), digest(engineOffRun.state));
  assert.equal(engineShadowRun.pitchDigest, engineOffRun.pitchDigest);
  assert.equal(engineShadowRun.eventIdDigest, engineOffRun.eventIdDigest);
  assert.deepEqual(engineShadowRun.logs, engineOffRun.logs);
  assert.deepEqual(engineShadowRun.patches, engineOffRun.patches);
  assert.deepEqual(RESOLUTION_AUTHORITY_CONFIG, {
    fairFoul: "legacy_contact",
    homeRun: "legacy_ev_la",
    outSafe: "legacy_ev_la",
    hitType: "legacy_ev_la",
    runnerAdvance: "legacy_base_running",
    officialScoring: "legacy_contact",
  });
});
