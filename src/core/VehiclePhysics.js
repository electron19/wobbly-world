/**
 * Vehicle physics — Rapier DynamicRayCastVehicleController.
 *
 * All objects (car, player, buildings, hills) share one Rapier world,
 * so car collisions with the environment are natural — no duplicate
 * static bodies and no kinematic ghost body sync needed.
 *
 * Physics design (g = -20 m/s², mass = 1500 kg):
 *   Weight per wheel = 1500 × 20 / 4 = 7 500 N
 *   Target static compression ≈ 0.20 m  →  k = 7500 / 0.20 = 37 500 ≈ 38 000 N/m
 *   Chassis rest height ≈ 0.85 − 7500/38000 ≈ 0.65 m  (wheels flush with road)
 *   Damping (quarter-car, m_eff = 375 kg):
 *     c_crit = 2√(k·m) = 2√(38000·375) ≈ 7 550 N·s/m
 *     compression ζ ≈ 0.29  →  c = 2 200 N·s/m
 *     relaxation  ζ ≈ 0.24  →  c = 1 800 N·s/m
 */

import { getRapier } from './Physics.js';

// Chassis center Y above road level — spawn point; spring settles to ~0.65 at rest.
export const CHASSIS_OFFSET_Y = 0.75;

export class VehiclePhysics {
  /**
   * Creates a dynamic Rapier chassis + DynamicRayCastVehicleController.
   *
   * @param {RAPIER.World} rapierWorld  shared physics world (from PhysicsWorld)
   * @param {number} x, y, z           spawn position (y = road level, ignored)
   * @param {number} facing            initial Y-rotation in radians
   * @returns {{ vehicle: VehicleController, chassis: RigidBody }}
   */
  createVehicle(rapierWorld, x, y, z, facing = 0) {
    const R = getRapier();

    // Dynamic chassis
    const chassisDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, CHASSIS_OFFSET_Y + 0.1, z)
      .setLinearDamping(0.03)
      .setAngularDamping(0.18);

    const chassis = rapierWorld.createRigidBody(chassisDesc);

    // Apply initial heading rotation (Y-axis quaternion)
    if (facing !== 0) {
      chassis.setRotation(
        { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) },
        true,
      );
    }

    // Chassis box collider — matches Car.js CAR_BOX_* visual dimensions
    // CollisionGroups 0x0002FFFF: chassis is in group 2.
    // Wheel raycasts use filterGroups 0x0001FFFD (exclude group 2),
    // so wheel rays never hit other car chassis bodies.
    rapierWorld.createCollider(
      R.ColliderDesc.cuboid(1.07, 0.45, 2.20)
        .setMass(1500)
        .setFriction(0.0)   // 0 = chassis slides freely; traction comes from wheel frictionSlip only
        .setRestitution(0.0)
        .setCollisionGroups(0x0002FFFF),
      chassis,
    );

    // DynamicRayCastVehicleController — attached to the chassis body
    const vehicle = rapierWorld.createVehicleController(chassis);
    vehicle.indexUpAxis = 1;   // Y = up (default, but explicit)
    // indexForwardAxis = 2 (Z = forward) is the Rapier default

    // Wheel attachment points (local chassis space): FL, FR, RL, RR
    const positions = [
      { x: -1.12, y: 0, z:  1.52 }, // FL
      { x:  1.12, y: 0, z:  1.52 }, // FR
      { x: -1.12, y: 0, z: -1.52 }, // RL
      { x:  1.12, y: 0, z: -1.52 }, // RR
    ];

    for (const pos of positions) {
      vehicle.addWheel(
        pos,                      // chassisConnectionPointCs
        { x: 0, y: -1, z: 0 },   // direction (down)
        { x: -1, y: 0, z: 0 },   // axle (-X)
        0.45,                     // suspensionRestLength
        0.40,                     // wheelRadius
      );
    }

    // Suspension & friction tuning
    // k = 38 000 N/m: correctly supports 1500 kg at g=20 with ~0.20 m static deflection.
    // Previous k=24 provided <14 N per wheel — chassis rested on floor collider, not springs.
    for (let i = 0; i < 4; i++) {
      vehicle.setWheelSuspensionStiffness(i,  38000);
      vehicle.setWheelSuspensionCompression(i, 2200);
      vehicle.setWheelSuspensionRelaxation(i,  1800);
      vehicle.setWheelMaxSuspensionTravel(i,    0.40);
      vehicle.setWheelMaxSuspensionForce(i,    40000);
      vehicle.setWheelFrictionSlip(i,            2.0);
      vehicle.setWheelSideFrictionStiffness(i,   0.8);
    }

    return { vehicle, chassis };
  }

  // ── No-ops — static colliders are already in the shared Rapier world ──────
  // WorldBuilder / building objects still call these; they are harmless here.

  addStaticBox()       {}
  addStaticTrimesh()   {}
  addStaticCylinder()  {}
  addHillHeightfield() {}

  /** No-op — vehicles are now stepped via updateVehicle() inside Car.update(). */
  step() {}
}
