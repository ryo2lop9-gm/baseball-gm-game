import { FIELD_GEOMETRY_CONFIG } from "../config/fieldGeometryConfig.js";
import { BATTED_BALL_DIRECTION_CONFIG } from "../config/battedBallDirectionConfig.js";
import { generateGeometryShadow } from "../services/defense/battedBallGeometryService.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const fieldSvg = document.getElementById("field-svg");
const form = document.getElementById("geometry-form");
const summary = document.getElementById("geometry-summary");
const errorOutput = document.getElementById("error-output");
const exitVelocityInput = document.getElementById("exit-velocity");
const launchAngleInput = document.getElementById("launch-angle");
const sprayAngleInput = document.getElementById("spray-angle");

function svgElement(name, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  if (text !== null) element.textContent = text;
  return element;
}

function appendSvg(name, attributes = {}, text = null) {
  const element = svgElement(name, attributes, text);
  fieldSvg.append(element);
  return element;
}

function drawLine(start, end, attributes = {}) {
  appendSvg("line", {
    x1: start.x,
    y1: -start.y,
    x2: end.x,
    y2: -end.y,
    ...attributes,
  });
}

function drawPoint(point, fill, radius = 3.5) {
  appendSvg("circle", {
    cx: point.x,
    cy: -point.y,
    r: radius,
    fill,
    stroke: "#122518",
    "stroke-width": 0.8,
  });
}

function drawLabel(point, text, dx = 5, dy = -5) {
  appendSvg(
    "text",
    {
      x: point.x + dx,
      y: -point.y + dy,
      fill: "#fff",
      "font-size": 8,
      "font-weight": 700,
      "paint-order": "stroke",
      stroke: "#174928",
      "stroke-width": 2,
    },
    text
  );
}

function renderField(geometry) {
  fieldSvg.replaceChildren();
  const fieldDepth = Math.max(
    330,
    geometry.trajectory.maxTravelDistanceFt + 35
  );
  const fieldHalfWidth = Math.max(190, fieldDepth * 0.62);
  fieldSvg.setAttribute(
    "viewBox",
    `${-fieldHalfWidth} ${-fieldDepth} ${fieldHalfWidth * 2} ${fieldDepth + 30}`
  );
  const home = FIELD_GEOMETRY_CONFIG.bases.home;
  const foulRadius = fieldDepth;
  for (const angle of [-45, 45]) {
    const radians = (angle * Math.PI) / 180;
    drawLine(
      home,
      {
        x: Math.sin(radians) * foulRadius,
        y: Math.cos(radians) * foulRadius,
      },
      { stroke: "#f6f0d6", "stroke-width": 1.5 }
    );
  }

  const baseOrder = ["home", "first", "second", "third"];
  const basePoints = baseOrder.map(
    (key) => FIELD_GEOMETRY_CONFIG.bases[key]
  );
  appendSvg("polygon", {
    points: basePoints
      .map((point) => `${point.x},${-point.y}`)
      .join(" "),
    fill: "rgba(185, 134, 73, 0.42)",
    stroke: "#f3dfba",
    "stroke-width": 1.25,
  });
  for (const [index, point] of basePoints.entries()) {
    drawPoint(point, "#f7f1df", index === 0 ? 3.2 : 4);
  }

  for (const position of FIELD_GEOMETRY_CONFIG.fielderPositionOrder) {
    const point = FIELD_GEOMETRY_CONFIG.fielderStartPoints[position];
    drawPoint(point, "#ffffff", 4);
    drawLabel(point, position);
  }

  const trajectory = geometry.trajectory;
  const trajectoryPoints =
    trajectory.trajectoryKind === "ground"
      ? [
          home,
          trajectory.firstGroundPoint,
          ...trajectory.motionSegments.slice(1).map((segment) => segment.endPoint),
        ]
      : [home, trajectory.landingPoint];
  appendSvg("polyline", {
    points: trajectoryPoints
      .map((point) => `${point.x},${-point.y}`)
      .join(" "),
    fill: "none",
    stroke: "#f4d35e",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": 3,
  });

  if (trajectory.firstGroundPoint) {
    drawPoint(trajectory.firstGroundPoint, "#ff7657", 4.2);
    drawLabel(trajectory.firstGroundPoint, "first ground", 6, -6);
  }
  if (trajectory.stopPoint) {
    drawPoint(trajectory.stopPoint, "#ff7657", 4.2);
    drawLabel(trajectory.stopPoint, "stop", 6, 10);
  } else {
    drawPoint(trajectory.landingPoint, "#f4d35e", 4.2);
    drawLabel(trajectory.landingPoint, "landing", 6, -6);
  }

  for (const candidate of geometry.fielderCandidates) {
    drawLine(candidate.startPoint, candidate.targetPoint, {
      stroke: "#66c7ff",
      "stroke-dasharray": "3 3",
      "stroke-opacity": 0.5,
      "stroke-width": 0.8,
    });
    drawPoint(candidate.targetPoint, "#66c7ff", 2.25);
  }
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function renderSummary(geometry) {
  const trajectory = geometry.trajectory;
  const rows = [
    ["trajectoryClass", geometry.trajectoryClass],
    ["trajectoryKind", geometry.trajectoryKind],
    ["distance", `${formatNumber(trajectory.radialDistanceFt)} ft`],
    [
      "hang / stop time",
      `${formatNumber(
        trajectory.hangTimeSec ?? trajectory.stopTimeSec
      )} sec`,
    ],
    ["model", geometry.model],
    ["source", geometry.source],
    ["candidates", geometry.fielderCandidates.length],
    ["geometry RNG", geometry.geometryRngCalls],
  ];
  summary.replaceChildren(
    ...rows.map(([label, value]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "summary-row";
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      wrapper.append(term, description);
      return wrapper;
    })
  );
}

function render() {
  errorOutput.textContent = "";
  try {
    const exitVelocity = Number(exitVelocityInput.value);
    const launchAngle = Number(launchAngleInput.value);
    const sprayAngle = Number(sprayAngleInput.value);
    const geometry = generateGeometryShadow({
      mode: FIELD_GEOMETRY_CONFIG.shadowMode,
      battedBallEventId: "geometry-debugger:event:1",
      exitVelocity,
      launchAngle,
      directionShadow: {
        mode: BATTED_BALL_DIRECTION_CONFIG.shadowMode,
        model: BATTED_BALL_DIRECTION_CONFIG.model,
        sprayAngle,
      },
    });
    renderField(geometry);
    renderSummary(geometry);
  } catch (error) {
    errorOutput.textContent = `${error.code || "ERROR"}: ${error.message}`;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
});

render();
