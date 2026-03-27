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
    this.world.defaultContactMaterial.restitution = 0.1;

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
      angularDamping: 0.40,  // mniejsze tłumienie → tylny koniec może wychodzić (oversteer)
      linearDamping:  0.18,  // opór toczenia — auto zwalnia bez gazu (bez blokowania kół)
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
      suspensionRestLength: 0.42,   // dłuższy skok = miękkość jazdy
      suspensionStiffness:  52,     // miększe sprężyny → kołysanie na nierównościach
      maxSuspensionTravel:  0.22,
      maxSuspensionForce:   100000,
      dampingRelaxation:    3.2,    // wolniejszy powrót → "płynące" zawieszenie
      dampingCompression:   4.0,
      frictionSlip:         1.9,    // bazowa przyczepność (nadpisywana per koło poniżej)
      rollInfluence:        0.03,   // prawie zerowe wywracanie
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
  }

  /** Krok fizyki — stały krok 1/60 s niezależnie od dt klatki. */
  step(_dt) {
    this.world.step(1 / 60);
  }
}
