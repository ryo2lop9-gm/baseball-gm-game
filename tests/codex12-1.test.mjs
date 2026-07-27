import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_STRIKE_ZONE,
  classifyPitchLocation,
} from "../services/pitchLocationService.js";

const DEFAULT_CENTER = Object.freeze({
  x: (DEFAULT_STRIKE_ZONE.xMin + DEFAULT_STRIKE_ZONE.xMax) / 2,
  z: (DEFAULT_STRIKE_ZONE.zMin + DEFAULT_STRIKE_ZONE.zMax) / 2,
});
const DEFAULT_HALF_WIDTH =
  (DEFAULT_STRIKE_ZONE.xMax - DEFAULT_STRIKE_ZONE.xMin) / 2;

function pointAtNormalizedRadius(normalizedRadius) {
  return {
    x: DEFAULT_CENTER.x + DEFAULT_HALF_WIDTH * normalizedRadius,
    z: DEFAULT_CENTER.z,
  };
}

test("center is Zone, Heart, Meatball, center cell, and course C", () => {
  const result = classifyPitchLocation(DEFAULT_CENTER);

  assert.deepEqual(result.actualPoint, DEFAULT_CENTER);
  assert.equal(result.normalizedX, 0);
  assert.equal(result.normalizedZ, 0);
  assert.equal(result.normalizedRadius, 0);
  assert.equal(result.normalizedZoneEdgeDistance, -1);
  assert.equal(result.actualIsZone, true);
  assert.equal(result.attackRegion, "HEART");
  assert.equal(result.attackRegionDetail, "HEART");
  assert.equal(result.shadowSide, null);
  assert.equal(result.isMeatball, true);
  assert.equal(result.zoneRow, 2);
  assert.equal(result.zoneCol, 2);
  assert.equal(result.locationCourse, "C");
});

test("normalizedRadius 2/3 is Heart", () => {
  const result = classifyPitchLocation(pointAtNormalizedRadius(2 / 3));

  assert.equal(result.normalizedRadius, 2 / 3);
  assert.equal(result.attackRegion, "HEART");
  assert.equal(result.attackRegionDetail, "HEART");
  assert.equal(result.isMeatball, false);
});

test("immediately inside the zone edge is Shadow-In", () => {
  const result = classifyPitchLocation(pointAtNormalizedRadius(1 - 1e-9));

  assert.equal(result.actualIsZone, true);
  assert.equal(result.attackRegion, "SHADOW");
  assert.equal(result.attackRegionDetail, "SHADOW_IN");
  assert.equal(result.shadowSide, "IN");
  assert.ok(result.normalizedZoneEdgeDistance < 0);
});

test("the zone boundary is Zone and Shadow-In", () => {
  const result = classifyPitchLocation({
    x: DEFAULT_STRIKE_ZONE.xMax,
    z: DEFAULT_CENTER.z,
  });

  assert.equal(result.normalizedRadius, 1);
  assert.equal(result.normalizedZoneEdgeDistance, 0);
  assert.equal(result.actualIsZone, true);
  assert.equal(result.attackRegionDetail, "SHADOW_IN");
  assert.equal(result.shadowSide, "IN");
});

test("immediately outside the zone edge is Shadow-Out", () => {
  const result = classifyPitchLocation(pointAtNormalizedRadius(1 + 1e-9));

  assert.equal(result.actualIsZone, false);
  assert.equal(result.attackRegion, "SHADOW");
  assert.equal(result.attackRegionDetail, "SHADOW_OUT");
  assert.equal(result.shadowSide, "OUT");
  assert.ok(result.normalizedZoneEdgeDistance > 0);
});

test("normalizedRadius 4/3 is Shadow-Out", () => {
  const result = classifyPitchLocation(pointAtNormalizedRadius(4 / 3));

  assert.equal(result.normalizedRadius, 4 / 3);
  assert.equal(result.attackRegion, "SHADOW");
  assert.equal(result.attackRegionDetail, "SHADOW_OUT");
  assert.equal(result.shadowSide, "OUT");
});

test("above 4/3 through 2 is Chase", () => {
  for (const normalizedRadius of [4 / 3 + 1e-9, 2]) {
    const result = classifyPitchLocation(
      pointAtNormalizedRadius(normalizedRadius)
    );
    assert.equal(result.attackRegion, "CHASE");
    assert.equal(result.attackRegionDetail, "CHASE");
    assert.equal(result.shadowSide, null);
  }
});

