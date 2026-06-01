/**
 * Vehicle physics — Rapier DynamicRayCastVehicleController.
 *
 * All objects (car, player, buildings, hills) share one Rapier world,
 * so car collisions with the environment are natural — no duplicate
 * static bodies and no kinematic ghost body sync needed.
 *
 * Physics design (g = -20 m/s², mass = 1500 kg, standard formula: F = k × compression):
 *   Weight per wheel = 1500 × 20 / 4 = 7 500 N
 *   k = 38 000 N/m: c_eq = 7500 / 38000 = 0.197 m (static compression)
 *   Chassis height at rest = wheel_radius + rest_length − c_eq = 0.40 + 0.45 − 0.197 = 0.653 m
 *   → spawn at 0.65 m = equilibrium → no initial fall, no bounce
 *   Damping (quarter-car, m_eff = 375 kg):
 *     c_crit = 2√(k·m_eff) = 2√(38000·375) = 7 550 N·s/m
 *     compression ζ = 15000/7550 = 1.99 — heavily overdamped: absorbs bounce
 *     relaxation  ζ =  8000/7550 = 1.06 — near-critical: smooth rebound
 */

import { getRapier } from './Physics.js';

// Chassis center Y above road level — spawn and recovery reference.
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

    // Dynamic chassis — spawn at spring equilibrium to avoid initial fall/bounce.
    // F = k × compression (standard, N/m × m = N)
    // c_eq = weight_per_wheel / k = (1500×20/4) / 38000 = 7500 / 38000 = 0.197 m
    // chassis_Y = wheel_radius + rest_length − c_eq = 0.40 + 0.45 − 0.197 = 0.653 m
    // Spawn at 0.655 m (+ 0.002 m tiny buffer) → springs at equilibrium → no fall.
    const chassisDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.655, z)
      .setLinearDamping(0.03)
      .setAngularDamping(0.80);  // silne tłumienie rotacji chassis (zapobiega wirowaniu)

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
    // k = 38 000 N/m: c_eq = 0.197 m → chassis at 0.653 m on flat ground
    // Damping: c_crit = 2√(38000×375) = 7 550 N·s/m
    //   compression ζ = 15000/7550 = 1.99 — heavily overdamped: zero bounce on landing
    //   relaxation  ζ =  8000/7550 = 1.06 — near-critical: smooth rebound, no oscillation
    for (let i = 0; i < 4; i++) {
      vehicle.setWheelSuspensionStiffness(i,  38000);
      vehicle.setWheelSuspensionCompression(i, 15000);
      vehicle.setWheelSuspensionRelaxation(i,   8000);
      vehicle.setWheelMaxSuspensionTravel(i,    0.45);
      vehicle.setWheelMaxSuspensionForce(i,    80000);  // wysoki limit — nie przycinaj siły sprężyny
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
