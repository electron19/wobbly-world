/**
 * Vehicle physics — Rapier DynamicRayCastVehicleController.
 *
 * All objects (car, player, buildings, hills) share one Rapier world,
 * so car collisions with the environment are natural — no duplicate
 * static bodies and no kinematic ghost body sync needed.
 */

import { getRapier } from './Physics.js';

// Chassis center Y above road level (same value as before for visual continuity)
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

    // Dynamic chassis — same mass and damping as previous cannon-es setup
    const chassisDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, CHASSIS_OFFSET_Y + 0.1, z)
      .setLinearDamping(0.02)
      .setAngularDamping(0.45);

    const chassis = rapierWorld.createRigidBody(chassisDesc);

    // Apply initial heading rotation (Y-axis quaternion)
    if (facing !== 0) {
      chassis.setRotation(
        { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) },
        true,
      );
    }

    // Chassis box collider — matches Car.js CAR_BOX_* visual dimensions
    rapierWorld.createCollider(
      R.ColliderDesc.cuboid(1.07, 0.45, 2.20)
        .setMass(2000)
        .setFriction(0.4)
        .setRestitution(0.28),
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
    for (let i = 0; i < 4; i++) {
      vehicle.setWheelSuspensionStiffness(i,   20);     // miękkie = płynna jazda
      vehicle.setWheelSuspensionCompression(i,  4.0);   // symetria: brak oscylacji zawieszenia
      vehicle.setWheelSuspensionRelaxation(i,   4.0);   // identyczne z compression
      vehicle.setWheelMaxSuspensionTravel(i,    0.40);  // więcej skoku = lepszy kontakt z podłożem
      vehicle.setWheelMaxSuspensionForce(i,     100000);
      vehicle.setWheelFrictionSlip(i,           1.5);   // niższe = brak "walki" wzdłużnej
      vehicle.setWheelSideFrictionStiffness(i,  0.15);  // niskie = brak cornering drag
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
