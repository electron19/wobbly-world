/**
 * Warstwa abstrakcji nad Rapier3D.
 *
 * Rapier to silnik fizyczny napisany w Rust, skompilowany do WASM.
 * rapier3d-compat zawiera WASM inline (base64) — działa bez serwera WASM.
 *
 * Użycie:
 *   await initRapier();          // jednorazowo na starcie
 *   const physics = new PhysicsWorld();
 *   physics.addStaticBox(...)
 *   physics.step(dt)
 */

let R = null; // Rapier module

export async function initRapier() {
  R = await import('/lib/rapier3d-compat.mjs');
  await R.init();
}

export class PhysicsWorld {
  constructor() {
    if (!R) throw new Error('Najpierw wywołaj initRapier()');

    this.world = new R.World({ x: 0, y: -20, z: 0 });

    // Character Controller — obsługuje kolizje, autostep, ślizganie po zboczach
    this._cc = this.world.createCharacterController(0.01); // 0.01 = gap od koliderów
    this._cc.setSlideEnabled(true);
    this._cc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    this._cc.setMinSlopeSlideAngle(30 * Math.PI / 180);
    this._cc.enableAutostep(0.5, 0.2, true);   // maxHeight, minWidth, includeDynamic
    this._cc.enableSnapToGround(0.3);           // snapDistance
    this._cc.setApplyImpulsesToDynamicBodies(true);
  }

  // ─── Fabryki ciał statycznych ─────────────────────────────────────────────

  /** Statyczny prostopadłościan (ściany, podłoga, bloki) */
  addStaticBox(x, y, z, hw, hh, hd) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z)
    );
    this.world.createCollider(R.ColliderDesc.cuboid(hw, hh, hd), body);
    return body;
  }

  /** Statyczny trimesh — dokładna kolizja z geometrią siatki (wzgórza itp.) */
  addStaticTrimesh(vertices, indices) {
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.trimesh(vertices, indices), body);
    return body;
  }

  /** Statyczny cylinder (pnie drzew, słupy, poręcze) */
  addStaticCylinder(x, y, z, hh, r) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z)
    );
    this.world.createCollider(R.ColliderDesc.cylinder(hh, r), body);
    return body;
  }

  // ─── Gracz ────────────────────────────────────────────────────────────────

  /**
   * Tworzy kinematic capsule dla gracza.
   * Zwraca { body, collider }.
   *
   * Wymiary: totalHeight = hh*2 + r*2 = 0.8 + 0.6 = 1.4 jednostki
   */
  addPlayerCapsule(x, y, z, hh = 0.4, r = 0.3) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
    );
    const collider = this.world.createCollider(R.ColliderDesc.capsule(hh, r), body);
    return { body, collider };
  }

  /**
   * Przesuń gracza z pełnym collision detection.
   * Wywołaj PRZED physics.step().
   *
   * @param {RigidBody} body    kinematic body gracza
   * @param {Collider} collider kapsuła gracza
   * @param {{ x, y, z }} desired żądane przesunięcie w tej klatce
   * @returns {{ grounded: boolean }}
   */
  movePlayer(body, collider, desired) {
    this._cc.computeColliderMovement(collider, desired);
    const mv  = this._cc.computedMovement();
    const pos = body.translation();
    body.setNextKinematicTranslation({
      x: pos.x + mv.x,
      y: pos.y + mv.y,
      z: pos.z + mv.z,
    });
    return { grounded: this._cc.computedGrounded() };
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────

  // ─── Pojazdy ──────────────────────────────────────────────────────────────

  /**
   * Kinematyczny pojazd — dwa collidery na jednym body:
   *   1. Dolny kadłub (body + maska + bagażnik)
   *   2. Górna kabina + dach — gracz może stanąć na masce / dachu
   * Zwraca { body }.
   */
  addVehicleBox(x, y, z, hw, hh, hd) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
    );
    // Dolny kadłub
    this.world.createCollider(R.ColliderDesc.cuboid(hw, hh, hd), body);
    // Kabina + dach: środek y = +0.87 nad centrum podwozia (chassis center y=0.75)
    // Pokrywa wizualną kabinę (y≈1.22–2.00) + margines
    const cabinDesc = R.ColliderDesc.cuboid(0.92, 0.42, 1.32);
    cabinDesc.setTranslation(0, 0.87, 0);
    this.world.createCollider(cabinDesc, body);
    return { body };
  }

  /**
   * Tworzy CharacterController dla pojazdu.
   * Każde auto ma swój własny CC (inne ustawienia niż gracz).
   */
  createVehicleCC() {
    const cc = this.world.createCharacterController(0.01);
    cc.setSlideEnabled(true);
    cc.setMaxSlopeClimbAngle(18 * Math.PI / 180);  // auta nie wspinają się
    cc.setMinSlopeSlideAngle(12 * Math.PI / 180);
    cc.enableAutostep(0.15, 0.25, false);           // mały skok na krawężnik
    cc.enableSnapToGround(0.25);                    // trzyma auto przy ziemi
    cc.setApplyImpulsesToDynamicBodies(true);
    return cc;
  }

  /**
   * Przesuwa pojazd przez Rapier z collision detection.
   * Analogiczne do movePlayer() — używaj PRZED physics.step().
   *
   * @returns {{ movement: {x,y,z}, grounded: boolean }}
   */
  moveVehicle(cc, body, collider, desired) {
    cc.computeColliderMovement(collider, desired);
    const mv  = cc.computedMovement();
    const pos = body.translation();
    body.setNextKinematicTranslation({
      x: pos.x + mv.x,
      y: pos.y + mv.y,
      z: pos.z + mv.z,
    });
    return { movement: mv, grounded: cc.computedGrounded() };
  }

  step(dt) {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
