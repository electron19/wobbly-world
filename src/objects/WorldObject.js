import * as THREE from 'three';

/**
 * Bazowa klasa dla STATYCZNYCH obiektów świata: budynki, drzewa, meble, dekoracje.
 *
 * Każdy obiekt ma:
 *   - this.root    — THREE.Group (kontener visual)
 *   - this._bodies — tablica statycznych Rapier RigidBody
 *
 * Wzorzec użycia:
 *   const house = new House(scene, physics, config).placeAt(x, y, z);
 *
 * Geometria Three.js jest w przestrzeni LOKALNEJ (relative to root).
 * Ciała Rapier są w przestrzeni GLOBALNEJ (world coords).
 *
 * TODO (przyszłość):
 *   - Metoda loadGLTF(url) do ładowania modeli .glb zamiast procedural geo
 *   - Zone.js — abstrakcja dla stref (exterior/interior)
 *   - Drzwi jako trigger (Rapier sensor collider) → transition do interior zone
 */
export class WorldObject {
  constructor(scene, physics) {
    this.scene   = scene;
    this.physics = physics;
    this.root    = new THREE.Group();
    this._bodies = []; // Rapier static RigidBodies
    this.scene.add(this.root);
  }

  /**
   * Ustaw pozycję obiektu i zbuduj geometrię + kolizje.
   * Subklasy mogą nadpisać (zawsze wywołaj super.placeAt(x,y,z)).
   * @returns {this} dla chainingu
   */
  placeAt(x, y, z) {
    this.root.position.set(x, y, z);
    return this;
  }

  dispose() {
    this.scene.remove(this.root);
    // TODO: usunąć Rapier bodies (world.removeRigidBody) gdy potrzeba dynamic unload
  }
}
