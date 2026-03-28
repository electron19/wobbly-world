/**
 * Fizyka pojazdów — cannon-es RaycastVehicle.
 *
 * Rapier obsługuje: ziemię, budynki, drzewa, gracza.
 * cannon-es obsługuje: dynamikę pojazdów (zawieszenie, tarcie kół, obroty).
 *
 * Połączenie: lateUpdate() każdego auta synchronizuje pozycję
 * z cannon-es do Rapier kinematic body (kolizja gracza z autem).
 */

import * as CANNON from 'cannon-es';

// Stałe — muszą być spójne z Car.js
// Równowaga: ground(0.01) + WHEEL_R(0.40) + susp_eq(0.34) ≈ 0.75
export const CANNON_CHASSIS_OFFSET = 0.75;  // chassis center Y ponad root (ziemią)

export class VehiclePhysics {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0),
    });
    this.world.broadphase     = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction    = 0.4;
    this.world.defaultContactMaterial.restitution = 0.28;  // sprężyste uderzenia (0.1→0.28)

    // Płaska ziemia y=0.01 — wyrównana z wizualną drogą (Ground.js: road y=0.01)
    // Trawa jest na y=0, więc na trawie koła unosza się 1cm — niezauważalne
    const ground = new CANNON.Body({ mass: 0 });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.y = 0.01;
    this.world.addBody(ground);
  }

  /**
   * Tworzy chassis + RaycastVehicle dla jednego pojazdu.
   *
   * @param {number} x, y, z  pozycja spawnu (y=0 = na drodze)
   * @param {number} facing   obrót Y w radianach (0 = ku +Z)
   * @returns {{ vehicle: CANNON.RaycastVehicle, chassis: CANNON.Body }}
   */
  createVehicle(x, y, z, facing = 0) {
    const chassis = new CANNON.Body({
      mass:           2500,  // cięższa karoseria → więcej bezwładności
      angularDamping: 0.30,  // tłumienie obrotu — wyższe = mniej nadsterowności (było 0.12)
      linearDamping:  0.04,  // opór powietrza + toczenia ≈ 4% v/s (vs. 18% → ciągłe hamowanie)
    });

    // Pudło chassis — rozmiar odpowiada Car.js CAR_BOX_*
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(1.07, 0.45, 2.20)));

    // Spawn: lekko wyżej niż CANNON_CHASSIS_OFFSET żeby zawieszenie się ustabilizowało
    chassis.position.set(x, CANNON_CHASSIS_OFFSET + 0.1, z);
    chassis.quaternion.setFromEuler(0, facing, 0);
    chassis._material = 'metal';   // dźwięk zderzenia aut
    this.world.addBody(chassis);

    const vehicle = new CANNON.RaycastVehicle({
      chassisBody:      chassis,
      indexForwardAxis: 2,   // Z = przód pojazdu
      indexRightAxis:   0,   // X = prawa strona
      indexUpAxis:      1,   // Y = góra
    });

    const wheelOpts = {
      radius:               0.40,
      directionLocal:       new CANNON.Vec3(0, -1, 0),  // suspensja w dół
      axleLocal:            new CANNON.Vec3(-1, 0, 0),  // oś = -X
      suspensionRestLength: 0.45,   // dłuższy skok = miękkość jazdy
      suspensionStiffness:  36,     // miększe sprężyny → większe kołysanie, komfort
      maxSuspensionTravel:  0.28,   // więcej skoku → nie "odbija" na nierównościach
      maxSuspensionForce:   100000,
      dampingRelaxation:    2.4,    // wolniejszy powrót → "płynące" zawieszenie
      dampingCompression:   3.2,
      frictionSlip:         2.5,    // bazowa przyczepność (nadpisywana per koło w Car.js)
      rollInfluence:        0.01,   // minimalne wywracanie — auto nie przewraca się o krawężnik
    };

    // FL, FR, RL, RR — punkty przyłączenia zawieszenia do chassis
    // (y=0 = na poziomie center chassis → suspensja zwisa 0.30 w dół → koła na y=0.40)
    [
      new CANNON.Vec3(-1.12,  0,  1.52),
      new CANNON.Vec3( 1.12,  0,  1.52),
      new CANNON.Vec3(-1.12,  0, -1.52),
      new CANNON.Vec3( 1.12,  0, -1.52),
    ].forEach(pos => vehicle.addWheel({ ...wheelOpts, chassisConnectionPointLocal: pos }));

    vehicle.addToWorld(this.world);
    // frictionSlip ustawiany per-klatkę w Car.js (różny dla drogi/trawy)
    return { vehicle, chassis };
  }

  /**
   * Statyczny trimesh — dokładna kolizja ze stokiem wzgórza dla pojazdów.
   * Wierzchołki muszą być już w koordynatach świata (body siedzi w 0,0,0).
   */
  addStaticTrimesh(vertices, indices) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Trimesh(Array.from(vertices), Array.from(indices)));
    this.world.addBody(body);
  }

  /** Statyczny box (budynek, mur) — taki sam interfejs jak Rapier.addStaticBox */
  addStaticBox(x, y, z, hw, hh, hd, material = 'wall') {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hw, hh, hd)));
    body.position.set(x, y, z);
    body._material = material;
    this.world.addBody(body);
  }

  /** Statyczny cylinder (pień drzewa, słup) */
  addStaticCylinder(x, y, z, hh, r, material = 'wall') {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Cylinder(r, r, hh * 2, 8));
    body.position.set(x, y, z);
    body._material = material;
    this.world.addBody(body);
    return body;
  }

  /**
   * Dodaje Heightfield dla wzgórza do cannon-es — stabilniejszy od Trimesh przy dużych prędkościach.
   * @param {number} cx, cz  centrum wzgórza w world space
   * @param {number} radius  promień wzgórza
   * @param {number} height  wysokość szczytu
   * @param {number} sy      skala Y (dla nie-round wzgórz)
   */
  addHillHeightfield(cx, cz, radius, height, sy = 1) {
    const N    = 20;     // rozdzielczość siatki (20×20 punktów)
    const span = radius * 2 * 1.05;  // margines 5% poza promień
    const step = span / (N - 1);
    const data = [];

    for (let i = 0; i < N; i++) {
      const row = [];
      for (let j = 0; j < N; j++) {
        const lx = (i / (N - 1) - 0.5) * span;
        const lz = (j / (N - 1) - 0.5) * span;
        const r  = Math.sqrt(lx * lx + lz * lz) / radius;
        // Profil kosinusowy: h(r) = height × cos(r × π/2), zeruje się przy r=1
        row.push(r < 1 ? height * sy * Math.cos(r * Math.PI / 2) : 0);
      }
      data.push(row);
    }

    const hf = new CANNON.Heightfield(data, { elementSize: step });
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(hf);
    // Heightfield corner to (0,0) → przesuń żeby centrum było w (cx, cz)
    body.position.set(cx - span / 2, 0, cz - span / 2);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);  // Heightfield leży w XZ, obróć
    this.world.addBody(body);
  }

  /** Krok fizyki z sub-stepowaniem — lepsza detekcja kolizji przy wysokich prędkościach. */
  step(dt) {
    // fixedStep 1/120s + max 4 substepy = do 240 kroków/s przy 60fps
    // Eliminuje tunelowanie przez wzgórza i mury przy Vmax 260 km/h
    this.world.step(1 / 120, dt, 4);
  }
}
