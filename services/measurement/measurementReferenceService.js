export const MLB_2025_REFERENCE_SOURCE_URL =
  "https://baseballsavant.mlb.com/league?season=2025";

const REFERENCE_TOTALS = Object.freeze({
  PA: 182926,
  AB: 163664,
  H: 40138,
  doubles: 7745,
  triples: 628,
  HR: 5650,
  BB: 15379,
  K: 40645,
  pitches: 710084,
  BBE: 124888,
});

const REFERENCE_METRICS = Object.freeze({
  AVG: 0.245,
  OBP: 0.315,
  SLG: 0.404,
  OPS: 0.719,
  BBPct: 0.0840722478,
  KPct: 0.2221936739,
  HRPct: 0.0308868067,
  pitchesPerPA: 3.8818101309,
  zonePct: 0.506,
  swingPct: 0.478,
  zSwingPct: 0.669,
  zoneContactPct: 0.827,
  chasePct: 0.282,
  chaseContactPct: 0.553,
  whiffPct: 0.253,
  firstPitchStrikePct: 0.621,
  averageExitVelocity: 89.4,
  averageLaunchAngle: 13.5,
  hardHitPct: 0.409,
  sweetSpotPct: 0.341,
  GBPct: 0.424,
  LDPct: 0.239,
  FBPct: 0.266,
  PUPct: 0.071,
  officialBarrelPct: 0.086,
});

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function calculateMlb2025DerivedContactDisposition() {
  const pitches = REFERENCE_TOTALS.pitches;
  const fairBattedBalls = REFERENCE_TOTALS.BBE;
  const swings = pitches * REFERENCE_METRICS.swingPct;
  const contacts = swings * (1 - REFERENCE_METRICS.whiffPct);
  const fouls = contacts - fairBattedBalls;

  return {
    pitches,
    swings,
    contacts,
    fouls,
    fairBattedBalls,
    contactPerPitch: safeDivide(contacts, pitches),
    foulPerPitch: safeDivide(fouls, pitches),
    fairBattedBallPerPitch: safeDivide(fairBattedBalls, pitches),
    foulPerContact: safeDivide(fouls, contacts),
    fairBattedBallPerContact: safeDivide(fairBattedBalls, contacts),
    derivation:
      "Derived from rounded official Swing% and Whiff% plus official Pitches and BBE totals; these rates are not directly published on the source page.",
  };
}

const MLB_2025_REFERENCE_BENCHMARK = Object.freeze({
  id: "baseball_savant_2025_mlb",
  label: "2025 MLB参考",
  season: 2025,
  source: Object.freeze({
    name: "Baseball Savant League Statcast Year to Year Stats",
    url: MLB_2025_REFERENCE_SOURCE_URL,
    accessedAs: "Static benchmark bundled with the application",
  }),
  totals: REFERENCE_TOTALS,
  metrics: REFERENCE_METRICS,
  definitionNotes: Object.freeze([
    "Current QoC Barrel is not comparable with official Statcast Barrel%.",
    "Current GB/LD/FB/PU use launch-angle thresholds; the reference uses Baseball Savant batted-ball classifications, so those rows are approximate comparisons.",
    "HardHit% uses EV >= 95 mph and SweetSpot% uses launch angle from 8 through 32 degrees in the current measurement.",
    "Reference Contact/Foul/Fair rates are derived from rounded official Swing% and Whiff% plus Pitches and BBE.",
  ]),
});

