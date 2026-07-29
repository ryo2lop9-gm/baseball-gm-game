import { getPitchTypeLabel } from "../config/pitchConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../config/defenseProbabilityConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../config/fieldGeometryConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../config/resolutionAuthorityConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../config/trajectoryModelConfig.js";
import { recordVelocityBandPlateAppearance } from "./velocityBandStatsService.js";

export const APPLICABLE_BATTED_BALL_OUTCOMES = Object.freeze([
  "out",
  "single",
  "double",
  "triple",
  "homeRun",
]);

function assertApplicableBattedBallOutcome(selectedOutcome) {
  if (APPLICABLE_BATTED_BALL_OUTCOMES.includes(selectedOutcome)) return;

  const error = new Error("Selected batted-ball outcome is invalid.");
  error.code = "BATTED_BALL_OUTCOME_INVALID";
  error.context = { selectedOutcome };
  throw error;
}

function recordVelocityResult(state, side, pitchVelocity, result) {
  const teamBox = state?.box?.[side];
  if (!teamBox) return;

  teamBox.velocityBandStats = recordVelocityBandPlateAppearance(
    teamBox.velocityBandStats,
    pitchVelocity,
    result
  );
}

function formatBattedBallSuffix(
  battedBall,
  outcomeSource,
  sampleQuality,
  evLaKey
) {
  if (!battedBall) return "";

  const parts = [
    `${battedBall.exitVelocity}mph, ${battedBall.launchAngle}°`,
    sampleQuality || "unknown",
    outcomeSource || "-",
    evLaKey || "-",
  ];

  return ` (${parts.join(" / ")})`;
}

function emitBattedBallMeasurement(options, event) {
  if (typeof options?.onBattedBallMeasurement !== "function") return;
  options.onBattedBallMeasurement(event);
}

