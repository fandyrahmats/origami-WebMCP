import * as THREE from "three";

import type {
  FoldOrigin,
  FoldPreview,
  LegalCrease,
  MovingPiece,
  Point2,
  Sheet,
} from "../engine/types.js";
import {
  createCurlGeometry,
  createPaperGeometry,
  deformCurl,
} from "./paperGeometry.js";
import type { CurlGeometry } from "./paperGeometry.js";

const PAPER_FRONT = 0xf7f1df;
const PAPER_BACK = 0x2f8f63;
const CREASE_COLOUR = 0x8a86a8;
const ACTIVE_CREASE_OPACITY = 0.22;
const COMPLETE_CREASE_OPACITY = 0.06;
const PERSON_TONE = 0xff496c;
const AGENT_TONE = 0x39ed82;

/** Final folded paper is a surface, not a pile of visible plates. */
const SURFACE_Y = 0;
const CREASE_LIFT = 0.0007;
const ANIMATION_LAYER_GAP = 0.000018;
const STATIC_ORDER = 100;
const MOVING_ORDER = 5_000;
const CREASE_ORDER = 10_000;
const GHOST_ORDER = 11_000;

interface CurlEntry {
  readonly curl: CurlGeometry;
  readonly axisStart: Point2;
  readonly axisEnd: Point2;
  readonly lift: number;
}

export interface SheetView {
  readonly root: THREE.Group;
  readonly creaseGroup: THREE.Group;
  /** Rebuild the paper. `hidden` facet ids are skipped while they animate. */
  update(
    sheet: Sheet,
    creases: readonly LegalCrease[],
    hidden: readonly string[],
  ): void;
  prepareFold(
    pieces: readonly MovingPiece[],
    axisStart: Point2,
    axisEnd: Point2,
  ): void;
  deformFold(angleRadians: number, progress: number): void;
  clearMovingPieces(): void;
  /** Keep legal creases pickable while reducing completed-model clutter. */
  setCreaseMode(mode: "active" | "complete"): void;
  showPreview(preview: FoldPreview, tone: FoldOrigin): void;
  clearPreview(): void;
  creaseLineFor(creaseId: string): THREE.Line | null;
  dispose(): void;
}

