import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

// ─── Stałe geometrii motocykla ───────────────────────────────────────────────
const WHEEL_R   = 0.32;
const WHEEL_W   = 0.18;
const WHEELBASE = 1.55;
const SEAT_Y    = 0.85;
const TANK_Y    = 0.78;
const HBAR_Y    = 1.18;

/**
 * Statyczny zaparkowany motocykl — kolorowy lakier baku/błotników.
 * Skierowany lokalnie wzdłuż osi +Z. Obrót rotY przy placeAt() ustawia kierunek.
 * Kolizja: statyczny box Rapier (auta się odbijają).
 */
export class Motorcycle extends WorldObject {
  constructor(scene, physics, color = 0xFF3344, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this.color = color;
  }

  _build() {
    const bodyMat    = toonMat(this.color);
    const blackMat   = toonMat(0x222222);
    const metalMat   = toonMat(C.metal);
    const seatMat    = toonMat(0x1a1a1a);
    const tireMat    = toonMat(0x111111);
    const headMat    = new THREE.MeshBasicMaterial({ color: 0xFFF0B0 });
    const exhaustMat = toonMat(0xAAAABB);

    // Koła
    const wheelGeom = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12);
    [+WHEELBASE / 2, -WHEELBASE / 2].forEach((z) => {
      const wheel = new THREE.Mesh(wheelGeom, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, WHEEL_R, z);
      addOutline(wheel, 0.04);
      this.root.add(wheel);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_W + 0.02, 8),
        metalMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(0, WHEEL_R, z);
      this.root.add(rim);
    });

    // Rama
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.08, WHEELBASE * 0.85), metalMat,
    );
    frame.position.set(0, 0.46, 0);
    addOutline(frame, 0.05);
    this.root.add(frame);

    // Bak (kolorowy)
    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.28, 0.70), bodyMat,
    );
    tank.position.set(0, TANK_Y, 0.05);
    addOutline(tank, 0.04);
    this.root.add(tank);

    // Pasek na baku
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.04, 0.72),
      toonMat(0xFFFFFF),
    );
    stripe.position.set(0, TANK_Y + 0.14, 0.05);
    this.root.add(stripe);

    // Siedzenie
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.10, 0.60), seatMat,
    );
    seat.position.set(0, SEAT_Y, -0.45);
    addOutline(seat, 0.04);
    this.root.add(seat);

    // Tylny garb
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.30), bodyMat,
    );
    tail.position.set(0, SEAT_Y + 0.05, -0.78);
    addOutline(tail, 0.04);
    this.root.add(tail);

    // Widelec
    [-0.10, +0.10].forEach((sx) => {
      const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), metalMat,
      );
      fork.position.set(sx, 0.62, WHEELBASE / 2 + 0.02);
      fork.rotation.x = -0.18;
      this.root.add(fork);
    });

    // Reflektor
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8), headMat,
    );
    head.position.set(0, 1.00, WHEELBASE / 2 + 0.18);
    this.root.add(head);
    const headRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.06, 10), blackMat,
    );
    headRim.rotation.x = Math.PI / 2;
    headRim.position.set(0, 1.00, WHEELBASE / 2 + 0.12);
    this.root.add(headRim);

    // Kierownica
    const hbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.70, 0.05, 0.05), metalMat,
    );
    hbar.position.set(0, HBAR_Y, WHEELBASE / 2 + 0.08);
    addOutline(hbar, 0.04);
    this.root.add(hbar);

    // Manetki
    [-0.32, +0.32].forEach((sx) => {
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6), blackMat,
      );
      grip.rotation.z = Math.PI / 2;
      grip.position.set(sx, HBAR_Y, WHEELBASE / 2 + 0.08);
      this.root.add(grip);
    });

    // Wydech
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8), exhaustMat,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.18, 0.45, -0.50);
    addOutline(exhaust, 0.04);
    this.root.add(exhaust);

    // Błotniki (kolorowe)
    const fenderF = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 0.45), bodyMat,
    );
    fenderF.position.set(0, WHEEL_R + 0.22, WHEELBASE / 2);
    fenderF.rotation.x = -0.10;
    this.root.add(fenderF);

    const fenderR = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.45), bodyMat,
    );
    fenderR.position.set(0, WHEEL_R + 0.22, -WHEELBASE / 2);
    fenderR.rotation.x = 0.10;
    this.root.add(fenderR);

    // Przechył motocykla (kickstand) — pochył w lewo ~7°
    this.root.rotation.z = 0.12;

    // Nóżka
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), blackMat,
    );
    stand.position.set(-0.22, 0.20, -0.05);
    stand.rotation.z = 0.20;
    this.root.add(stand);
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY;
    this._build();

    // Statyczny box — AABB po rotacji
    const halfL = WHEELBASE / 2 + 0.25;
    const halfW = 0.40;
    const halfH = 0.55;
    const cosA = Math.abs(Math.cos(rotY));
    const sinA = Math.abs(Math.sin(rotY));
    const bx = halfW * cosA + halfL * sinA;
    const bz = halfW * sinA + halfL * cosA;
    this._bodies.push(
      this.physics.addStaticBox(x, y + halfH, z, bx, halfH, bz),
    );
    return this;
  }
}