export function applySelectedBattedBallOutcome({
  selectedOutcome,
  source,
  evLaKey,
  sampleQuality,
  smoothing,
  state,
  batter,
  side,
  pitchType,
  course,
  pitchVelocity,
  qoc,
  battedBall,
  options,
  addQoCToBox,
  addOutInPlayStat,
  addHitStat,
  advanceRunnersOnHit,
  maybeEndGameMidInning,
  moveToNextBatter,
  finishPlateAppearanceState,
  emitLog,
  emitLastPitchPatch,
}) {
  assertApplicableBattedBallOutcome(selectedOutcome);

  const outcomeSmoothing = smoothing || {};
  const battedBallSuffix = formatBattedBallSuffix(
    battedBall,
    source,
    sampleQuality,
    evLaKey
  );
  const directionShadow = battedBall?.directionShadow;
  const geometryShadow = battedBall?.geometryShadow;
  const defenseShadow = battedBall?.defenseShadow;
  const geometryTrajectory = geometryShadow?.trajectory;

  // QoC remains an analysis/logging label and never selects the outcome.
  addQoCToBox(state, qoc);
  emitLastPitchPatch(options, {
    outcomeSource: source,
    evLaKey,
    sampleQuality,
  });

  const pitchContext = options?.pitchMeasurementContext || {};
  const emitOutcomeMeasurement = (runsScored) =>
    emitBattedBallMeasurement(options, {
      side,
      battingSide: pitchContext.battingSide || side,
      defenseSide: pitchContext.defenseSide ?? null,
      batterKey: pitchContext.batterKey ?? null,
      batterName: pitchContext.batterName || batter?.name || "-",
      batterRatings: pitchContext.batterRatings || null,
      lineupIndex: Number.isInteger(pitchContext.lineupIndex)
        ? pitchContext.lineupIndex
        : null,
      pitcherKey: pitchContext.pitcherKey ?? null,
      pitcherName: pitchContext.pitcherName ?? null,
      pitchType: pitchContext.pitchType || pitchType || "unknown",
      pitchVelocity: Number.isFinite(Number(pitchVelocity))
        ? Number(pitchVelocity)
        : null,
      course: pitchContext.course || course || "unknown",
      isStrike:
        typeof pitchContext.isStrike === "boolean"
          ? pitchContext.isStrike
          : null,
      ballsBefore: Number.isInteger(pitchContext.ballsBefore)
        ? pitchContext.ballsBefore
        : null,
      strikesBefore: Number.isInteger(pitchContext.strikesBefore)
        ? pitchContext.strikesBefore
        : null,
      runsScored,
      exitVelocity: battedBall.exitVelocity,
      launchAngle: battedBall.launchAngle,
      qoc,
      battedBallEventId: battedBall?.battedBallEventId ?? null,
      directionMode: directionShadow?.mode || "off",
      directionModel: directionShadow?.model ?? null,
      batterBats: directionShadow?.batterBats ?? null,
      pitcherThrows: directionShadow?.pitcherThrows ?? null,
      resolvedBattingSide: directionShadow?.resolvedBattingSide ?? null,
      directionType: directionShadow?.directionType ?? null,
      measurementClass: directionShadow?.measurementClass ?? null,
      direction: directionShadow?.direction ?? null,
      fieldSector: directionShadow?.fieldSector ?? null,
      batterRelativeSprayAngle:
        directionShadow?.batterRelativeSprayAngle ?? null,
      sprayAngle: directionShadow?.sprayAngle ?? null,
      horizontalLocation: directionShadow?.horizontalLocation ?? null,
      verticalLocation: directionShadow?.verticalLocation ?? null,
      directionRngCalls: directionShadow?.directionRngCalls ?? 0,
      geometryMode: geometryShadow?.mode || "off",
      geometryModel:
        geometryShadow?.model ?? FIELD_GEOMETRY_CONFIG.model,
      geometryEventSchemaVersion:
        geometryShadow?.geometryEventSchemaVersion ??
        FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion,
      geometrySource:
        geometryShadow?.source ?? TRAJECTORY_MODEL_CONFIG.source,
      coordinateSystem:
        geometryShadow?.coordinateSystem ??
        FIELD_GEOMETRY_CONFIG.coordinateSystem,
      trajectoryClass: geometryShadow?.trajectoryClass ?? null,
      trajectoryKind: geometryShadow?.trajectoryKind ?? null,
      radialDistanceFt:
        geometryTrajectory?.radialDistanceFt ?? null,
      hangTimeSec: geometryTrajectory?.hangTimeSec ?? null,
      landingX: geometryTrajectory?.landingPoint?.x ?? null,
      landingY: geometryTrajectory?.landingPoint?.y ?? null,
      firstGroundTimeSec:
        geometryTrajectory?.firstGroundTimeSec ?? null,
      firstGroundDistanceFt:
        geometryTrajectory?.firstGroundDistanceFt ?? null,
      stopTimeSec: geometryTrajectory?.stopTimeSec ?? null,
      stopDistanceFt: geometryTrajectory?.stopDistanceFt ?? null,
      stopX: geometryTrajectory?.stopPoint?.x ?? null,
      stopY: geometryTrajectory?.stopPoint?.y ?? null,
      fielderGeometryCandidates:
        geometryShadow?.fielderCandidates ?? null,
      geometryRngCalls: geometryShadow?.geometryRngCalls ?? 0,
      geometryFallbackUsed: geometryShadow?.fallbackUsed ?? false,
      parkId: geometryShadow?.parkId ?? FIELD_GEOMETRY_CONFIG.parkId,
      airPathModel: geometryShadow?.airPathModel ?? null,
      fenceModel: geometryShadow?.fenceModel ?? null,
      fenceSource: geometryShadow?.fenceSource ?? null,
      airPath: geometryShadow?.airPath ?? null,
      fence: geometryShadow?.fence ?? null,
      wallContext: geometryShadow?.wallContext ?? null,
      wallIntersection: geometryShadow?.wallIntersection ?? null,
      isOverFence: geometryShadow?.isOverFence ?? null,
      resolutionAuthority:
        geometryShadow?.authority ?? RESOLUTION_AUTHORITY_CONFIG,
      defenseMode:
        defenseShadow?.mode ?? BATTED_BALL_DEFENSE_CONFIG.defaultMode,
      defenseModel:
        defenseShadow?.model ?? BATTED_BALL_DEFENSE_CONFIG.model,
      defenseSource:
        defenseShadow?.source ?? BATTED_BALL_DEFENSE_CONFIG.source,
      defenseEventSchemaVersion:
        defenseShadow?.defenseEventSchemaVersion ??
        BATTED_BALL_DEFENSE_CONFIG.defenseEventSchemaVersion,
      defenseEligible: defenseShadow?.eligible ?? false,
      defenseExclusionReason:
        defenseShadow?.exclusionReason ?? "mode_off",
      responsibleFielderPosition:
        defenseShadow?.responsibleFielder?.position ?? null,
      responsibleFielderPlayerId:
        defenseShadow?.responsibleFielder?.playerId ?? null,
      movementDirection: defenseShadow?.movementDirection ?? null,
      defenseFieldingRating:
        defenseShadow?.ratings?.fielding ?? null,
      defenseSpeedRating: defenseShadow?.ratings?.speed ?? null,
      defensePathDistanceFt:
        defenseShadow?.timing?.pathDistanceFt ?? null,
      defenseBallTimeSec:
        defenseShadow?.timing?.ballTimeSec ?? null,
      defenseAverageMarginSec:
        defenseShadow?.timing?.adjustedAverageMargin ?? null,
      defenseActualMarginSec:
        defenseShadow?.timing?.adjustedActualMargin ?? null,
      pReachAverage:
        defenseShadow?.probabilities?.pReachAverage ?? null,
      pSecureAverage:
        defenseShadow?.probabilities?.pSecureAverage ?? null,
      pReachActual:
        defenseShadow?.probabilities?.pReachActual ?? null,
      pSecureActual:
        defenseShadow?.probabilities?.pSecureActual ?? null,
      pStandardAlignmentOut:
        defenseShadow?.probabilities?.pStandardAlignmentOut ?? null,
      pAlignedAverageOut:
        defenseShadow?.probabilities?.pAlignedAverageOut ?? null,
      pActualOut:
        defenseShadow?.probabilities?.pActualOut ?? null,
      reachSuccess:
        defenseShadow?.shadowCatchResult?.reachSuccess ?? null,
      secureAttempted:
        defenseShadow?.shadowCatchResult?.secureAttempted ?? null,
      secureSuccess:
        defenseShadow?.shadowCatchResult?.secureSuccess ?? null,
      shadowCaught:
        defenseShadow?.shadowCatchResult?.caught ?? null,
      simCatchOAA: defenseShadow?.metrics?.simCatchOAA ?? null,
      expectedSkillOuts:
        defenseShadow?.metrics?.expectedSkillOuts ?? null,
      executionResidual:
        defenseShadow?.metrics?.executionResidual ?? null,
      teamOAA_vsStandard:
        defenseShadow?.metrics?.teamOAA_vsStandard ?? null,
      teamExecutionOAA:
        defenseShadow?.metrics?.teamExecutionOAA ?? null,
      positioningExpectedOuts:
        defenseShadow?.metrics?.positioningExpectedOuts ?? null,
      defenseRngCalls: defenseShadow?.defenseRngCalls ?? 0,
      defenseFallbackUsed: defenseShadow?.fallbackUsed ?? false,
      shadowAuthority:
        defenseShadow?.shadowAuthority ??
        BATTED_BALL_DEFENSE_CONFIG.shadowAuthority,
      evLaKey,
      source,
      sampleQuality,
      neighborMode: outcomeSmoothing.neighborMode ?? null,
      expansionLevel: outcomeSmoothing.expansionLevel ?? null,
      targetBattedBalls: outcomeSmoothing.targetBattedBalls ?? 0,
      targetWeight: outcomeSmoothing.targetWeight ?? 0,
      neighborEffectiveSampleSize:
        outcomeSmoothing.neighborEffectiveSampleSize ?? 0,
      neighborCount: outcomeSmoothing.neighborCount ?? null,
      weightedNeighborBattedBalls:
        outcomeSmoothing.weightedNeighborBattedBalls ?? null,
      effectivePriorStrength:
        outcomeSmoothing.effectivePriorStrength ?? null,
      nearestDistanceSquared:
        outcomeSmoothing.nearestDistanceSquared ?? null,
      nearestEvDistance: outcomeSmoothing.nearestEvDistance ?? null,
      nearestLaDistance: outcomeSmoothing.nearestLaDistance ?? null,
      physicalConstraints: [
        ...(outcomeSmoothing.physicalConstraints || []),
      ],
      outcome: selectedOutcome,
    });

  if (selectedOutcome === "out") {
    state.outs += 1;
    state.box[side].outsInPlay += 1;
    addOutInPlayStat(batter);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 0,
    });
    emitLastPitchPatch(options, {
      resultText: `${qoc} / 凡打${battedBallSuffix}`,
    });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(
        pitchType
      )}を${qoc}で凡打。${battedBallSuffix}`
    );
    emitOutcomeMeasurement(0);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    return { outcome: selectedOutcome, runsScored: 0 };
  }

  if (selectedOutcome === "single") {
    state.box[side].hits += 1;
    const runs = advanceRunnersOnHit(state, batter, 1);
    addHitStat(batter, "1B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      totalBases: 1,
    });
    emitLastPitchPatch(options, {
      resultText: `${qoc} / 安打${battedBallSuffix}`,
    });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で安打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    emitOutcomeMeasurement(runs);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return { outcome: selectedOutcome, runsScored: runs };
  }

  if (selectedOutcome === "double") {
    state.box[side].hits += 1;
    state.box[side].doubles += 1;
    const runs = advanceRunnersOnHit(state, batter, 2);
    addHitStat(batter, "2B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      doubles: 1,
      totalBases: 2,
    });
    emitLastPitchPatch(options, {
      resultText: `${qoc} / 二塁打${battedBallSuffix}`,
    });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で二塁打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    emitOutcomeMeasurement(runs);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return { outcome: selectedOutcome, runsScored: runs };
  }

  if (selectedOutcome === "triple") {
    state.box[side].hits += 1;
    state.box[side].triples += 1;
    const runs = advanceRunnersOnHit(state, batter, 3);
    addHitStat(batter, "3B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      triples: 1,
      totalBases: 3,
    });
    emitLastPitchPatch(options, {
      resultText: `${qoc} / 三塁打${battedBallSuffix}`,
    });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で三塁打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    emitOutcomeMeasurement(runs);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return { outcome: selectedOutcome, runsScored: runs };
  }

  if (selectedOutcome === "homeRun") {
    state.box[side].hits += 1;
    state.box[side].hr += 1;
    const runs = advanceRunnersOnHit(state, batter, 4);
    addHitStat(batter, "HR", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      HR: 1,
      totalBases: 4,
    });
    emitLastPitchPatch(options, {
      resultText: `${qoc} / 本塁打${battedBallSuffix}`,
    });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(
        pitchType
      )}を${qoc}で本塁打。${runs}点${battedBallSuffix}`
    );
    emitOutcomeMeasurement(runs);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return { outcome: selectedOutcome, runsScored: runs };
  }

  throw new Error("Unreachable batted-ball outcome branch.");
}
