/**
 * Vehicle physics — Rapier DynamicRayCastVehicleController.
 *
 * All objects (car, player, buildings, hills) share one Rapier world,
 * so car collisions with the environment are natural — no duplicate
 * static bodies and no kinematic ghost body sync needed.
 *
 * Suspension design: soft spring (k=24) + MaxSuspensionForce cap.
 * The cap (18 000 N/wheel) provides the actual support load; the soft
 * spring adds damping over small displacements without exciting oscillations.
 * High k values (e.g. 38 000) cause "dancing" at 60 Hz regardless of damping.
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

    // Spawn at 0.65 m = spring equilibrium.
    // Formula: F = k·compression·M_chassis → equilibrium c_eq = g/(4·k) = 20/(4·24) = 0.208 m
    // chassis_Y = wheel_radius + rest_length − c_eq = 0.40 + 0.45 − 0.208 = 0.642 m ≈ 0.65 m
    // Spawning here means zero net force on frame 1 → no settling, no bounce.
    const chassisDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.65, z)
      .setLinearDamping(0.04)
      .setAngularDamping(0.20);

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
        .setFriction(0.0)   // 0 = chassis slides freely; traction from wheel frictionSlip only
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

    // k=24 (soft) — avoids resonance oscillations at 60 Hz.
    // MaxSuspensionForce=18000 N/wheel is the real load-bearing limit
    // (18000 > weight/wheel=7500 → car supported; 4×18000=72000 > total weight=30000 ✓).
    for (let i = 0; i < 4; i++) {
      vehicle.setWheelSuspensionStiffness(i,   24);
      vehicle.setWheelSuspensionCompression(i,  3.0);
      vehicle.setWheelSuspensionRelaxation(i,   3.0);
      vehicle.setWheelMaxSuspensionTravel(i,    0.55);
      vehicle.setWheelMaxSuspensionForce(i,    18000);
      vehicle.setWheelFrictionSlip(i,           1.8);
      vehicle.setWheelSideFrictionStiffness(i,  1.0);
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
