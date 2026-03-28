export const QOC_KEYS = ["Weak", "Topped", "Under", "Flare", "Solid", "Barrel"];

export const QOC_WEIGHTS_BY_COURSE = {
  A: { Weak: 0.09, Topped: 0.34, Under: 0.28, Flare: 0.20, Solid: 0.06, Barrel: 0.03 },
  B: { Weak: 0.05, Topped: 0.31, Under: 0.24, Flare: 0.25, Solid: 0.08, Barrel: 0.07 },
  C: { Weak: 0.03, Topped: 0.23, Under: 0.19, Flare: 0.28, Solid: 0.12, Barrel: 0.15 },
  Default: { Weak: 0.06, Topped: 0.30, Under: 0.23, Flare: 0.25, Solid: 0.08, Barrel: 0.08 },
};

export function getQoCWeightsByCourse(course) {
  return QOC_WEIGHTS_BY_COURSE[course] || QOC_WEIGHTS_BY_COURSE.Default;
}