export const VELOCITY_BANDS = [
  {
    id: "under80",
    label: "〜79mph",
    min: 0,
    max: 79.999,
  },
  {
    id: "80_84",
    label: "80〜84mph",
    min: 80,
    max: 84.999,
  },
  {
    id: "85_89",
    label: "85〜89mph",
    min: 85,
    max: 89.999,
  },
  {
    id: "90_94",
    label: "90〜94mph",
    min: 90,
    max: 94.999,
  },
  {
    id: "95_99",
    label: "95〜99mph",
    min: 95,
    max: 99.999,
  },
  {
    id: "100plus",
    label: "100mph〜",
    min: 100,
    max: Number.POSITIVE_INFINITY,
  },
];

export function getVelocityBandByVelocity(velocity) {
  const value = Number(velocity);
  if (!Number.isFinite(value)) return null;

  return (
    VELOCITY_BANDS.find((band) => value >= band.min && value <= band.max) || null
  );
}