export const createSheetView = (): SheetView => {
  const root = new THREE.Group();
  const facetGroup = new THREE.Group();
  const movingGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  const creaseGroup = new THREE.Group();
  root.add(facetGroup, movingGroup, ghostGroup, creaseGroup);

  // Final-state facets composite in explicit layer order on one mathematical
  // plane. Depth is written for mountain folds, but never used to separate the
  // final paper into visible plates.
  const staticFront = new THREE.MeshStandardMaterial({
    color: PAPER_FRONT,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
    depthTest: false,
    depthWrite: true,
  });
  const staticBack = new THREE.MeshStandardMaterial({
    color: PAPER_BACK,
    roughness: 0.86,
    metalness: 0,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: true,
  });
  const movingFront = staticFront.clone();
  const movingBack = staticBack.clone();
  movingFront.depthTest = true;
  movingBack.depthTest = true;

  const creaseBase = new THREE.LineBasicMaterial({
    color: CREASE_COLOUR,
    transparent: true,
    opacity: ACTIVE_CREASE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });

  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const creaseLines = new Map<string, THREE.Line>();
  const curls: CurlEntry[] = [];
  let creaseOpacity = ACTIVE_CREASE_OPACITY;

  const releaseGroup = (group: THREE.Group): void => {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((node) => {
        const drawable = node as Partial<THREE.Mesh>;
        const geometry = drawable.geometry;
        if (
          geometry instanceof THREE.BufferGeometry &&
          ownedGeometries.delete(geometry)
        ) {
          geometry.dispose();
        }
        const material = drawable.material;
        if (
          material instanceof THREE.Material &&
          ownedMaterials.delete(material)
        ) {
          material.dispose();
        }
      });
    }
  };

  const addStaticFacet = (sheet: Sheet["facets"][number]): void => {
    const geometry = createPaperGeometry(sheet.polygon, sheet.faceUp);
    ownedGeometries.add(geometry);

    const front = new THREE.Mesh(geometry, staticFront);
    const back = new THREE.Mesh(geometry, staticBack);
    const order = STATIC_ORDER + sheet.layer * 2;
    front.position.y = SURFACE_Y;
    back.position.y = SURFACE_Y;
    front.renderOrder = order;
    back.renderOrder = order;
    facetGroup.add(front, back);
  };

  const ghostMaterial = (tone: FoldOrigin, solid: boolean): THREE.Material => {
    const material = new THREE.MeshBasicMaterial({
      color: tone === "person" ? PERSON_TONE : AGENT_TONE,
      transparent: true,
      opacity: solid ? 0.38 : 0.13,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    ownedMaterials.add(material);
    return material;
  };

  const addGhost = (
    pieces: readonly MovingPiece[],
    tone: FoldOrigin,
    solid: boolean,
    order: number,
  ): void => {
    const material = ghostMaterial(tone, solid);
    for (const piece of pieces) {
      const geometry = createPaperGeometry(piece.polygon, true);
      ownedGeometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = CREASE_LIFT;
      mesh.renderOrder = order;
      ghostGroup.add(mesh);
    }
  };

  return {
    root,
    creaseGroup,

    update: (sheet, creases, hidden) => {
      releaseGroup(facetGroup);
      releaseGroup(creaseGroup);
      creaseLines.clear();
      const skip = new Set(hidden);

      // Lowest first, highest last. Render order, not physical separation,
      // resolves overlap while disconnected regions remain on the same sheet.
      const ordered = [...sheet.facets].sort(
        (left, right) => left.layer - right.layer,
      );
      for (const facet of ordered) {
        if (!skip.has(facet.id)) addStaticFacet(facet);
      }

      for (const crease of creases) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(crease.start.x, CREASE_LIFT, crease.start.z),
          new THREE.Vector3(crease.end.x, CREASE_LIFT, crease.end.z),
        ]);
        ownedGeometries.add(geometry);
        const material = creaseBase.clone();
        material.opacity = creaseOpacity;
        ownedMaterials.add(material);
        const line = new THREE.Line(geometry, material);
        line.renderOrder = CREASE_ORDER;
        line.userData.creaseId = crease.id;
        line.userData.creaseLabel = crease.label;
        line.userData.restingOpacity = creaseOpacity;
        creaseGroup.add(line);
        creaseLines.set(crease.id, line);
      }
    },

    prepareFold: (pieces, axisStart, axisEnd) => {
      releaseGroup(movingGroup);
      curls.length = 0;

      for (const piece of pieces) {
        const curl = createCurlGeometry(
          piece.polygon,
          piece.faceUp,
          axisStart,
          axisEnd,
        );
        ownedGeometries.add(curl.geometry);
        const front = new THREE.Mesh(curl.geometry, movingFront);
        const back = new THREE.Mesh(curl.geometry, movingBack);
        front.renderOrder = MOVING_ORDER + piece.layer * 2;
        back.renderOrder = front.renderOrder;
        // Positions move every frame, so avoid stale bounding-sphere culling.
        front.frustumCulled = false;
        back.frustumCulled = false;
        movingGroup.add(front, back);
        curls.push({
          curl,
          axisStart,
          axisEnd,
          lift: piece.layer * ANIMATION_LAYER_GAP,
        });
      }
    },

    deformFold: (angleRadians, progress) => {
      for (const entry of curls) {
        deformCurl(
          entry.curl,
          entry.axisStart,
          entry.axisEnd,
          angleRadians,
          progress,
          entry.lift,
        );
      }
    },

    clearMovingPieces: () => {
      releaseGroup(movingGroup);
      curls.length = 0;
    },

    setCreaseMode: (mode) => {
      const nextOpacity =
        mode === "complete" ? COMPLETE_CREASE_OPACITY : ACTIVE_CREASE_OPACITY;

      if (nextOpacity === creaseOpacity) return;

      creaseOpacity = nextOpacity;
      creaseBase.opacity = nextOpacity;
      for (const line of creaseLines.values()) {
        line.userData.restingOpacity = nextOpacity;
        const material = line.material;
        if (material instanceof THREE.LineBasicMaterial) {
          material.opacity = nextOpacity;
        }
      }
    },

    showPreview: (preview, tone) => {
      releaseGroup(ghostGroup);
      addGhost(preview.from, tone, true, GHOST_ORDER + 1);
      addGhost(preview.to, tone, false, GHOST_ORDER);
    },

    clearPreview: () => releaseGroup(ghostGroup),
    creaseLineFor: (creaseId) => creaseLines.get(creaseId) ?? null,

    dispose: () => {
      releaseGroup(facetGroup);
      releaseGroup(movingGroup);
      releaseGroup(ghostGroup);
      releaseGroup(creaseGroup);
      creaseLines.clear();
      creaseBase.dispose();
      staticFront.dispose();
      staticBack.dispose();
      movingFront.dispose();
      movingBack.dispose();
      root.removeFromParent();
    },
  };
};
