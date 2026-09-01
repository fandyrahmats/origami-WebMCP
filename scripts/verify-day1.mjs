import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { foldSingleDiagonal } from "../.verify-dist/src/engine/fold.js";
import {
  createSquareSheet,
  DIAGONAL_CREASE_ID,
  MOVING_FACET_ID,
} from "../.verify-dist/src/engine/sheet.js";
import { createFoldHandler } from "../.verify-dist/src/interaction/foldHandler.js";

const sheet = createSquareSheet();
assert.equal(sheet.facets.length, 2);
assert.equal(sheet.creases.length, 1);
assert.equal(sheet.creases[0]?.id, DIAGONAL_CREASE_ID);

const result = foldSingleDiagonal(sheet, {
  creaseId: DIAGONAL_CREASE_ID,
  type: "valley",
});
assert.equal(result.ok, true);

if (!result.ok) {
  throw new Error(result.reason);
}

const movingFacet = result.sheet.facets.find(
  (facet) => facet.id === MOVING_FACET_ID,
);
assert.ok(movingFacet);
assert.equal(result.sheet.foldCount, 1);
assert.equal(sheet.foldCount, 0, "the input sheet must remain immutable");
assert.equal(result.fold.angleRadians, Math.PI);
assert.ok(Math.abs(movingFacet.vertices[2].x + 0.5) < 1e-10);
assert.ok(Math.abs(movingFacet.vertices[2].z - 0.5) < 1e-10);

const repeated = foldSingleDiagonal(result.sheet, {
  creaseId: DIAGONAL_CREASE_ID,
  type: "valley",
});
assert.equal(repeated.ok, false);

let appliedCallbacks = 0;
const handler = createFoldHandler(createSquareSheet(), () => {
  appliedCallbacks += 1;
});
const handled = handler.handleCrease(DIAGONAL_CREASE_ID);
assert.equal(handled.ok, true);
assert.equal(handler.getSheet().foldCount, 1);
assert.equal(appliedCallbacks, 1);

const engineDirectory = fileURLToPath(new URL("../src/engine/", import.meta.url));
const engineFiles = await readdir(engineDirectory);
let threeImportCount = 0;
for (const file of engineFiles.filter((name) => name.endsWith(".ts"))) {
  const source = await readFile(join(engineDirectory, file), "utf8");
  threeImportCount += (source.match(/from\s+["']three["']/g) ?? []).length;
}
assert.equal(threeImportCount, 0);

console.log("PASS sheet facets: 2");
console.log("PASS hardcoded creases: 1");
console.log("PASS fold count after transition: 1");
console.log(`PASS fold rotation radians: ${result.fold.angleRadians.toFixed(6)}`);
console.log(
  `PASS moving vertex target: (${movingFacet.vertices[2].x.toFixed(3)}, ${movingFacet.vertices[2].y.toFixed(3)}, ${movingFacet.vertices[2].z.toFixed(3)})`,
);
console.log("PASS repeated fold rejected: true");
console.log(`PASS handler fold count: ${handler.getSheet().foldCount}`);
console.log(`PASS handler applied callbacks: ${appliedCallbacks}`);
console.log(`PASS engine Three.js imports: ${threeImportCount}`);
