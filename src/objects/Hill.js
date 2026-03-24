import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat }    from '../core/Materials.js';

/**
 * Wzgórze — wizualna geometria z dokładną fizyką trimesh (Rapier).
 *
 * shape: 'round'   — łagodna półsfera (domyślna)
 *        'pointed' — szpiczasty stożek
 *        'ridge'   — podłużny grzbiet (scaleX >> scaleZ)
 *        'mesa'    — płaski płaskowyż (ścięty stożek)
 */
export class Hill extends WorldObject {
  constructor(scene, physics, opts = {}, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this.cfg = {
      radius: 8,
      height: 3,
      color:  0x5aaa35,
      shape:  'round',
      ...opts,
    };
  }

  placeAt(x, y, z) {
    this.root.position.set(x, y, z);
    this._build(x, y, z);
    return this;
  }

  _build(wx, wy, wz) {
    const { radius, height, color, shape } = this.cfg;

    // ── Geometria + transformacja per kształt ─────────────────────────────
    let geo, offsetY, sx, sy, sz;

    switch (shape) {
      case 'pointed': {
        // Wąski wysoki stożek — szpiczaste góry
        const r = radius * 0.50;
        const h = height * 1.85;
        geo     = new THREE.ConeGeometry(r, h, 24);
        offsetY = h / 2;       // przesuń tak żeby podstawa była na y=0
        sx = sz = sy = 1;
        break;
      }
      case 'ridge': {
        // Podłużny grzbiet — półsfera rozciągnięta w X, wąska w Z
        geo     = new THREE.SphereGeometry(radius, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        offsetY = 0;
        sx = 2.0;
        sy = height / radius;
        sz = 0.60;
        break;
      }
      case 'mesa': {
        // Płaskowyż — ścięty stożek z płaskim szczytem
        geo     = new THREE.CylinderGeometry(radius * 0.42, radius, height, 24);
        offsetY = height / 2;  // podstawa na y=0
        sx = sz = sy = 1;
        break;
      }
      default: { // 'round'
        geo     = new THREE.SphereGeometry(radius, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
        offsetY = 0;
        sx = sz = 1;
        sy = height / radius;
      }
    }

    // ── Visual mesh ───────────────────────────────────────────────────────
    const mesh = new THREE.Mesh(geo, toonMat(color));
    mesh.position.y = offsetY;
    mesh.scale.set(sx, sy, sz);
    mesh.receiveShadow = true;
    this.root.add(mesh);

    // ── Physics: trimesh z wbudowaną transformacją (T × S) ────────────────
    const physGeo = geo.clone();
    const tMat = new THREE.Matrix4().makeTranslation(0, offsetY, 0);
    const sMat = new THREE.Matrix4().makeScale(sx, sy, sz);
    physGeo.applyMatrix4(tMat.multiply(sMat));   // T × S applied to each vertex

    const src   = physGeo.attributes.position.array;
    const verts = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      verts[i]     = src[i]     + wx;
      verts[i + 1] = src[i + 1] + wy;
      verts[i + 2] = src[i + 2] + wz;
    }
    const indices = new Uint32Array(physGeo.index.array);
    this._bodies.push(this.physics.addStaticTrimesh(verts, indices));

    // ── Cannon-es: box aproksymacja dla pojazdów ──────────────────────────
    if (this.vehiclePhysics) {
      this.vehiclePhysics.addStaticBox(
        wx, wy + height * 0.3, wz,
        radius * sx * 0.5, height * 0.4, radius * sz * 0.5, 'ground',
      );
    }
  }
}
