import { Ground }     from '../objects/Ground.js';
import { House }      from '../objects/House.js';
import { Tree }       from '../objects/Tree.js';
import { StreetLamp } from '../objects/StreetLamp.js';

/**
 * Buduje exterior (scenę startową) — umieszcza wszystkie obiekty w świecie.
 *
 * ─── ARCHITEKTURA STREF (roadmap) ────────────────────────────────────────────
 * Każda lokacja to Zone z metodami load() / unload():
 *
 *   class ExteriorZone extends Zone { ... }    ← ten plik
 *   class HouseInterior extends Zone { ... }   ← osobny plik per budynek
 *
 * Wejście do budynku:
 *   1. Drzwi = Rapier sensor collider (ColliderDesc.cuboid(...).setSensor(true))
 *   2. Game sprawdza kolizje z sensorami co klatkę
 *   3. Dotknięcie sensora → game.transitionTo(new HouseInterior(building))
 *   4. Interior definiuje: inne ściany, meble, wyjście, własny spawn gracza
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class WorldBuilder {
  constructor(scene, physics) {
    this.scene   = scene;
    this.physics = physics;
    this._objects = [];
  }

  build() {
    this._addGround();
    this._addHouses();
    this._addTrees();
    this._addStreetLamps();
    return this;
  }

  _add(obj) {
    this._objects.push(obj);
    return obj;
  }

  _addGround() {
    this._add(new Ground(this.scene, this.physics));
  }

  _addHouses() {
    const houses = [
      { x: -15, z: -12, cfg: { wallColor: 0xFFF5D0, roofColor: 0xE07030 } },
      { x:  15, z: -12, cfg: { wallColor: 0xD0EFD0, roofColor: 0x409040 } },
      { x: -15, z:  12, cfg: { wallColor: 0xD0E8FF, roofColor: 0x4060A0 } },
      { x:  15, z:  12, cfg: { wallColor: 0xFFD0D0, roofColor: 0xA04040 } },
      { x:   0, z: -22, cfg: { wallColor: 0xFFF0FF, roofColor: 0x804080, w: 10, h: 5, d: 10 } },
      { x:   0, z:  22, cfg: { wallColor: 0xFFFAE0, roofColor: 0x704820, w: 8,  h: 5, d: 9  } },
      { x: -26, z:   0, cfg: { wallColor: 0xE8F8E8, roofColor: 0x306030, w: 7,  h: 4, d: 9  } },
      { x:  26, z:   0, cfg: { wallColor: 0xF8E8E8, roofColor: 0x903030, w: 7,  h: 4, d: 9  } },
    ];
    houses.forEach(({ x, z, cfg }) => {
      this._add(new House(this.scene, this.physics, cfg).placeAt(x, 0, z));
    });
  }

  _addTrees() {
    const positions = [
      [-5, -5], [5, -5], [-5, 5], [5, 5],
      [-9, 0], [9, 0], [0, 9], [0, -9],
      [-18, 8], [18, 8], [-18, -8], [18, -8],
      [-3, 16], [3, 16], [7, 16], [-7, 16],
      [-3, -16], [3, -16],
      [-20, 18], [20, 18], [-20, -18], [20, -18],
    ];
    positions.forEach(([x, z]) => {
      const scale = 0.7 + Math.random() * 0.6;
      this._add(
        new Tree(this.scene, this.physics, {
          trunkH:  1.5 * scale,
          leavesR: scale,
        }).placeAt(x, 0, z)
      );
    });
  }

  _addStreetLamps() {
    // [x, z, rotY]
    const lamps = [
      [ 4, -16,  0],
      [-4, -16,  Math.PI],
      [ 4,  16,  0],
      [-4,  16,  Math.PI],
      [-16,  4,  Math.PI / 2],
      [-16, -4, -Math.PI / 2],
      [ 16,  4,  Math.PI / 2],
      [ 16, -4, -Math.PI / 2],
    ];
    lamps.forEach(([x, z, rotY]) => {
      this._add(new StreetLamp(this.scene, this.physics).placeAt(x, 0, z, rotY));
    });
  }
}