test("above normalizedRadius 2 is Waste", () => {
  const result = classifyPitchLocation(pointAtNormalizedRadius(2 + 1e-9));

  assert.equal(result.attackRegion, "WASTE");
  assert.equal(result.attackRegionDetail, "WASTE");
  assert.equal(result.shadowSide, null);
});

test("legacy rows and columns map the four sides and four outer corners", () => {
  const { xMin, xMax, zMin, zMax } = DEFAULT_STRIKE_ZONE;
  const pointsByCell = [
    [{ x: DEFAULT_CENTER.x, z: zMax + 0.1 }, [0, 2]],
    [{ x: DEFAULT_CENTER.x, z: zMin - 0.1 }, [4, 2]],
    [{ x: xMin - 0.1, z: DEFAULT_CENTER.z }, [2, 0]],
    [{ x: xMax + 0.1, z: DEFAULT_CENTER.z }, [2, 4]],
    [{ x: xMin - 0.1, z: zMax + 0.1 }, [0, 0]],
    [{ x: xMax + 0.1, z: zMax + 0.1 }, [0, 4]],
    [{ x: xMin - 0.1, z: zMin - 0.1 }, [4, 0]],
    [{ x: xMax + 0.1, z: zMin - 0.1 }, [4, 4]],
  ];

  for (const [actualPoint, expectedCell] of pointsByCell) {
    const result = classifyPitchLocation(actualPoint);
    assert.deepEqual([result.zoneRow, result.zoneCol], expectedCell);
    assert.equal(result.locationCourse, "Ball");
  }
});

test("legacy in-zone cells preserve A, B, and C course grades", () => {
  const pointsByCourse = [
    [{ x: -0.5, z: 3.1 }, [1, 1], "A"],
    [{ x: 0, z: 3.1 }, [1, 2], "B"],
    [DEFAULT_CENTER, [2, 2], "C"],
  ];

  for (const [actualPoint, expectedCell, expectedCourse] of pointsByCourse) {
    const result = classifyPitchLocation(actualPoint);
    assert.deepEqual([result.zoneRow, result.zoneCol], expectedCell);
    assert.equal(result.locationCourse, expectedCourse);
  }
});

test("the default zone is 20 inches wide and 24 inches tall", () => {
  const widthInches =
    (DEFAULT_STRIKE_ZONE.xMax - DEFAULT_STRIKE_ZONE.xMin) * 12;
  const heightInches =
    (DEFAULT_STRIKE_ZONE.zMax - DEFAULT_STRIKE_ZONE.zMin) * 12;

  assert.equal(widthInches, 20);
  assert.equal(heightInches, 24);
});

test("non-finite coordinates and invalid zone bounds are rejected", () => {
  assert.throws(
    () => classifyPitchLocation({ x: Number.NaN, z: 2.5 }),
    /actualPoint\.x must be a finite number/
  );
  assert.throws(
    () => classifyPitchLocation({ x: 0, z: Number.POSITIVE_INFINITY }),
    /actualPoint\.z must be a finite number/
  );
  assert.throws(
    () => classifyPitchLocation({ x: 0, z: 2.5 }, {
      xMin: Number.NEGATIVE_INFINITY,
      xMax: 1,
      zMin: 1,
      zMax: 4,
    }),
    /zoneBounds\.xMin must be a finite number/
  );
  assert.throws(
    () => classifyPitchLocation({ x: 0, z: 2.5 }, {
      xMin: 1,
      xMax: 1,
      zMin: 1,
      zMax: 4,
    }),
    /zoneBounds\.xMin must be less than zoneBounds\.xMax/
  );
  assert.throws(
    () => classifyPitchLocation({ x: 0, z: 2.5 }, {
      xMin: -1,
      xMax: 1,
      zMin: 4,
      zMax: 1,
    }),
    /zoneBounds\.zMin must be less than zoneBounds\.zMax/
  );
});

test("custom zone bounds use the same normalization and classifications", () => {
  const customZone = { xMin: 10, xMax: 14, zMin: 20, zMax: 28 };
  const result = classifyPitchLocation({ x: 13, z: 22 }, customZone);

  assert.equal(result.normalizedX, 0.5);
  assert.equal(result.normalizedZ, -0.5);
  assert.equal(result.normalizedRadius, 0.5);
  assert.equal(result.normalizedZoneEdgeDistance, -0.5);
  assert.equal(result.actualIsZone, true);
  assert.equal(result.attackRegionDetail, "HEART");
  assert.equal(result.zoneRow, 3);
  assert.equal(result.zoneCol, 3);
  assert.equal(result.locationCourse, "A");
});
