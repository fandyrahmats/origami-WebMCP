import * as THREE from "three";

import type { Facet, Point3, Sheet } from "../engine/types.js";

export interface SheetView {
  readonly root: THREE.Group;
  readonly movingFacet: THREE.Group;
  readonly creaseTarget: THREE.Mesh;
  dispose(): void;
}

const PAPER_LAYER_GAP = 0.004;

const createFacetGeometry = (facet: Facet, origin: Point3): THREE.BufferGeometry => {
  const positions = new Float32Array(9);
  facet.vertices.forEach((vertex, index) => {
    const offset = index * 3;
    positions[offset] = vertex.x - origin.x;
    positions[offset + 1] = vertex.y - origin.y;
    positions[offset + 2] = vertex.z - origin.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const createFacetGroup = (
  geometry: THREE.BufferGeometry,
  front: THREE.Material,
  back: THREE.Material,
): THREE.Group => {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, front), new THREE.Mesh(geometry, back));
  return group;
};

export const createSheetView = (sheet: Sheet): SheetView => {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const front = new THREE.MeshStandardMaterial({
    color: 0xf7f1df,
    roughness: 0.86,
    metalness: 0,
    side: THREE.FrontSide,
  });
  const back = new THREE.MeshStandardMaterial({
    color: 0x9fcdb5,
    roughness: 0.8,
    metalness: 0,
    side: THREE.BackSide,
  });

  const crease = sheet.creases[0];
  if (!crease) {
    throw new Error("The Day 1 sheet needs its hardcoded crease.");
  }

  const fixedFacet = sheet.facets.find((facet) => facet.id !== crease.movingFacetId);
  const movingFacetData = sheet.facets.find(
    (facet) => facet.id === crease.movingFacetId,
  );
  if (!fixedFacet || !movingFacetData) {
    throw new Error("The Day 1 sheet needs one fixed and one moving facet.");
  }

  const worldOrigin: Point3 = { x: 0, y: 0, z: 0 };
  const fixedGeometry = createFacetGeometry(fixedFacet, worldOrigin);
  const movingGeometry = createFacetGeometry(movingFacetData, crease.start);
  geometries.push(fixedGeometry, movingGeometry);

  const fixedFacetGroup = createFacetGroup(fixedGeometry, front, back);
  const movingFacet = createFacetGroup(movingGeometry, front, back);
  movingFacet.position.set(crease.start.x, crease.start.y, crease.start.z);
  root.add(fixedFacetGroup, movingFacet);

  const start = new THREE.Vector3(crease.start.x, crease.start.y, crease.start.z);
  const end = new THREE.Vector3(crease.end.x, crease.end.y, crease.end.z);
  const direction = end.clone().sub(start);
  const creaseGeometry = new THREE.CylinderGeometry(
    0.009,
    0.009,
    direction.length(),
    12,
  );
  const creaseMaterial = new THREE.MeshStandardMaterial({
    color: 0xff496c,
    emissive: 0xff496c,
    emissiveIntensity: 4,
    roughness: 0.35,
  });
  const creaseTarget = new THREE.Mesh(creaseGeometry, creaseMaterial);
  creaseTarget.position.copy(start).add(end).multiplyScalar(0.5);
  creaseTarget.position.y += PAPER_LAYER_GAP;
  creaseTarget.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  root.add(creaseTarget);

  return {
    root,
    movingFacet,
    creaseTarget,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      creaseGeometry.dispose();
      front.dispose();
      back.dispose();
      creaseMaterial.dispose();
      root.removeFromParent();
    },
  };
};

export { PAPER_LAYER_GAP };