export function getMlb2025ReferenceBenchmark() {
  return {
    ...structuredClone(MLB_2025_REFERENCE_BENCHMARK),
    derivedContactDisposition: calculateMlb2025DerivedContactDisposition(),
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function comparisonRow({
  key,
  label,
  current,
  reference,
  accuracy,
  format = "rate",
  note = "",
}) {
  const currentValue = finiteOrNull(current);
  const referenceValue = finiteOrNull(reference);
  const comparable =
    accuracy !== "not_comparable" &&
    currentValue !== null &&
    referenceValue !== null;

  return {
    key,
    label,
    current: currentValue,
    reference: referenceValue,
    difference: comparable ? currentValue - referenceValue : null,
    accuracy,
    format,
    note,
  };
}

export function buildMeasurementReferenceComparison(summary) {
  const results = summary?.results?.combined || {};
  const discipline = summary?.plateDiscipline?.combined || {};
  const profile = summary?.battingProfiles?.combined || {};
  const contact = summary?.contactDisposition || {};
  const reference = REFERENCE_METRICS;
  const derived = calculateMlb2025DerivedContactDisposition();

  return [
    comparisonRow({ key: "AVG", label: "AVG", current: results.AVG, reference: reference.AVG, accuracy: "direct" }),
    comparisonRow({ key: "OBP", label: "OBP", current: results.OBP, reference: reference.OBP, accuracy: "direct" }),
    comparisonRow({ key: "SLG", label: "SLG", current: results.SLG, reference: reference.SLG, accuracy: "direct" }),
    comparisonRow({ key: "OPS", label: "OPS", current: results.OPS, reference: reference.OPS, accuracy: "direct" }),
    comparisonRow({ key: "BBPct", label: "BB%", current: results.BBPct, reference: reference.BBPct, accuracy: "direct" }),
    comparisonRow({ key: "KPct", label: "K%", current: results.KPct, reference: reference.KPct, accuracy: "direct" }),
    comparisonRow({ key: "HRPct", label: "HR%", current: results.HRPct, reference: reference.HRPct, accuracy: "direct" }),
    comparisonRow({ key: "pitchesPerPA", label: "Pitches/PA", current: discipline.pitchesPerPA, reference: reference.pitchesPerPA, accuracy: "direct", format: "number" }),
    comparisonRow({ key: "zonePct", label: "Zone%", current: discipline.zonePct, reference: reference.zonePct, accuracy: "direct" }),
    comparisonRow({ key: "swingPct", label: "Swing%", current: discipline.swingPct, reference: reference.swingPct, accuracy: "direct" }),
    comparisonRow({ key: "zSwingPct", label: "Z-Swing%", current: discipline.zSwingPct, reference: reference.zSwingPct, accuracy: "direct" }),
    comparisonRow({ key: "zoneContactPct", label: "Z-Contact%", current: discipline.zoneContactPct, reference: reference.zoneContactPct, accuracy: "direct" }),
    comparisonRow({ key: "chasePct", label: "Chase%", current: discipline.chasePct, reference: reference.chasePct, accuracy: "direct" }),
    comparisonRow({ key: "chaseContactPct", label: "Chase Contact%", current: discipline.chaseContactPct, reference: reference.chaseContactPct, accuracy: "direct" }),
    comparisonRow({ key: "whiffPct", label: "Whiff%", current: discipline.whiffPct, reference: reference.whiffPct, accuracy: "direct" }),
    comparisonRow({ key: "firstPitchStrikePct", label: "First-pitch Strike%", current: discipline.firstPitchStrikePct, reference: reference.firstPitchStrikePct, accuracy: "direct" }),
    comparisonRow({ key: "contactPerPitch", label: "Contact/Pitch", current: contact.contactPerPitch, reference: derived.contactPerPitch, accuracy: "derived" }),
    comparisonRow({ key: "foulPerPitch", label: "Foul/Pitch", current: contact.foulPerPitch, reference: derived.foulPerPitch, accuracy: "derived" }),
    comparisonRow({ key: "fairBattedBallPerPitch", label: "BIP/Pitch", current: contact.fairBattedBallPerPitch, reference: derived.fairBattedBallPerPitch, accuracy: "derived" }),
    comparisonRow({ key: "foulPerContact", label: "Foul/Contact", current: contact.foulPerContact, reference: derived.foulPerContact, accuracy: "derived" }),
    comparisonRow({ key: "fairBattedBallPerContact", label: "Fair/Contact", current: contact.fairBattedBallPerContact, reference: derived.fairBattedBallPerContact, accuracy: "derived" }),
    comparisonRow({ key: "averageExitVelocity", label: "Average EV", current: profile.averageExitVelocity, reference: reference.averageExitVelocity, accuracy: "direct", format: "number" }),
    comparisonRow({ key: "averageLaunchAngle", label: "Average LA", current: profile.averageLaunchAngle, reference: reference.averageLaunchAngle, accuracy: "direct", format: "number" }),
    comparisonRow({ key: "hardHitPct", label: "HardHit%", current: profile.hardHitPct, reference: reference.hardHitPct, accuracy: "direct" }),
    comparisonRow({ key: "sweetSpotPct", label: "SweetSpot%", current: profile.sweetSpotPct, reference: reference.sweetSpotPct, accuracy: "direct" }),
    comparisonRow({ key: "GBPct", label: "GB%", current: profile.GBPct, reference: reference.GBPct, accuracy: "approximate", note: "Current result uses a launch-angle threshold classification." }),
    comparisonRow({ key: "LDPct", label: "LD%", current: profile.LDPct, reference: reference.LDPct, accuracy: "approximate", note: "Current result uses a launch-angle threshold classification." }),
    comparisonRow({ key: "FBPct", label: "FB%", current: profile.FBPct, reference: reference.FBPct, accuracy: "approximate", note: "Current result uses a launch-angle threshold classification." }),
    comparisonRow({ key: "PUPct", label: "PU%", current: profile.PUPct, reference: reference.PUPct, accuracy: "approximate", note: "Current result uses a launch-angle threshold classification." }),
    comparisonRow({ key: "officialBarrelPct", label: "Official Barrel%", current: null, reference: reference.officialBarrelPct, accuracy: "not_comparable", note: "Current QoC Barrel is not the official Statcast Barrel definition." }),
  ];
}
