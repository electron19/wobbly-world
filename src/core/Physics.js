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
  R = await import('../../lib/rapier3d-compat.mjs');
  await R.init();
}

/** Returns the initialised Rapier module (call after initRapier()). */
export function getRapier() { return R; }

export class PhysicsWorld {
  constructor() {
    if (!R) throw new Error('Najpierw wywołaj initRapier()');

    // ── Grawitacja światowa ──────────────────────────────────────────────────
    // g = -20 m/s²: 2× ziemska — daje snappier game feel przy zachowaniu
    // realistycznych proporcji sił. Wszystkie dynamiczne ciała (samochód) podlegają tej wartości.
    // Gracz używa własnej ręcznej grawitacji (Player.js GRAVITY=20) dla niezależnej kontroli.
    this.world = new R.World({ x: 0, y: -20, z: 0 });

    // ── Character Controller ─────────────────────────────────────────────────
    // Steruje kapsułą gracza: detekcja kolizji, automatyczne wchodzenie na stopnie,
    // ślizganie się po zboczach, przyciąganie do podłoża.
    this._cc = this.world.createCharacterController(0.02); // 0.02 = gap od koliderów (poprz. 0.01 dawało utknięcia)
    this._cc.setSlideEnabled(true);
    this._cc.setMaxSlopeClimbAngle(40 * Math.PI / 180);  // maks wspinaczka 40° (poprz. 45° — za strome)
    this._cc.setMinSlopeSlideAngle(35 * Math.PI / 180);  // ślizganie od 35° (poprz. 30°)
    this._cc.enableAutostep(0.35, 0.15, true);           // krawężnik max 0.35m (poprz. 0.5m było za wysokie)
    this._cc.enableSnapToGround(0.4);                    // snapDistance 0.4m (poprz. 0.3m — rzadziej odpada od stopni)
    this._cc.setApplyImpulsesToDynamicBodies(true);
  }

  // ─── Fabryki ciał statycznych ─────────────────────────────────────────────

  /**
   * Statyczny prostopadłościan (ściany, podłoga, bloki).
   * friction=0: napęd/hamowanie kół kontroluje frictionSlip w VehicleController,
   * nie tarcie koliderów. Zero tarcia zapobiega "kleistości" chassis przy kontakcie
   * z krawędziami chodników, co powodowało phantom braking.
   */
  addStaticBox(x, y, z, hw, hh, hd) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z)
    );
    this.world.createCollider(R.ColliderDesc.cuboid(hw, hh, hd).setFriction(0), body);
    return body;
  }

  /** Statyczny trimesh — dokładna kolizja z geometrią siatki (wzgórza itp.) */
  addStaticTrimesh(vertices, indices) {
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.trimesh(vertices, indices).setFriction(0), body);
    return body;
  }

  /** Statyczny prostopadłościan z rotacją Y — dla ścian obracanych budynków. */
  addStaticBoxRotated(x, y, z, hw, hh, hd, rotY = 0) {
    const sinH = Math.sin(rotY / 2), cosH = Math.cos(rotY / 2);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation({ x: 0, y: sinH, z: 0, w: cosH })
    );
    this.world.createCollider(R.ColliderDesc.cuboid(hw, hh, hd).setFriction(0), body);
    return body;
  }

  /** Statyczny cylinder (pnie drzew, słupy, poręcze) */
  addStaticCylinder(x, y, z, hh, r) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z)
    );
    this.world.createCollider(R.ColliderDesc.cylinder(hh, r).setFriction(0), body);
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

  step(dt) {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }
}
