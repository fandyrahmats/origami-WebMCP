import * as THREE from "three";

import type { Point2 } from "../engine/types.js";

/** Enough strips for a rounded hinge without making a small flap expensive. */
const FOLD_SUBDIVISIONS = 7;
const ON_AXIS = 1e-7;

interface Triangle {
  readonly a: Point2;
  readonly b: Point2;
  readonly c: Point2;
}

/**
 * The engine only produces convex facets, so a fan is a complete triangulation.
 * Winding points the cream front up when `faceUp` is true and down otherwise.
 */
const trianglesFor = (
  polygon: readonly Point2[],
  faceUp: boolean,
): readonly Triangle[] => {
  const first = polygon[0];
  if (!first) return [];

  let signed = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (a && b) signed += a.x * b.z - b.x * a.z;
  }

  const reverse = faceUp ? signed > 0 : signed < 0;
  const triangles: Triangle[] = [];
  for (let index = 1; index < polygon.length - 1; index += 1) {
    const second = polygon[index];
    const third = polygon[index + 1];
    if (!second || !third) continue;
    triangles.push(
      reverse
        ? { a: first, b: third, c: second }
        : { a: first, b: second, c: third },
    );
  }
  return triangles;
};

export const createPaperGeometry = (
  polygon: readonly Point2[],
  faceUp: boolean,
  origin: Point2 = { x: 0, z: 0 },
): THREE.BufferGeometry => {
  const triangles = trianglesFor(polygon, faceUp);
  const positions = new Float32Array(triangles.length * 9);

  triangles.forEach((triangle, triangleIndex) => {
    [triangle.a, triangle.b, triangle.c].forEach((vertex, corner) => {
      const offset = triangleIndex * 9 + corner * 3;
      positions[offset] = vertex.x - origin.x;
      positions[offset + 1] = 0;
      positions[offset + 2] = vertex.z - origin.z;
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

export interface CurlGeometry {
  readonly geometry: THREE.BufferGeometry;
  /** Distance along the crease for each vertex. */
  readonly along: Float32Array;
  /** Signed distance away from the crease for each vertex. */
  readonly away: Float32Array;
  readonly side: 1 | -1;
  readonly maxDistance: number;
  readonly normalSign: 1 | -1;
}

const barycentric = (
  triangle: Triangle,
  i: number,
  j: number,
  divisions: number,
): Point2 => {
  const towardB = i / divisions;
  const towardC = j / divisions;
  const atA = 1 - towardB - towardC;
  return {
    x: triangle.a.x * atA + triangle.b.x * towardB + triangle.c.x * towardC,
    z: triangle.a.z * atA + triangle.b.z * towardB + triangle.c.z * towardC,
  };
};

/** Split every triangle into a regular grid, giving the hinge vertices to bend. */
const subdivide = (triangle: Triangle): readonly Point2[] => {
  const output: Point2[] = [];
  const n = FOLD_SUBDIVISIONS;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n - i; j += 1) {
      const a = barycentric(triangle, i, j, n);
      const b = barycentric(triangle, i + 1, j, n);
      const c = barycentric(triangle, i, j + 1, n);
      output.push(a, b, c);

      if (i + j < n - 1) {
        output.push(
          b,
          barycentric(triangle, i + 1, j + 1, n),
          c,
        );
      }
    }
  }
  return output;
};

export const createCurlGeometry = (
  polygon: readonly Point2[],
  faceUp: boolean,
  axisStart: Point2,
  axisEnd: Point2,
): CurlGeometry => {
  const dx = axisEnd.x - axisStart.x;
  const dz = axisEnd.z - axisStart.z;
  const length = Math.max(Math.hypot(dx, dz), ON_AXIS);
  const axisX = dx / length;
  const axisZ = dz / length;
  const rightX = -axisZ;
  const rightZ = axisX;
  const vertices = trianglesFor(polygon, faceUp).flatMap(subdivide);
  const positions = new Float32Array(vertices.length * 3);
  const normals = new Float32Array(vertices.length * 3);
  const along = new Float32Array(vertices.length);
  const away = new Float32Array(vertices.length);
  let signedFarthest = 0;

  vertices.forEach((vertex, index) => {
    const x = vertex.x - axisStart.x;
    const z = vertex.z - axisStart.z;
    along[index] = x * axisX + z * axisZ;
    away[index] = x * rightX + z * rightZ;
    if (Math.abs(away[index] ?? 0) > Math.abs(signedFarthest)) {
      signedFarthest = away[index] ?? 0;
    }
    const offset = index * 3;
    positions[offset] = vertex.x;
    positions[offset + 1] = 0;
    positions[offset + 2] = vertex.z;
    normals[offset + 1] = faceUp ? 1 : -1;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

  return {
    geometry,
    along,
    away,
    side: signedFarthest < 0 ? -1 : 1,
    maxDistance: Math.abs(signedFarthest),
    normalSign: faceUp ? 1 : -1,
  };
};

/**
 * Curl a narrow band around the crease, while the rest of the flap rotates as a
 * sheet. The band widens through mid-fold and collapses at both ends, so state 0
 * is exactly the source polygon and state 1 is exactly the engine reflection.
 */
export const deformCurl = (
  curl: CurlGeometry,
  axisStart: Point2,
  axisEnd: Point2,
  angle: number,
  progress: number,
  layerLift = 0,
): void => {
  const positions = curl.geometry.getAttribute("position") as THREE.BufferAttribute;
  const normals = curl.geometry.getAttribute("normal") as THREE.BufferAttribute;
  const positionArray = positions.array as Float32Array;
  const normalArray = normals.array as Float32Array;
  const dx = axisEnd.x - axisStart.x;
  const dz = axisEnd.z - axisStart.z;
  const length = Math.max(Math.hypot(dx, dz), ON_AXIS);
  const axisX = dx / length;
  const axisZ = dz / length;
  const rightX = -axisZ;
  const rightZ = axisX;
  const side = curl.side;
  const outwardX = rightX * side;
  const outwardZ = rightZ * side;
  const outwardAngle = -side * angle;
  const wave = Math.pow(Math.max(Math.sin(Math.PI * progress), 0), 0.7);
  const band = Math.min(curl.maxDistance * 0.38, 0.13) * wave;

  for (let index = 0; index < curl.along.length; index += 1) {
    const distance = Math.abs(curl.away[index] ?? 0);
    let out = 0;
    let up = 0;
    let localAngle = outwardAngle;

    if (band > ON_AXIS && Math.abs(outwardAngle) > ON_AXIS) {
      const curvature = outwardAngle / band;
      if (distance < band) {
        localAngle = curvature * distance;
        out = Math.sin(localAngle) / curvature;
        up = (1 - Math.cos(localAngle)) / curvature;
      } else {
        const edgeOut = Math.sin(outwardAngle) / curvature;
        const edgeUp = (1 - Math.cos(outwardAngle)) / curvature;
        out = edgeOut + (distance - band) * Math.cos(outwardAngle);
        up = edgeUp + (distance - band) * Math.sin(outwardAngle);
      }
    } else {
      out = distance * Math.cos(outwardAngle);
      up = distance * Math.sin(outwardAngle);
    }

    const along = curl.along[index] ?? 0;
    const offset = index * 3;
    positionArray[offset] = axisStart.x + axisX * along + outwardX * out;
    positionArray[offset + 1] = up + layerLift;
    positionArray[offset + 2] = axisStart.z + axisZ * along + outwardZ * out;

    const axisRotation = -side * localAngle;
    const sine = Math.sin(axisRotation) * curl.normalSign;
    normalArray[offset] = rightX * sine;
    normalArray[offset + 1] = Math.cos(axisRotation) * curl.normalSign;
    normalArray[offset + 2] = rightZ * sine;
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
};
