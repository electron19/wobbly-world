/**
 * Siren — miejska syrena alarmowa nocna (zombie alert).
 * Wygląd: słup + kwadratowy ostrosłup (piramida) kręcący się wokół osi Y.
 * Aktywna w nocy: piramida obraca się i pulsuje czerwonym światłem.
 * W dzień: stoi nieruchomo, szara.
 */
import * as THREE from 'three';
import { toonMat } from '../core/Materials.js';

const C_POLE   = 0x888888;  // szary słup
const C_HEAD   = 0xCCCCCC;  // głowica
const C_ACTIVE = 0xFF2200;  // czerwień aktywna
const C_IDLE   = 0x884400;  // ciemnoczerwień w spoczynku

export class Siren {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x, z   pozycja na mapie
   * @param {number} poleH  wysokość słupa (domyślnie 4.5 m)
   */
  constructor(scene, x, z, poleH = 4.5) {
    this.root   = new THREE.Group();
    this._scene = scene;
    this._active = false;
    this._rotY   = Math.random() * Math.PI * 2;  // losowa faza startowa

    this._build(poleH);
    this.root.position.set(x, 0, z);
    scene.add(this.root);
  }

  _build(poleH) {
    const poleMat = toonMat(C_POLE);
    const headMat = toonMat(C_HEAD);

    // ── Słup ─────────────────────────────────────────────────────────────────
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, poleH, 8),
      poleMat,
    );
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    this.root.add(pole);

    // ── Podstawa słupa ────────────────────────────────────────────────────────
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.25, 0.18, 8),
      poleMat,
    );
    base.position.y = 0.09;
    this.root.add(base);

    // ── Głowica obrotowa (Group = obraca się) ─────────────────────────────────
    this._head = new THREE.Group();
    this._head.position.y = poleH + 0.05;
    this.root.add(this._head);

    // Cylinder-łącznik
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8),
      headMat,
    );
    neck.position.y = 0.09;
    this._head.add(neck);

    // ── 4 kwadratowe ostrosłupy (piramidy) wokół głowicy ─────────────────────
    // Każdy obrócony o 90° — razem tworzą "wiatrak" syren
    this._pyramids = [];
    this._pyramidMats = [];

    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshToonMaterial({ color: C_IDLE, emissive: 0x000000 });
      this._pyramidMats.push(mat);

      const group = new THREE.Group();
      group.rotation.y = (i / 4) * Math.PI * 2;

      // Ostrosłup (piramida kwadratowa): podstawa 0.28×0.28, wysokość 0.50
      // THREE ConePiramida z 4 segmentami = kwadratowa podstawa
      const pyramid = new THREE.Mesh(
        new THREE.ConeGeometry(0.20, 0.50, 4),
        mat,
      );
      // Obróć ostrosłup tak żeby wskazywał na zewnątrz (poziomo)
      pyramid.rotation.z = -Math.PI / 2;  // lęży poziomo, czubek na zewnątrz
      pyramid.position.x = 0.30;          // odsunięty od osi
      pyramid.position.y = 0.22;          // na wysokości głowicy
      pyramid.castShadow = true;
      group.add(pyramid);

      // Mały reflektor przy podstawie ostrosłupa
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 4),
        mat,
      );
      lens.position.x = 0.12;
      lens.position.y = 0.22;
      group.add(lens);

      this._head.add(group);
      this._pyramids.push(group);
    }

    // ── Punkt świetlny (PointLight) — widoczny efekt lampy ────────────────────
    this._light = new THREE.PointLight(C_ACTIVE, 0, 18, 1.8);
    this._light.position.y = 0.25;
    this._head.add(this._light);
  }

  /** Włącz syrenę (noc — zombie wychodzą). */
  activate() {
    this._active = true;
  }

  /** Wyłącz syrenę (dzień). */
  deactivate() {
    this._active = false;
    this._light.intensity = 0;
    for (const mat of this._pyramidMats) {
      mat.color.setHex(C_IDLE);
      mat.emissive.setHex(0x000000);
    }
  }

  /**
   * @param {number} dt  delta time
   */
  update(dt) {
    if (!this._active) return;

    // Obrót głowicy — ~1 pełny obrót na 2 sekundy
    this._rotY += dt * Math.PI;   // π rad/s = 0.5 ob/s
    this._head.rotation.y = this._rotY;

    // Pulsowanie koloru i intensywności (0.5 Hz)
    const t    = performance.now() / 1000;
    const pulse = (Math.sin(t * Math.PI * 2 * 0.5) + 1) / 2;  // 0..1 @ 0.5 Hz
    const intensity = 0.6 + pulse * 1.4;                        // 0.6..2.0

    this._light.intensity = intensity;

    // Kolor: od ciemnoczerwonego do jaskrawoczerwonego
    const r = Math.floor(0x88 + pulse * (0xFF - 0x88));
    const color = (r << 16) | 0x0000;
    for (const mat of this._pyramidMats) {
      mat.color.setHex(color);
      mat.emissive.setRGB(pulse * 0.4, 0, 0);
    }
  }

  dispose() {
    this._scene.remove(this.root);
  }
}
