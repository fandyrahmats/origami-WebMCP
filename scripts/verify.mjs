/**
 * Engine, scene, store, and WebMCP checks. Runs in Node against the compiled
 * output in .verify-dist. Modules under test may use Three.js, but must not need
 * a browser DOM at import time.
 *
 *   npm run verify
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";

import { legalCreases, planFor } from "../.verify-dist/src/engine/creases.js";
import { describeSheet } from "../.verify-dist/src/engine/describe.js";
import { foldSheet, previewFold } from "../.verify-dist/src/engine/fold.js";
import {
  polygonArea,
  reflectPoint,
} from "../.verify-dist/src/engine/geometry.js";
import { MODELS } from "../.verify-dist/src/engine/models.js";
import { maxOverlapDepth } from "../.verify-dist/src/engine/overlap.js";
import { replayModel, progressFor } from "../.verify-dist/src/engine/progress.js";
import {
  MAX_LAYERS,
  createSquareSheet,
  layerCount,
  sheetSignature,
} from "../.verify-dist/src/engine/sheet.js";
import { foldTopology } from "../.verify-dist/src/engine/topology.js";
import { createFoldQueue } from "../.verify-dist/src/scene/animate.js";
import { createCreasePicker } from "../.verify-dist/src/scene/creasePicker.js";
import {
  displayFrameRadius,
  frameForSheet,
  framingDistance,
} from "../.verify-dist/src/scene/framing.js";
import {
  createCurlGeometry,
  createPaperGeometry,
  deformCurl,
} from "../.verify-dist/src/scene/paperGeometry.js";
import { createPresentationCoordinator } from "../.verify-dist/src/scene/presentation.js";
import { createSheetView } from "../.verify-dist/src/scene/sheetMesh.js";
import { SUMMARY_LIMIT } from "../.verify-dist/src/lib/format.js";
import { createStore } from "../.verify-dist/src/store.js";
import { createConsole } from "../.verify-dist/src/ui/console.js";
import { createControls } from "../.verify-dist/src/ui/controls.js";
import { createMarquee } from "../.verify-dist/src/ui/marquee.js";
import { formatReply } from "../.verify-dist/src/webmcp/client.js";
import {
  CONTRACTS,
  TEXT_PARAMETER_LIMIT,
  assertBudgets,
} from "../.verify-dist/src/webmcp/contracts/index.js";
import { HANDLERS } from "../.verify-dist/src/webmcp/handlers/index.js";
import { registerTools } from "../.verify-dist/src/webmcp/runtime.js";

const pass = [];
const note = (message) => pass.push(message);
const area = (sheet) =>
  sheet.facets.reduce((total, facet) => total + polygonArea(facet.polygon), 0);
const materialArea = (sheet) =>
  sheet.facets.reduce(
    (total, facet) => total + polygonArea(facet.materialPolygon),
    0,
  );
const targetHashes = {
  triangle: "e5a9be3e78b3cc15",
  book: "794a071e706868e9",
  "corner-tuck": "ad806d8956bf5394",
  "small-square": "a4f762835b8f011c",
  "diagonal-packet": "41607b9a555c4688",
  "letter-fold": "bbd2645b756266e7",
  "three-corner": "f0e460f6f073e1a9",
  blintz: "1d1da601ef34853e",
  "four-fold-packet": "deb1df776311d5a9",
  "nine-panel-packet": "944ec4c9eb8f0da2",
  "eight-fold-packet": "1632260e13bc25b5",
};
const signatureHash = (sheet) =>
  createHash("sha256").update(sheetSignature(sheet)).digest("hex").slice(0, 16);

const assertSheetInvariants = (sheet, label) => {
  const ids = sheet.facets.map((facet) => facet.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate facet id`);
  assert.ok(sheet.facets.length <= 128, `${label}: facet policy cap exceeded`);

  const layers = [...new Set(sheet.facets.map((facet) => facet.layer))].sort(
    (left, right) => left - right,
  );
  assert.deepEqual(
    layers,
    Array.from({ length: layers.length }, (_, index) => index),
    `${label}: layers are not a dense ordering`,
  );

  for (const facet of sheet.facets) {
    assert.equal(
      facet.polygon.length,
      facet.materialPolygon.length,
      `${label}/${facet.id}: world/material vertices lost pairing`,
    );
    assert.ok(facet.polygon.length >= 3, `${label}/${facet.id}: invalid polygon`);
    assert.ok(Number.isInteger(facet.layer) && facet.layer >= 0);
    assert.equal(typeof facet.faceUp, "boolean");

    for (const vertex of [...facet.polygon, ...facet.materialPolygon]) {
      assert.ok(
        Number.isFinite(vertex.x) && Number.isFinite(vertex.z),
        `${label}/${facet.id}: non-finite coordinate`,
      );
    }
    for (const vertex of facet.materialPolygon) {
      assert.ok(
        Math.abs(vertex.x) <= 0.500001 && Math.abs(vertex.z) <= 0.500001,
        `${label}/${facet.id}: material coordinate left the source square`,
      );
    }

    assert.ok(
      Math.abs(
        polygonArea(facet.polygon) - polygonArea(facet.materialPolygon),
      ) < 1e-8,
      `${label}/${facet.id}: rigid fragment changed area`,
    );
  }

  assert.ok(Math.abs(area(sheet) - 1) < 1e-8, `${label}: world area drifted`);
  const overlap = maxOverlapDepth(sheet);
  assert.ok(overlap >= 1, `${label}: overlap depth vanished`);
  assert.ok(
    overlap <= layerCount(sheet),
    `${label}: local overlap exceeds layer-order ranks`,
  );
  assert.ok(
    Math.abs(materialArea(sheet) - 1) < 1e-8,
    `${label}: material fragments no longer partition one square`,
  );
};

// --- Engine -------------------------------------------------------------

const fresh = createSquareSheet();
assert.equal(fresh.facets.length, 1);
assert.equal(fresh.foldCount, 0);
assert.ok(Math.abs(area(fresh) - 1) < 1e-12);
note(`fresh sheet area: ${area(fresh).toFixed(6)}`);

assert.equal(legalCreases(fresh).length, 20);
note(`legal creases on a fresh square: ${legalCreases(fresh).length}`);

const diagonal = foldSheet(fresh, { creaseId: "diag-a", type: "valley" });
assert.equal(diagonal.ok, true);
assert.equal(fresh.foldCount, 0, "the input sheet must stay immutable");
assert.equal(diagonal.sheet.facets.length, 2);
assert.equal(layerCount(diagonal.sheet), 2);
assert.ok(Math.abs(area(diagonal.sheet) - 1) < 1e-12);
note("diagonal valley: 2 facets, 2 layers, area conserved");

// A fold flips the face that shows, which is what distinguishes valley from
// mountain to the eye.
const moved = diagonal.sheet.facets.find((facet) => facet.layer === 1);
assert.equal(moved.faceUp, false);
note("moved facet turned its back face up");

// The paper cannot be folded along a line it no longer crosses.
const reFold = foldSheet(diagonal.sheet, { creaseId: "diag-a", type: "valley" });
assert.equal(reFold.ok, false);
assert.match(reFold.reason, /not foldable/);
note("refolding a spent crease is refused with a reason");

const unknown = foldSheet(fresh, { creaseId: "nope", type: "valley" });
assert.equal(unknown.ok, false);
assert.match(unknown.reason, /Legal creases: /);
note("unknown crease refusal names the legal ids");

const badType = foldSheet(fresh, { creaseId: "diag-a", type: "diagonal" });
assert.equal(badType.ok, false);
note("an invalid fold type is refused by the engine, not trusted");

// Determinism: the same state and request always produce the same result.
const twiceA = foldSheet(createSquareSheet(), { creaseId: "mid-v", type: "valley" });
const twiceB = foldSheet(createSquareSheet(), { creaseId: "mid-v", type: "valley" });
assert.equal(sheetSignature(twiceA.sheet), sheetSignature(twiceB.sheet));
note("identical requests produce identical states");

// Valley and mountain sweep opposite ways about the same axis.
const asMountain = foldSheet(fresh, { creaseId: "diag-a", type: "mountain" });
assert.equal(asMountain.ok, true);
assert.equal(
  Math.sign(asMountain.fold.angleRadians),
  -Math.sign(diagonal.fold.angleRadians),
);
note("valley and mountain rotate in opposite directions");

// --- Fold preview -------------------------------------------------------
// The preview is what tells a person which flap moves before they commit. If it
// disagreed with the fold it describes, the interface would be actively lying,
// so it is checked against the real thing rather than merely for plausibility.

assert.equal(previewFold(fresh, "not-a-crease"), null);
note("previewFold returns null for a crease that is not foldable");

const beforePreview = sheetSignature(fresh);
const preview = previewFold(fresh, "blintz-ne");
assert.equal(sheetSignature(fresh), beforePreview);
note("asking for a preview does not change the sheet");

assert.equal(preview.creaseId, "blintz-ne");
assert.equal(preview.from.length, preview.to.length);
assert.equal(preview.movingFacets, preview.from.length);
assert.equal(preview.totalFacets, fresh.facets.length);

const fromArea = preview.from.reduce((sum, p) => sum + polygonArea(p.polygon), 0);
const toArea = preview.to.reduce((sum, p) => sum + polygonArea(p.polygon), 0);
assert.ok(Math.abs(fromArea - toArea) < 1e-12);
note(`preview flap area matches its destination: ${fromArea.toFixed(6)}`);

// A folded flap shows its other face; the preview has to say the same.
assert.equal(preview.from[0].faceUp, true);
assert.equal(preview.to[0].faceUp, false);
note("the preview destination shows the face the fold would reveal");

// The real proof: the flap the preview draws is the flap the fold actually moves.
for (const creaseId of ["blintz-ne", "diag-a", "mid-v", "quarter-e"]) {
  const shown = previewFold(fresh, creaseId);
  const done = foldSheet(fresh, { creaseId, type: "valley" });
  assert.equal(done.ok, true);
  assert.equal(
    shown.from.length,
    done.fold.movingPieces.length,
    `preview and fold disagree on piece count for ${creaseId}`,
  );

  for (let index = 0; index < shown.from.length; index += 1) {
    assert.deepEqual(
      shown.from[index].polygon,
      done.fold.movingPieces[index].polygon,
      `preview geometry differs from the applied fold for ${creaseId}`,
    );
  }
}
note("preview geometry is identical to what the fold moves, across 4 creases");

// On a stack, the preview must account for every layer the fold carries.
const stacked = foldSheet(fresh, { creaseId: "diag-a", type: "valley" }).sheet;
const stackedPreview = previewFold(stacked, "mid-h");
const stackedFold = foldSheet(stacked, { creaseId: "mid-h", type: "valley" });
assert.equal(stackedPreview.from.length, stackedFold.fold.movingPieces.length);
assert.ok(stackedPreview.from.length > 1);
note(
  `on a ${stacked.facets.length}-region sheet the preview reports all ${stackedPreview.from.length} moving pieces`,
);

// --- Authored models ----------------------------------------------------

assert.equal(new Set(MODELS.map((model) => model.id)).size, MODELS.length);
assert.equal(new Set(MODELS.map((model) => model.glyph)).size, MODELS.length);
assert.deepEqual(
  new Set(MODELS.map((model) => model.difficulty)),
  new Set(["starter", "easy", "medium"]),
);
assert.deepEqual(
  new Set(Object.keys(targetHashes)),
  new Set(MODELS.map((model) => model.id)),
);
note("catalogue ids, glyphs, tiers, and target fixtures are unique and complete");

for (const model of MODELS) {
  assert.ok(model.steps.length > 0, `model ${model.id} has no steps`);
  const states = replayModel(model);
  assert.equal(
    states.length,
    model.steps.length + 1,
    `model ${model.id} stops applying at step ${states.length}`,
  );
  const signatures = states.map(sheetSignature);
  assert.equal(
    new Set(signatures).size,
    signatures.length,
    `model ${model.id} repeats a state and makes progress ambiguous`,
  );

  states.forEach((state, index) => {
    assertSheetInvariants(state, `${model.id}/state-${index}`);
    assert.ok(layerCount(state) <= MAX_LAYERS);
    const measured = progressFor(model, state);
    assert.equal(measured.onPath, true);
    assert.equal(measured.completed, index);
    assert.deepEqual(measured.nextStep, model.steps[index] ?? null);
  });

  for (let index = 0; index < model.steps.length; index += 1) {
    const from = states[index];
    const expected = states[index + 1];
    const step = model.steps[index];
    assert.ok(from && expected && step);
    assert.ok(step.note.trim().length > 0, `${model.id}/${index}: empty note`);
    assert.ok(
      legalCreases(from).some((crease) => crease.id === step.creaseId),
      `${model.id}/${index}: ${step.creaseId} is not legal`,
    );

    const plan = planFor(from, step.creaseId);
    assert.ok(plan, `${model.id}/${index}: missing crease plan`);
    const topology = foldTopology(from, plan.line);
    const connected =
      plan.movingSign === 1
        ? topology.positive.fragments
        : topology.negative.fragments;
    const shown = previewFold(from, step.creaseId);
    const applied = foldSheet(from, step);
    assert.ok(shown && applied.ok);
    assert.equal(sheetSignature(applied.sheet), sheetSignature(expected));
    assert.equal(applied.fold.movedFacetIds.length, connected.length);

    const moved = applied.fold.movedFacetIds.map((id) =>
      applied.sheet.facets.find((facet) => facet.id === id),
    );
    moved.forEach((facet, movedIndex) => {
      assert.ok(facet, `${model.id}/${index}: moved facet id is missing`);
      assert.deepEqual(
        facet.materialPolygon,
        connected[movedIndex]?.materialPolygon,
        `${model.id}/${index}: a material polygon reflected or changed`,
      );
      assert.deepEqual(
        facet.polygon,
        shown.to[movedIndex]?.polygon,
        `${model.id}/${index}: preview destination differs from applied geometry`,
      );
    });
  }

  const finished = states[states.length - 1];
  assert.equal(
    signatureHash(finished),
    targetHashes[model.id],
    `model ${model.id} no longer reaches its approved target geometry`,
  );
}
note(
  `all ${MODELS.length} authored models preserve paired topology at every legal step`,
);
note("every authored target matches its approved deterministic geometry hash");

const targetDepth = (modelId) => {
  const model = MODELS.find((entry) => entry.id === modelId);
  assert.ok(model);
  const final = replayModel(model).at(-1);
  assert.ok(final);
  return maxOverlapDepth(final);
};
assert.equal(targetDepth("small-square"), 4);
assert.equal(targetDepth("blintz"), 2);
assert.equal(targetDepth("eight-fold-packet"), 4);
note("STACK reports local paper overlap, not global painter-order ranks");

// Progress is measured, so a hand fold off the sequence is reported honestly.
const blintz = MODELS.find((model) => model.id === "blintz");
const partway = replayModel(blintz)[2];
const onPath = progressFor(blintz, partway);
assert.equal(onPath.onPath, true);
assert.equal(onPath.completed, 2);

const diverged = foldSheet(partway, { creaseId: "mid-v", type: "valley" });
assert.equal(diverged.ok, true);
const offPath = progressFor(blintz, diverged.sheet);
assert.equal(offPath.onPath, false);
note("a fold off the sequence sets onPath false instead of guessing");

// A projected island on the moving half-plane must stay still when its source
// material does not connect to the crease. This is the regression that used to
// make overlapped models tear into detached plates.
const rectangle = (minX, maxX, minZ, maxZ) => [
  { x: minX, z: minZ },
  { x: maxX, z: minZ },
  { x: maxX, z: maxZ },
  { x: minX, z: maxZ },
];
const hingePolygon = rectangle(-0.2, 0.2, -0.2, 0.2);
const westPolygon = rectangle(-0.5, -0.4, 0.3, 0.4);
const eastPolygon = rectangle(0.4, 0.5, -0.4, -0.3);
const disconnected = {
  facets: [
    {
      id: "hinge",
      layer: 0,
      polygon: hingePolygon,
      materialPolygon: hingePolygon,
      faceUp: true,
    },
    {
      id: "west-island",
      layer: 1,
      polygon: westPolygon,
      materialPolygon: rectangle(-0.5, -0.4, 0.4, 0.5),
      faceUp: true,
    },
    {
      id: "east-island",
      layer: 2,
      polygon: eastPolygon,
      materialPolygon: rectangle(0.4, 0.5, -0.5, -0.4),
      faceUp: true,
    },
  ],
  pattern: [],
  foldCount: 0,
  flipped: false,
};
const vertical = {
  start: { x: 0, z: -0.5 },
  end: { x: 0, z: 0.5 },
};
const disconnectedTopology = foldTopology(disconnected, vertical);
assert.equal(
  disconnectedTopology.all.filter((fragment) => fragment.side === 1).length,
  2,
);
assert.equal(disconnectedTopology.positive.fragments.length, 1);
const connectedOnly = foldSheet(disconnected, {
  creaseId: "mid-v",
  type: "valley",
});
assert.equal(connectedOnly.ok, true);
assert.equal(connectedOnly.fold.movingPieces.length, 1);
const stationaryIsland = connectedOnly.sheet.facets.find((facet) =>
  facet.materialPolygon.every((vertex) => vertex.x <= -0.4),
);
assert.ok(stationaryIsland);
assert.deepEqual(stationaryIsland.polygon, westPolygon);
note("a disconnected material island is never carried by a projected fold");

// --- Rendering geometry ------------------------------------------------

let smallestDisplayRatio = 1;
for (const model of MODELS) {
  for (const state of replayModel(model)) {
    const frame = frameForSheet(state);
    const displayRadius = displayFrameRadius(frame.radius);
    smallestDisplayRatio = Math.min(
      smallestDisplayRatio,
      frame.radius / displayRadius,
    );
    for (const facet of state.facets) {
      for (const vertex of facet.polygon) {
        assert.ok(
          Math.hypot(vertex.x - frame.centerX, vertex.z - frame.centerZ) <=
            frame.radius + 1e-9,
          `${model.id}: framing centre misses a paper vertex`,
        );
      }
    }
    for (const aspect of [16 / 9, 9 / 16]) {
      const distance = framingDistance(displayRadius, aspect, 1);
      const halfHeight = distance * Math.tan((34 * Math.PI) / 360);
      const halfWidth = halfHeight * aspect;
      assert.ok(
        Math.min(halfWidth, halfHeight) > frame.radius * 1.1,
        `${model.id}: framing margin crops aspect ${aspect}`,
      );
    }
  }
}
assert.ok(smallestDisplayRatio >= 0.5);
const packetFrame = frameForSheet(
  replayModel(MODELS.find((model) => model.id === "eight-fold-packet")).at(-1),
);
assert.ok(packetFrame.radius / displayFrameRadius(packetFrame.radius) < 0.8);
note(
  `camera centres every silhouette without hiding compaction; minimum display ratio ${smallestDisplayRatio.toFixed(3)}`,
);

const freshPolygon = fresh.facets[0].polygon;
for (const [faceUp, expectedSign] of [
  [true, 1],
  [false, -1],
]) {
  const geometry = createPaperGeometry(freshPolygon, faceUp);
  const normals = geometry.getAttribute("normal").array;
  for (let index = 1; index < normals.length; index += 3) {
    assert.ok(
      normals[index] * expectedSign > 0.99,
      `faceUp ${faceUp} points toward the wrong material side`,
    );
  }
  geometry.dispose();
}
note("paper face orientation agrees with the engine faceUp flag");

const renderModel = MODELS.find((model) => model.id === "eight-fold-packet");
assert.ok(renderModel);
const renderSheet = replayModel(renderModel).at(-1);
assert.ok(renderSheet);
const renderCreases = legalCreases(renderSheet);
assert.ok(renderCreases.length > 0);
const sheetView = createSheetView();
sheetView.update(renderSheet, renderCreases, []);
const creaseLines = renderCreases.map((crease) => {
  const line = sheetView.creaseLineFor(crease.id);
  assert.ok(line, `missing rendered crease ${crease.id}`);
  assert.equal(line.userData.creaseId, crease.id);
  assert.equal(typeof line.raycast, "function");
  return line;
});
assert.equal(sheetView.creaseGroup.children.length, renderCreases.length);
const assertCreaseOpacity = (expected) => {
  for (const line of creaseLines) {
    assert.ok(line.material instanceof THREE.LineBasicMaterial);
    assert.equal(line.material.opacity, expected);
    assert.equal(line.userData.restingOpacity, expected);
  }
};
assertCreaseOpacity(0.22);
sheetView.setCreaseMode("complete");
assert.equal(sheetView.creaseGroup.children.length, renderCreases.length);
assertCreaseOpacity(0.06);
renderCreases.forEach((crease, index) => {
  assert.equal(sheetView.creaseLineFor(crease.id), creaseLines[index]);
});
sheetView.setCreaseMode("active");
assertCreaseOpacity(0.22);
note("completed targets dim every crease without removing its pickable line");

const staticMeshes = [];
sheetView.root.traverse((node) => {
  if (node.isMesh) staticMeshes.push(node);
});
assert.equal(staticMeshes.length, renderSheet.facets.length * 2);
for (const mesh of staticMeshes) {
  assert.equal(mesh.position.y, 0, "final facet received visible layer height");
  const positions = mesh.geometry.getAttribute("position").array;
  for (let index = 1; index < positions.length; index += 3) {
    assert.equal(positions[index], 0, "paper geometry is not planar at rest");
  }
}
assert.equal(
  new Set(staticMeshes.map((mesh) => mesh.renderOrder)).size,
  layerCount(renderSheet),
  "render order no longer represents the explicit layer ordering",
);
sheetView.dispose();
note("final facets share one mathematical surface and composite by render order");

const curlFold = foldSheet(fresh, {
  creaseId: "blintz-ne",
  type: "valley",
});
assert.equal(curlFold.ok, true);
const curlPiece = curlFold.fold.movingPieces[0];
assert.ok(curlPiece);
const curl = createCurlGeometry(
  curlPiece.polygon,
  curlPiece.faceUp,
  curlFold.fold.axisStart,
  curlFold.fold.axisEnd,
);
const curlPositions = curl.geometry.getAttribute("position").array;
const sourcePositions = Float32Array.from(curlPositions);
deformCurl(
  curl,
  curlFold.fold.axisStart,
  curlFold.fold.axisEnd,
  0,
  0,
);
for (let index = 0; index < curlPositions.length; index += 1) {
  assert.ok(Math.abs(curlPositions[index] - sourcePositions[index]) < 1e-7);
}
deformCurl(
  curl,
  curlFold.fold.axisStart,
  curlFold.fold.axisEnd,
  curlFold.fold.angleRadians / 2,
  0.5,
);
let curlHeight = 0;
for (let index = 1; index < curlPositions.length; index += 3) {
  curlHeight = Math.max(curlHeight, Math.abs(curlPositions[index]));
}
assert.ok(curlHeight > 0.01, "mid-fold geometry stayed rigidly flat");
deformCurl(
  curl,
  curlFold.fold.axisStart,
  curlFold.fold.axisEnd,
  curlFold.fold.angleRadians,
  1,
);
for (let index = 0; index < sourcePositions.length; index += 3) {
  const reflected = reflectPoint(
    { x: sourcePositions[index], z: sourcePositions[index + 2] },
    { start: curlFold.fold.axisStart, end: curlFold.fold.axisEnd },
  );
  assert.ok(Math.abs(curlPositions[index] - reflected.x) < 1e-5);
  assert.ok(Math.abs(curlPositions[index + 1]) < 1e-5);
  assert.ok(Math.abs(curlPositions[index + 2] - reflected.z) < 1e-5);
}
const curlNormals = curl.geometry.getAttribute("normal").array;
assert.ok([...curlPositions, ...curlNormals].every(Number.isFinite));
curl.geometry.dispose();
note("curl starts at source, bends above the hinge, and ends at engine reflection");

const paintedSheets = [];
const queueView = {
  update: (sheet) => paintedSheets.push(sheetSignature(sheet)),
  prepareFold: () => undefined,
  deformFold: () => undefined,
  clearMovingPieces: () => undefined,
};
const queue = createFoldQueue(queueView);
queue.push(curlFold.fold, curlFold.sheet, legalCreases(curlFold.sheet));
assert.equal(queue.busy, true);
queue.settle(fresh, legalCreases(fresh));
queue.update(performance.now() + 1_000);
assert.equal(paintedSheets.at(-1), sheetSignature(fresh));
assert.equal(queue.busy, false);
note("undo or reset supersedes an obsolete in-flight fold animation");

const queueModel = MODELS.find((model) => model.id === "blintz");
assert.ok(queueModel);
const queueJobs = [];
let queueSheet = fresh;
for (const step of queueModel.steps.slice(0, 3)) {
  const result = foldSheet(queueSheet, {
    creaseId: step.creaseId,
    type: step.type,
  });
  assert.equal(result.ok, true);
  queueJobs.push(result);
  queueSheet = result.sheet;
}
assert.equal(queueJobs.length, 3);

const orderedPaints = [];
let idleCalls = 0;
let attentionAtIdle = null;
let currentAttention = "none";
const orderedQueue = createFoldQueue(
  {
    update: (sheet) => orderedPaints.push(sheetSignature(sheet)),
    prepareFold: () => undefined,
    deformFold: () => undefined,
    clearMovingPieces: () => undefined,
  },
  () => {
    idleCalls += 1;
    attentionAtIdle = currentAttention;
  },
);
orderedQueue.push(
  queueJobs[0].fold,
  queueJobs[0].sheet,
  legalCreases(queueJobs[0].sheet),
);
orderedQueue.push(
  queueJobs[1].fold,
  queueJobs[1].sheet,
  legalCreases(queueJobs[1].sheet),
);
orderedQueue.update(Number.MAX_SAFE_INTEGER);
assert.equal(orderedQueue.busy, true);
currentAttention = "agent-next-step";
orderedQueue.push(
  queueJobs[2].fold,
  queueJobs[2].sheet,
  legalCreases(queueJobs[2].sheet),
);
assert.equal(idleCalls, 0);
for (let turn = 0; turn < 4; turn += 1) {
  orderedQueue.update(Number.MAX_SAFE_INTEGER);
}
await Promise.resolve();
const uniquePaints = orderedPaints.filter(
  (signature, index) => signature !== orderedPaints[index - 1],
);
assert.deepEqual(
  uniquePaints,
  queueJobs.map((job) => sheetSignature(job.sheet)),
);
assert.equal(orderedPaints.at(-1), sheetSignature(queueJobs[2].sheet));
assert.equal(orderedQueue.busy, false);
assert.equal(idleCalls, 1);
assert.equal(attentionAtIdle, "agent-next-step");
note("three queued folds stay FIFO and restore current attention only at final idle");

const priorWindow = globalThis.window;
let reducedIdleCalls = 0;
const reducedPaints = [];
globalThis.window = {
  matchMedia: () => ({ matches: true }),
};
try {
  const reducedQueue = createFoldQueue(
    {
      update: (sheet) => reducedPaints.push(sheetSignature(sheet)),
      prepareFold: () => undefined,
      deformFold: () => undefined,
      clearMovingPieces: () => undefined,
    },
    () => {
      reducedIdleCalls += 1;
    },
  );
  for (const job of queueJobs) {
    reducedQueue.push(job.fold, job.sheet, legalCreases(job.sheet));
  }
  assert.equal(reducedQueue.busy, false);
  assert.equal(reducedIdleCalls, 0);
  await Promise.resolve();
  assert.equal(reducedIdleCalls, 1);
  assert.equal(reducedPaints.at(-1), sheetSignature(queueJobs[2].sheet));
} finally {
  if (priorWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = priorWindow;
  }
}
note("reduced motion snaps rapid folds in order and coalesces final idle");

const pickerListeners = new Map();
const pickerCanvas = {
  dataset: {},
  getBoundingClientRect: () => ({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
  }),
  addEventListener: (type, listener) => pickerListeners.set(type, listener),
  removeEventListener: (type) => pickerListeners.delete(type),
};
const pickerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
pickerCamera.position.set(0, 1, 0);
pickerCamera.up.set(0, 0, -1);
pickerCamera.lookAt(0, 0, 0);
pickerCamera.updateProjectionMatrix();
pickerCamera.updateMatrixWorld(true);
const pickerGroup = new THREE.Group();
const pickerGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.75, 0, 0),
  new THREE.Vector3(0.75, 0, 0),
]);
const pickerMaterial = new THREE.LineBasicMaterial();
const pickerLine = new THREE.Line(pickerGeometry, pickerMaterial);
pickerLine.userData.creaseId = "diag-a";
pickerGroup.add(pickerLine);
pickerGroup.updateMatrixWorld(true);
const pickerStore = createStore();
assert.equal(pickerStore.highlight("mid-v").ok, true);
let picked = 0;
const picker = createCreasePicker(
  pickerCanvas,
  pickerCamera,
  pickerGroup,
  {
    onHover: (creaseId) => pickerStore.setHovered(creaseId),
    onPick: () => {
      picked += 1;
    },
  },
);
const firePointer = (type, event) => {
  const listener = pickerListeners.get(type);
  assert.ok(listener, `missing ${type} listener`);
  listener(event);
};
firePointer("pointermove", { clientX: 50, clientY: 50, buttons: 0 });
assert.equal(pickerStore.getState().previewSource, "person");
assert.equal(pickerStore.getState().preview.creaseId, "diag-a");
firePointer("pointerdown", { clientX: 50, clientY: 50, buttons: 1 });
assert.equal(pickerStore.getState().previewSource, "agent");
firePointer("pointermove", { clientX: 95, clientY: 95, buttons: 1 });
firePointer("pointerup", {
  clientX: 95,
  clientY: 95,
  buttons: 0,
  shiftKey: false,
});
assert.equal(picked, 0);
assert.equal(pickerStore.getState().hovered, null);
assert.equal(pickerStore.getState().previewSource, "agent");
assert.equal(pickerStore.getState().preview.creaseId, "mid-v");

firePointer("pointermove", { clientX: 50, clientY: 50, buttons: 0 });
assert.equal(pickerStore.getState().previewSource, "person");
assert.equal(
  HANDLERS.set_view(pickerStore, { zoom: 1.4 }).ok,
  true,
);
assert.equal(pickerStore.getState().hovered, null);
assert.equal(pickerStore.getState().previewSource, "agent");
picker.reset();
firePointer("pointermove", { clientX: 50, clientY: 50, buttons: 0 });
assert.equal(pickerStore.getState().previewSource, "person");
pickerStore.setView({ zoom: 1.2 });
assert.equal(pickerStore.getState().hovered, null);
assert.equal(pickerStore.getState().previewSource, "agent");
picker.reset();
firePointer("pointermove", { clientX: 50, clientY: 50, buttons: 0 });
assert.equal(pickerStore.getState().hovered, "diag-a");
picker.dispose();
pickerGeometry.dispose();
pickerMaterial.dispose();
note("drag, agent view, and wheel view release stale hover to agent attention");

const coordinatorStore = createStore();
const coordinatorPaints = [];
const coordinatorPreviews = [];
const coordinatorCreaseModes = [];
let coordinatorResets = 0;
let coordinatorPublications = 0;
const coordinator = createPresentationCoordinator(
  {
    update: (sheet) => coordinatorPaints.push(sheetSignature(sheet)),
    prepareFold: () => undefined,
    deformFold: () => undefined,
    clearMovingPieces: () => undefined,
    setCreaseMode: (mode) => coordinatorCreaseModes.push(mode),
    showPreview: (preview, source) =>
      coordinatorPreviews.push({ creaseId: preview.creaseId, source }),
    clearPreview: () => coordinatorPreviews.push(null),
  },
  {
    reset: () => {
      coordinatorResets += 1;
    },
  },
);
coordinatorStore.onFold((fold) => {
  coordinator.acceptFold(fold, coordinatorStore.getState());
});
coordinatorStore.subscribe((state) => {
  coordinatorPublications += 1;
  coordinator.sync(state);
});
assert.equal(coordinatorStore.selectModel("blintz").ok, true);
for (let step = 0; step < 3; step += 1) {
  assert.equal(coordinatorStore.advanceStep("agent").ok, true);
}
const coordinatorState = coordinatorStore.getState();
const coordinatorCue = coordinatorState.progress?.nextStep?.creaseId;
assert.ok(coordinatorCue);
assert.equal(coordinatorStore.highlight(coordinatorCue).ok, true);
assert.equal(coordinator.busy, true);
assert.equal(coordinatorPreviews.at(-1), null);
for (let turn = 0; turn < 5; turn += 1) {
  coordinator.update(Number.MAX_SAFE_INTEGER);
}
await Promise.resolve();
assert.equal(coordinator.busy, false);
assert.equal(
  coordinatorPaints.at(-1),
  sheetSignature(coordinatorStore.getState().sheet),
);
assert.deepEqual(coordinatorPreviews.at(-1), {
  creaseId: coordinatorCue,
  source: "agent",
});
assert.equal(coordinatorPublications, 6);
assert.ok(coordinatorCreaseModes.every((mode) => mode === "active"));
assert.ok(coordinatorResets > 0);

assert.equal(coordinatorStore.advanceStep("agent").ok, true);
const completedCoordinatorState = coordinatorStore.getState();
assert.equal(
  completedCoordinatorState.progress?.completed,
  completedCoordinatorState.progress?.total,
);
assert.equal(coordinatorCreaseModes.at(-1), "complete");
assert.equal(coordinatorPublications, 7);
for (let turn = 0; turn < 5; turn += 1) {
  coordinator.update(Number.MAX_SAFE_INTEGER);
}
await Promise.resolve();
assert.equal(coordinator.busy, false);
assert.equal(coordinatorCreaseModes.at(-1), "complete");
assert.equal(coordinatorPreviews.at(-1), null);
note("queued folds restore current attention, then completion dims crease clutter");

// --- Description --------------------------------------------------------

const description = describeSheet(
  diagonal.sheet,
  legalCreases(diagonal.sheet),
  layerCount(diagonal.sheet),
  null,
);
assert.match(description, /folded 1 time/);
assert.ok(description.length > 40);
note("describeSheet returns real sentences for the canvas and the tool");

// --- Store --------------------------------------------------------------

const store = createStore();
assert.equal(store.getState().registry.status, "working");
assert.equal(store.getState().registry.live, false);
assert.equal(store.getState().registry.toolCount, 0);
note("registry starts in a real working state with a zero tool count");

let observedFolds = 0;
store.onFold(() => {
  observedFolds += 1;
});

const personFold = store.fold("diag-a", "valley", "person");
assert.equal(personFold.ok, true);
assert.equal(observedFolds, 1);
assert.equal(store.getState().sheet.foldCount, 1);

const agentFold = store.fold("mid-v", "valley", "agent");
assert.equal(agentFold.ok, true);

const entries = store.getState().history.entries.slice(0, 2);
assert.deepEqual(
  entries.map((entry) => entry.origin),
  ["person", "agent"],
);
note("person and agent folds land in one history, tagged by origin");

assert.equal(store.undo("person").ok, true);
assert.equal(store.getState().sheet.foldCount, 1);
assert.equal(store.redo("agent").ok, true);
assert.equal(store.getState().sheet.foldCount, 2);
note("undo and redo move through the same history");

// The reset guard is the only gate in the product.
store.fold("mid-h", "valley", "agent");
store.fold("diag-b", "valley", "agent");
assert.ok(store.getState().sheet.foldCount > 3);
const guarded = store.reset("agent", false);
assert.equal(guarded.ok, false);
assert.match(guarded.message, /confirm/);
assert.equal(store.reset("agent", true).ok, true);
assert.equal(store.getState().sheet.foldCount, 0);
note("reset refuses to discard more than three folds without confirm");

// Attention channels: the person's pointer and the agent's highlight are kept
// apart so a stray mouse cannot erase what the agent pointed at.
assert.equal(store.getState().preview, null);
assert.equal(store.getState().previewSource, null);

store.highlight("diag-a");
assert.equal(store.getState().previewSource, "agent");
assert.equal(store.getState().preview.creaseId, "diag-a");

store.setHovered("mid-v");
assert.equal(store.getState().previewSource, "person");
assert.equal(store.getState().preview.creaseId, "mid-v");
assert.equal(
  store.getState().highlighted,
  "diag-a",
  "a hover must not discard the agent's highlight",
);

store.setHovered(null);
assert.equal(store.getState().previewSource, "agent");
assert.equal(store.getState().preview.creaseId, "diag-a");
note("a person's hover outranks the agent's highlight, then hands it back");

store.clearHighlight();
assert.equal(store.getState().preview, null);
note("clearing attention clears the preview");

store.setHovered("diag-a");
assert.equal(store.fold("diag-a", "valley", "person").ok, true);
assert.equal(store.getState().hovered, null);
assert.equal(store.highlight("mid-v").ok, true);
assert.equal(store.getState().previewSource, "agent");
assert.equal(store.getState().preview.creaseId, "mid-v");
note("a sheet change clears stale hover before a later agent highlight");

// The camera is shared, so its limits are engine-side rules rather than something
// the pointer handler happens to enforce.
assert.equal(store.setView({ elevation: 0 }).elevation, 15);
assert.equal(store.setView({ elevation: 200 }).elevation, 85);
assert.equal(store.setView({ zoom: 99 }).zoom, 2.2);
assert.equal(store.setView({ zoom: 0 }).zoom, 0.5);
assert.equal(store.setView({ azimuth: 380 }).azimuth, 20);
assert.equal(store.setView({ azimuth: -10 }).azimuth, 350);
note("shared camera clamps elevation to 15-85, zoom to 0.5-2.2, and wraps azimuth");

// Scrubbing the history. Snapshots make this exact, so moving back and forth
// must land on byte-identical states rather than something that drifted.
store.reset("agent", true);
store.selectModel("blintz");
const walked = [sheetSignature(store.getState().sheet)];
for (let step = 0; step < 4; step += 1) {
  assert.equal(HANDLERS.advance_step(store, {}).ok, true);
  walked.push(sheetSignature(store.getState().sheet));
}
assert.equal(store.getState().history.states.length, 5);

for (const index of [0, 3, 1, 4, 2]) {
  store.seek(index);
  assert.equal(store.getState().history.cursor, index);
  assert.equal(
    sheetSignature(store.getState().sheet),
    walked[index],
    `seeking to ${index} did not restore that exact state`,
  );
}
note("scrubbing to any fold restores that state exactly, in any order");

store.seek(-5);
assert.equal(store.getState().history.cursor, 0);
store.seek(99);
assert.equal(store.getState().history.cursor, 4);
assert.equal(store.seek(4).ok, false);
note("scrub clamps out-of-range targets and reports a no-op honestly");

// Scrubbing back then folding must discard the redo tail, not branch.
store.seek(2);
assert.equal(store.fold("mid-v", "valley", "person").ok, true);
assert.equal(store.getState().history.states.length, 4);
assert.equal(store.getState().history.cursor, 3);
note("folding after a scrub truncates the redo tail instead of branching");

// The ribbon reads origins in order, so the order has to be preserved.
assert.deepEqual(
  store.getState().history.entries.map((entry) => entry.origin),
  ["agent", "agent", "person"],
);
note("history origins survive scrubbing in the order they happened");

// Hand the shared store back in a known state, so later sections do not inherit
// folds from this one.
store.reset("agent", true);
assert.equal(store.getState().sheet.foldCount, 0);

// --- WebMCP contracts and handlers --------------------------------------

assertBudgets(CONTRACTS);
note(`${CONTRACTS.length} contracts pass Chrome's name and description budgets`);

for (const contract of CONTRACTS) {
  assert.ok(
    HANDLERS[contract.name],
    `contract ${contract.name} has no handler`,
  );
}
assert.equal(Object.keys(HANDLERS).length, CONTRACTS.length);
note("every contract has exactly one handler and no handler is orphaned");

assert.deepEqual(
  CONTRACTS.filter(
    (contract) => contract.annotations.untrustedContentHint === true,
  )
    .map((contract) => contract.name)
    .sort(),
  [
    "fold_crease",
    "get_tool_activity",
    "highlight_crease",
    "select_model",
  ],
);
let textSchemas = 0;
for (const contract of CONTRACTS) {
  for (const property of Object.values(contract.inputSchema.properties)) {
    if (property.type !== "string") {
      continue;
    }

    textSchemas += 1;
    assert.equal(property.maxLength, TEXT_PARAMETER_LIMIT);
  }
}
assert.ok(textSchemas >= 4);
note("all text schemas are bounded and every untrusted output is annotated");

const offlineStore = createStore();
const offlineRegistration = await registerTools(offlineStore, {
  surface: null,
  origin: "none",
});
assert.equal(offlineRegistration.status, "offline");
assert.equal(offlineStore.getState().registry.status, "offline");

const registrationSignals = [];
const registeredTools = new Map();
const liveStore = createStore();
const livePromise = registerTools(liveStore, {
  origin: "document.modelContext",
  surface: {
    registerTool: (tool, options) => {
      registeredTools.set(tool.name, tool);
      if (options?.signal) registrationSignals.push(options.signal);
      return Promise.resolve();
    },
  },
});
assert.equal(liveStore.getState().registry.status, "working");
const liveRegistration = await livePromise;
assert.equal(liveRegistration.status, "live");
assert.equal(liveRegistration.toolCount, CONTRACTS.length);

const hostileCalls = [
  [
    "fold_crease",
    { crease_id: "bad\nid", type: "valley" },
  ],
  ["select_model", { model_id: "bad\r\nid" }],
  ["highlight_crease", { crease_id: "bad\u2028id" }],
  [
    "fold_crease",
    { crease_id: "bad\u2029id", type: "valley" },
  ],
  ["select_model", { model_id: "x".repeat(TEXT_PARAMETER_LIMIT + 1) }],
];
for (const [toolName, input] of hostileCalls) {
  const tool = registeredTools.get(toolName);
  assert.ok(tool);
  const output = await tool.execute(input);
  assert.ok(output.length <= 1500);
  const envelope = JSON.parse(output);
  assert.equal(envelope.ok, false);
  assert.equal(typeof envelope.summary, "string");
  assert.doesNotMatch(envelope.summary, /[\r\n\u2028\u2029]/u);
  assert.ok(envelope.summary.length <= SUMMARY_LIMIT);
  const activity = liveStore.getState().activity.at(-1);
  assert.equal(activity.tool, toolName);
  assert.doesNotMatch(activity.summary, /[\r\n\u2028\u2029]/u);
  assert.ok(activity.summary.length <= SUMMARY_LIMIT);
}
liveStore.logTool(
  "boundary_probe",
  "agent",
  `caller\n${"x".repeat(20_000)}`,
  false,
);
liveStore.report(`caller\u2028${"x".repeat(20_000)}`, false);
assert.ok(liveStore.getState().activity.at(-1).summary.length <= SUMMARY_LIMIT);
assert.doesNotMatch(
  liveStore.getState().activity.at(-1).summary,
  /[\r\n\u2028\u2029]/u,
);
assert.ok(liveStore.getState().status.text.length <= 240);
assert.doesNotMatch(liveStore.getState().status.text, /[\r\n\u2028\u2029]/u);
note("hostile caller text stays single-line and bounded through runtime and store");

liveRegistration.unregister();
assert.ok(registrationSignals.every((signal) => signal.aborted));

const originalWarn = console.warn;
console.warn = () => undefined;
const degradedStore = createStore();
let registrationAttempt = 0;
const degradedRegistration = await registerTools(degradedStore, {
  origin: "navigator.modelContext",
  surface: {
    registerTool: () => {
      registrationAttempt += 1;
      if (registrationAttempt > 3) throw new Error("rejected for test");
    },
  },
});
const errorStore = createStore();
const errorRegistration = await registerTools(errorStore, {
  origin: "document.modelContext",
  surface: { registerTool: () => { throw new Error("rejected for test"); } },
});
console.warn = originalWarn;
assert.equal(degradedRegistration.status, "degraded");
assert.equal(degradedRegistration.toolCount, 3);
assert.equal(degradedStore.getState().registry.live, false);
assert.equal(errorRegistration.status, "error");
assert.equal(errorRegistration.toolCount, 0);
note("registry distinguishes working, offline, live, degraded, and error states");

const readOnly = CONTRACTS.filter((contract) => contract.annotations.readOnlyHint);
assert.ok(readOnly.length >= 10);
for (const contract of readOnly) {
  const before = sheetSignature(store.getState().sheet);
  HANDLERS[contract.name](store, {});
  assert.equal(
    sheetSignature(store.getState().sheet),
    before,
    `${contract.name} is annotated read-only but changed the sheet`,
  );
}
note(`${readOnly.length} read-only tools proved not to change the sheet`);

// Handlers validate their own arguments; a direct call is not schema checked.
const missing = HANDLERS.fold_crease(store, {});
assert.equal(missing.ok, false);
assert.match(missing.summary, /crease_id/);

const badChoice = HANDLERS.fold_crease(store, {
  crease_id: "diag-a",
  type: "sideways",
});
assert.equal(badChoice.ok, false);
note("fold_crease rejects missing and invalid arguments on its own");

const refused = HANDLERS.fold_crease(store, {
  crease_id: "does-not-exist",
  type: "valley",
});
assert.equal(refused.ok, false);
assert.equal(refused.data.applied, false);
note("a refused fold never reports itself as applied");

// Start from a known sheet rather than inheriting one, so the count below means
// what it says.
store.reset("agent", true);
const applied = HANDLERS.fold_crease(store, {
  crease_id: "diag-a",
  type: "valley",
});
assert.equal(applied.ok, true);
assert.equal(applied.data.applied, true);
assert.equal(store.getState().sheet.foldCount, 1);
note("an accepted fold reports the state it produced");

// advance_step must refuse rather than silently fixing a diverged sheet.
store.reset("agent", true);
store.selectModel("blintz");
assert.equal(HANDLERS.advance_step(store, {}).ok, true);
store.fold("mid-v", "valley", "person");
const blocked = HANDLERS.advance_step(store, {});
assert.equal(blocked.ok, false);
assert.match(blocked.summary, /left the/);
note("advance_step refuses a diverged sheet and points at check_progress");

const progressReply = HANDLERS.check_progress(store, {});
assert.equal(progressReply.data.on_path, false);
note("check_progress reports divergence rather than hiding it");

// Output budget is measured after the real formatter, not on data alone.
const budgetStore = createStore();
budgetStore.selectModel("eight-fold-packet");
for (let index = 0; index < 24; index += 1) {
  budgetStore.flip(index % 2 === 0 ? "person" : "agent");
  budgetStore.logTool(
    "probe_activity",
    index % 2 === 0 ? "person" : "agent",
    `caller text ${index} ${"x".repeat(120)}`,
    true,
  );
}

const creaseColumns = [
  "id",
  "label",
  "from_x",
  "from_z",
  "to_x",
  "to_z",
  "moves",
];
let widestCreaseReply = 0;
for (const model of MODELS) {
  const authoredStore = createStore();
  assert.equal(authoredStore.selectModel(model.id).ok, true);

  for (let index = 0; index <= model.steps.length; index += 1) {
    const formatted = formatReply(HANDLERS.list_creases(authoredStore, {}));
    const envelope = JSON.parse(formatted);
    widestCreaseReply = Math.max(widestCreaseReply, formatted.length);
    assert.equal(
      Object.hasOwn(envelope.data, "original_chars"),
      false,
      `${model.id} step ${index}: legal creases were dropped`,
    );
    assert.deepEqual(envelope.data.columns, creaseColumns);
    assert.equal(
      envelope.data.creases.length,
      authoredStore.getState().creases.length,
    );
    for (const row of envelope.data.creases) {
      assert.equal(row.length, creaseColumns.length);
    }

    if (index < model.steps.length) {
      assert.equal(authoredStore.advanceStep("agent").ok, true);
    }
  }
}
assert.ok(widestCreaseReply <= 1500);
note(
  `every authored state keeps its full legal crease set; widest reply ${widestCreaseReply} chars`,
);

let widestName = "";
let widestLength = 0;
for (const contract of readOnly) {
  const formatted = formatReply(HANDLERS[contract.name](budgetStore, {}));
  assert.ok(
    formatted.length <= 1500,
    `${contract.name} formatted output is ${formatted.length} chars`,
  );
  const envelope = JSON.parse(formatted);
  assert.equal(typeof envelope.summary, "string");
  assert.equal(typeof envelope.data, "object");
  assert.equal(
    Object.hasOwn(envelope.data, "original_chars"),
    false,
    `${contract.name} fell back to formatter truncation`,
  );
  if (formatted.length > widestLength) {
    widestName = contract.name;
    widestLength = formatted.length;
  }
}
for (const contract of CONTRACTS) {
  const formatted = formatReply(HANDLERS[contract.name](createStore(), {}));
  const envelope = JSON.parse(formatted);
  assert.equal(typeof envelope.ok, "boolean");
  assert.equal(typeof envelope.summary, "string");
  assert.equal(typeof envelope.data, "object");
}
const multilineEnvelope = JSON.parse(
  formatReply({
    ok: false,
    summary: `caller\nline\u2028${"x".repeat(1_000)}`,
    data: { applied: false },
  }),
);
assert.ok(multilineEnvelope.summary.length <= SUMMARY_LIMIT);
assert.doesNotMatch(multilineEnvelope.summary, /[\r\n\u2028\u2029]/u);
const overflowFallback = formatReply({
  ok: true,
  summary: "Oversized probe.",
  data: { huge: "x".repeat(2_000) },
});
assert.ok(overflowFallback.length <= 1500);
const overflowEnvelope = JSON.parse(overflowFallback);
assert.equal(overflowEnvelope.data.truncated, true);
note(
  `all formatted replies are JSON and bounded; widest read is ${widestName} at ${widestLength} chars`,
);

const highlightMiss = HANDLERS.highlight_crease(store, { crease_id: "ghost" });
assert.equal(highlightMiss.ok, false);
assert.equal(highlightMiss.data.highlighted, null);
note("highlight_crease refuses a crease that is not on the sheet");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.mutations = 0;
    this.value = "";
    this.parentElement = null;
    this.scrollHeight = 0;
    this.scrollTop = 0;
  }

  set textContent(value) {
    this.value = value;
    this.mutations += 1;
  }

  get textContent() {
    return this.value;
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    this.mutations += 1;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
}

const fakeTree = (root) => [
  root,
  ...root.children.flatMap((child) => fakeTree(child)),
];
const priorDocument = globalThis.document;
globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName),
};
try {
  const marquee = createMarquee();
  const badge = marquee.element.children[1];
  const marqueeState = createStore().getState();
  marquee.render(marqueeState);
  const initialMutations = badge.mutations;
  marquee.render(marqueeState);
  assert.equal(badge.mutations, initialMutations);
  marquee.render({
    ...marqueeState,
    registry: {
      status: "offline",
      live: false,
      toolCount: 0,
      surface: "none",
    },
  });
  assert.ok(badge.mutations > initialMutations);

  const controlStore = createStore();
  assert.equal(controlStore.flip("person").ok, true);
  const controls = createControls(controlStore);
  controls.render(controlStore.getState());
  const controlNodes = fakeTree(controls.element);
  const undoButton = controlNodes.find((node) => node.textContent === "↶");
  const redoButton = controlNodes.find((node) => node.textContent === "↷");
  assert.ok(undoButton);
  assert.ok(redoButton);
  assert.equal(
    undoButton.attributes.get("aria-label"),
    "Undo the last change",
  );
  assert.equal(
    redoButton.attributes.get("aria-label"),
    "Redo the undone change",
  );
  note("registration status is stable and rendered history labels cover flips");

  const consoleStore = createStore();
  consoleStore.logTool(
    "boundary_probe",
    "agent",
    `caller\n${"x".repeat(500)}`,
    true,
  );
  const consolePanel = createConsole();
  consolePanel.render(consoleStore.getState());
  const consoleNodes = fakeTree(consolePanel.element);
  const consoleRow = consoleNodes.find((node) => node.className === "console-row");
  const consoleNote = consoleNodes.find((node) => node.className === "console-note");
  assert.ok(consoleRow);
  assert.ok(consoleNote);
  assert.equal(consoleRow.children.length, 3);
  assert.doesNotMatch(consoleNote.textContent, /[\r\n\u2028\u2029]/u);
  assert.ok(consoleNote.textContent.length <= SUMMARY_LIMIT);
  assert.equal(
    consoleNote.attributes.get("title"),
    consoleNote.textContent,
  );
  const stylesSource = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  assert.match(
    stylesSource,
    /\.console-row\s*\{[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    stylesSource,
    /\.console-note\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
  );
  note("console renders each bounded activity record on one visual row");
} finally {
  if (priorDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = priorDocument;
  }
}

// --- Layer boundaries ---------------------------------------------------

let deep = createSquareSheet();
let folds = 0;
while (folds < 60) {
  const options = legalCreases(deep);
  if (options.length === 0) {
    break;
  }
  const attempt = foldSheet(deep, { creaseId: options[0].id, type: "valley" });
  if (!attempt.ok) {
    break;
  }
  deep = attempt.sheet;
  folds += 1;
}
assert.ok(layerCount(deep) <= MAX_LAYERS);
assert.ok(Math.abs(area(deep) - 1) < 1e-6, `area drifted to ${area(deep)}`);
note(
  `folded ${folds} times unattended: stack ${layerCount(deep)} within the ${MAX_LAYERS} cap, area still ${area(deep).toFixed(6)}`,
);

// --- Layering discipline ------------------------------------------------

const engineDirectory = fileURLToPath(new URL("../src/engine/", import.meta.url));
let threeImports = 0;
for (const file of (await readdir(engineDirectory)).filter((name) =>
  name.endsWith(".ts"),
)) {
  const source = await readFile(join(engineDirectory, file), "utf8");
  threeImports += (source.match(/from\s+["']three["']/g) ?? []).length;
}
assert.equal(threeImports, 0);
note("the engine imports Three.js zero times");

const webmcpDirectory = fileURLToPath(new URL("../src/webmcp/", import.meta.url));
let sceneImports = 0;
const walk = async (directory) => {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!item.name.endsWith(".ts")) {
      continue;
    }
    const source = await readFile(path, "utf8");
    sceneImports += (source.match(/from\s+["'].*\/scene\//g) ?? []).length;
  }
};
await walk(webmcpDirectory);
assert.equal(sceneImports, 0);
note("the WebMCP layer never reaches into the scene");

const noticeFiles = [
  "../THIRD_PARTY_LICENSES/Archivo-Black-OFL-1.1.txt",
  "../THIRD_PARTY_LICENSES/Space-Mono-OFL-1.1.txt",
  "../THIRD_PARTY_LICENSES/Three.js-MIT.txt",
  "../public/licenses/Fonts-OFL-1.1.txt",
  "../public/licenses/Three.js-MIT.txt",
];
for (const relative of noticeFiles) {
  const notice = await readFile(new URL(relative, import.meta.url), "utf8");
  assert.ok(notice.length > 500, `${relative} is not a complete notice`);
}
note("font and Three.js notices exist in both repository and deployable assets");

for (const line of pass) {
  console.log(`PASS ${line}`);
}
console.log(`\n${pass.length} checks passed.`);
