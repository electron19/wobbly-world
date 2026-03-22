import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

/**
 * Abstrakcyjna baza dla wszystkich budynków.
 *
 * Subklasy implementują _buildGeometry() — tu definiują wygląd.
 * Kolizje są dodawane automatycznie w _buildColliders() lub nadpisane.
 *
 * Cykl tworzenia:
 *   new House(scene, physics, cfg).placeAt(x, y, z)
 *   → placeAt ustawia root.position
 *   → wywołuje _buildGeometry() (local space meshes)
 *   → wywołuje _buildColliders(wx,wy,wz) (world space Rapier)
 *
 * PRZYSZŁOŚĆ: wnętrze budynku jako osobna Zone:
 *   - Drzwi = Rapier sensor collider (isSensor: true)
 *   - Dotknięcie sensora → game.loadZone(new HouseInterior(this))
 *   - Interior definiuje własne ściany, meble, kolizje
 */
export class Building extends WorldObject {
  constructor(scene, physics, cfg = {}) {
    super(scene, physics);
    this.cfg = {
      w:         6,
      h:         4,
      d:         8,
      wallColor: C.wall,
      roofColor: C.roof,
      doorColor: C.door,
      winColor:  C.window,
      ...cfg,
    };
  }

  // ─── Pomocniki dla subklas ─────────────────────────────────────────────────

  /**
   * Dodaj box mesh do root (local space).
   * @param {Object} opts  { cast, receive, outline }
   */
  _box(x, y, z, w, h, d, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = opts.cast    ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    if (opts.outline !== false) addOutline(mesh, opts.outline ?? 0.03);
    this.root.add(mesh);
    return mesh;
  }

  /** Dodaj dach w kształcie piramidy (4-boczna). */
  _roof(localX, localY, localZ, w, h, mat) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0, w * 0.72, h, 4),
      mat
    );
    mesh.position.set(localX, localY, localZ);
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Dodaj statyczny box Rapier w world coords. */
  _addPhysicsBox(wx, wy, wz, hw, hh, hd) {
    const body = this.physics.addStaticBox(wx, wy, wz, hw, hh, hd);
    this._bodies.push(body);
    return body;
  }

  // ─── Cykl tworzenia ────────────────────────────────────────────────────────

  /** Subklasy nadpisują: dodają meshy do this.root */
  _buildGeometry() {}

  /**
   * Domyślne kolizje: jeden box na cały budynek.
   * Subklasy mogą nadpisać (np. osobne ściany dla wnętrz).
   */
  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    this._addPhysicsBox(wx, wy + h / 2, wz, w / 2, h / 2, d / 2);
  }

  /** Ustaw pozycję + zbuduj geometrię + kolizje */
  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    this._buildGeometry();
    this._buildColliders(x, y, z);
    return this;
  }
}
