import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

const POLE_H    = 4.5;
const POLE_HALF = POLE_H / 2;
const FALL_DUR  = 0.70;  // czas upadku [s]

/**
 * Latarnia uliczna: słup + ramię + głowica.
 *
 * Fizyka: Rapier statyczny cylinder (auto Rapier się o niego odbija).
 * Po uderzeniu (proximity check z Game.js): lampa pada przez kinematyczną
 * animację — obrót dookoła podstawy (pivot y=0) z ease-in.
 */
export class StreetLamp extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this._knocked  = false;
    // Animacja upadku
    this._fallT       = null;
    this._fallQStart  = null;
    this._toppleAxisX = 0;
    this._toppleAxisZ = 1;
  }

  _build() {
    const metalMat = toonMat(C.metal);
    this._headMat  = new THREE.MeshBasicMaterial({ color: 0x554420 });   // dim w dzień
    this._dayColor   = 0x554420;
    this._nightColor = 0xFFE7A0;   // ciepły żółty świecący

    // Słup
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, POLE_H, 6), metalMat);
    pole.position.y = POLE_HALF;
    this.root.add(pole);

    // Ramię
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.10), metalMat);
    arm.position.set(0.6, 4.45, 0);
    this.root.add(arm);

    // Głowica
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), this._headMat);
    head.position.set(1.2, 4.32, 0);
    this.root.add(head);

    // Punkt świetlny — wyłączony w dzień, włączony w nocy (intensity przez setLit)
    this._light = new THREE.PointLight(0xFFE7A0, 0, 9, 1.8);
    this._light.position.set(1.2, 4.0, 0);
    this.root.add(this._light);
  }

  /** Włącz/wyłącz światło lampy (noc/dzień). */
  setLit(on) {
    if (!this._light || !this._headMat) return;
    this._light.intensity = on ? 1.4 : 0;
    this._headMat.color.setHex(on ? this._nightColor : this._dayColor);
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY + Math.PI;
    this._build();

    // Rapier: statyczny cylinder — auto (Rapier) i gracz odbijają się od słupa
    this._bodies.push(this.physics.addStaticCylinder(x, y + POLE_HALF, z, POLE_HALF, 0.30));
    return this;
  }

  /**
   * Wywołane z Game.js po wykryciu uderzenia auta (proximity + impactVel).
   * @param {number} vel    prędkość uderzenia [m/s]
   * @param {number} nx, nz kierunek uderzenia w XZ (znormalizowany)
   */
  knockDown(vel, nx = 0, nz = 1) {
    if (this._knocked) return;
    this._knocked = true;

    // Oś upadku: prostopadła do uderzenia w płaszczyźnie XZ (praworączna)
    // Uderzenie w +Z → oś rotacji = +X → lampa pada w kierunku +Z ✓
    const len = Math.sqrt(nx * nx + nz * nz) || 1;
    this._toppleAxisX = -nz / len;
    this._toppleAxisZ =  nx / len;

    // Zapamiętaj rotację startową (zawiera obrót Y ustawiony w placeAt)
    this._fallQStart = this.root.quaternion.clone();
    this._fallT      = 0;
  }

  /**
   * Animuje upadek i synchronizuje mesh co klatkę.
   * @param {number} dt  delta time [s]
   */
  update(dt) {
    if (!this._knocked || this._fallT === null) return;
    if (this._fallT >= FALL_DUR) return;  // animacja zakończona

    this._fallT = Math.min(this._fallT + dt, FALL_DUR);
    const t = this._fallT / FALL_DUR;  // [0, 1]

    // Ease-in: t^2 → powolny start, szybki koniec (efekt ciążenia)
    // Mały overshoot (1.04) → lekkie odbicie przy lądowaniu
    const rawAngle = t * t * (Math.PI / 2) * 1.04;
    const angle    = Math.min(rawAngle, Math.PI / 2);

    // Kwaternion upadku dookoła osi toppleAxis
    const halfA = angle / 2;
    const sinH  = Math.sin(halfA);
    const qTopple = new THREE.Quaternion(
      this._toppleAxisX * sinH,
      0,
      this._toppleAxisZ * sinH,
      Math.cos(halfA),
    );

    // Wynikowy obrót = topple * startowy (zachowuje kierunek Y lampy)
    this.root.quaternion.multiplyQuaternions(qTopple, this._fallQStart);

    // Podstawa (pivot) zawsze przyczepiona do ziemi
    this.root.position.y = 0;
  }
}
