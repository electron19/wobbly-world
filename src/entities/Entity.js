import * as THREE from 'three';

/**
 * Bazowa klasa dla DYNAMICZNYCH obiektów: gracz, NPC, pojazdy.
 *
 * Każda encja ma:
 *   - this.root  — THREE.Group (pozycja wizualna)
 *   - this._body — Rapier RigidBody (pozycja fizyczna)
 *
 * Cykl na klatkę:
 *   1. entity.update(dt, input, camera, physics)  — oblicz ruch, ustaw nextKinematicTranslation
 *   2. physics.step(dt)                           — Rapier przesuwa ciała
 *   3. entity.lateUpdate()                        — sync visual z physics
 */
export class Entity {
  constructor(scene) {
    this.scene     = scene;
    this.root      = new THREE.Group();
    this._body     = null;
    this._collider = null;
    this.scene.add(this.root);
  }

  /** Przypisz Rapier body i collider po stworzeniu */
  setPhysicsBody(body, collider) {
    this._body     = body;
    this._collider = collider;
  }

  /**
   * Synchronizuje root.position z pozycji Rapier body.
   * @param {number} offsetY odsunięcie Y (np. aby foot był na ziemi, a nie środek kapsuły)
   */
  _syncFromBody(offsetY = 0) {
    if (!this._body) return;
    const t = this._body.translation();
    this.root.position.set(t.x, t.y + offsetY, t.z);
  }

  // Subklasy implementują:
  update(dt, input, camera, physics) {}
  lateUpdate() {}

  dispose() {
    this.scene.remove(this.root);
  }
}
