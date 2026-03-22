import * as THREE from 'three';

// ─── Shared toon gradient (4-step: shadow → mid → highlight) ─────────────────
const _gradData = new Uint8Array([0, 80, 180, 255]);
const _toonGrad = new THREE.DataTexture(_gradData, 4, 1, THREE.RedFormat);
_toonGrad.minFilter = _toonGrad.magFilter = THREE.NearestFilter;
_toonGrad.needsUpdate = true;

/**
 * Tworzy MeshToonMaterial z globalnym gradientem.
 * @param {number} color hex color
 */
export function toonMat(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: _toonGrad });
}

/**
 * Dodaje czarny outline do meshu (technika BackSide).
 * @param {THREE.Mesh} mesh
 * @param {number} t grubość (domyślnie 0.05)
 */
export function addOutline(mesh, t = 0.05) {
  const ol = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide })
  );
  ol.scale.setScalar(1 + t);
  mesh.add(ol);
}

// ─── Paleta kolorów gry ───────────────────────────────────────────────────────
export const C = {
  // Postać
  skin:      0xFF6B9D,
  pants:     0x5B6EE1,
  shoes:     0x2C2C2C,
  // Natura
  grass:     0x5a9e35,
  bark:      0x8B5E3C,
  leaves:    0x4A8C3F,
  // Teren
  road:      0x888888,
  sidewalk:  0xCCBFA0,
  // Budynki (domyślne)
  wall:      0xF5E6C8,
  roof:      0xE07030,
  door:      0x7B4F2E,
  window:    0x9DD3F5,
  // Misc
  white:     0xFFFFFF,
  lamp:      0xFFF0A0,
  metal:     0x8899AA,
  fountain:  0x6BBDE0,
};
