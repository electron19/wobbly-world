import { Ground }     from '../objects/Ground.js';
import { House }      from '../objects/House.js';
import { Tree }       from '../objects/Tree.js';
import { StreetLamp } from '../objects/StreetLamp.js';
import { Car }        from '../entities/Car.js';

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
    this.scene    = scene;
    this.physics  = physics;
    this._objects = [];
    this.cars     = []; // dostępne z zewnątrz dla Game.js
  }

  build() {
    this._addGround();
    this._addHouses();
    this._addTrees();
    this._addStreetLamps();
    this._addCars();
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
    // Droga przebiega wzdłuż x=0 (N-S) i z=0 (E-W).
    // Wszystkie domy muszą być poza pasem drogi + chodnika (±5 od osi).
    const houses = [
      // Ćwiartka NW
      { x: -15, z: -12, cfg: { wallColor: 0xFFF5D0, roofColor: 0xE07030 } },
      { x: -22, z: -20, cfg: { wallColor: 0xFFF0FF, roofColor: 0x804080, w: 8, h: 5, d: 9 } },
      // Ćwiartka NE
      { x:  15, z: -12, cfg: { wallColor: 0xD0EFD0, roofColor: 0x409040 } },
      { x:  22, z: -20, cfg: { wallColor: 0xFFFAE0, roofColor: 0x704820, w: 8, h: 5, d: 9 } },
      // Ćwiartka SW
      { x: -15, z:  12, cfg: { wallColor: 0xD0E8FF, roofColor: 0x4060A0 } },
      { x: -22, z:  20, cfg: { wallColor: 0xE8F8E8, roofColor: 0x306030, w: 7, h: 4, d: 9 } },
      // Ćwiartka SE
      { x:  15, z:  12, cfg: { wallColor: 0xFFD0D0, roofColor: 0xA04040 } },
      { x:  22, z:  20, cfg: { wallColor: 0xF8E8E8, roofColor: 0x903030, w: 7, h: 4, d: 9 } },
    ];
    houses.forEach(({ x, z, cfg }) => {
      this._add(new House(this.scene, this.physics, cfg).placeAt(x, 0, z));
    });
  }

  _addTrees() {
    // Droga: |x| < 3 lub |z| < 3  (chodnik do ±4.25)
    // Drzewa TYLKO na trawnikach — każde z |x| > 5 ORAZ |z| > 5
    const positions = [
      // Ćwiartka NW (x < 0, z < 0)
      [ -8,  -8], [-13,  -8], [ -8, -15], [-13, -15], [-20, -10],
      // Ćwiartka NE (x > 0, z < 0)
      [  8,  -8], [ 13,  -8], [  8, -15], [ 13, -15], [ 20, -10],
      // Ćwiartka SW (x < 0, z > 0)
      [ -8,   8], [-13,   8], [ -8,  15], [-13,  15], [-20,  10],
      // Ćwiartka SE (x > 0, z > 0)
      [  8,   8], [ 13,   8], [  8,  15], [ 13,  15], [ 20,  10],
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

  _addCars() {
    // Samochody zaparkowane przy krawężnikach (nie na środku drogi)
    const defs = [
      { x: -2,  z: 26,  facing: 0,              color: 0xFF4444 }, // blisko spawnu gracza
      { x:  2,  z: 18,  facing: Math.PI,        color: 0x4488FF }, // naprzeciw
      { x: 18,  z: -2,  facing: -Math.PI / 2,  color: 0x44CC44 }, // E-W road
      { x: -18, z:  2,  facing:  Math.PI / 2,  color: 0xFFAA00 }, // E-W road, drugi kierunek
    ];
    defs.forEach(({ x, z, facing, color }) => {
      const car = new Car(this.scene, color);
      car.facing = facing;
      car.root.rotation.y = facing;
      car.initPhysics(this.physics, x, 0, z);
      this.cars.push(car);
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
