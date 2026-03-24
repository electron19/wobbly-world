import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Sklep — kolorowa parterowa budka z witrynami, markizą, szyldem.
 *
 * Domyślna konfiguracja (wszystkie nadpisywalne):
 *   wallColor, roofColor, doorColor, trimColor
 *   awningA, awningB   — kolory pasków markizy
 *   signColor          — kolor szyldu
 *   facing             — obrót Y (radiany)
 */
export class Shop extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w:         9.0,
      h:         4.5,
      d:         7.0,
      wallColor:  0xFFE55C,
      roofColor:  0xE84040,
      doorColor:  0x40BFFF,
      trimColor:  0xFFFFFF,
      awningA:    0xE84040,
      awningB:    0xFFFFFF,
      signColor:  0xFF6B35,
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w, h, d, wallColor, roofColor, doorColor, trimColor, facing } = this.cfg;
    const awA  = this.cfg.awningA  ?? 0xE84040;
    const awB  = this.cfg.awningB  ?? 0xFFFFFF;
    const sigC = this.cfg.signColor ?? 0xFF6B35;

    const wallMat = toonMat(wallColor);
    const trimMat = toonMat(trimColor);
    const roofMat = toonMat(roofColor);
    const doorMat = toonMat(doorColor);
    const T = d / 2; // przednia ściana

    this.root.rotation.y = facing;

    // ── Korpus ────────────────────────────────────────────────────────────
    this._box(0, h / 2, 0, w, h, d, wallMat);

    // ── Płaski dach + parapet ─────────────────────────────────────────────
    this._box(0, h + 0.2, 0, w + 0.26, 0.4, d + 0.26, roofMat);
    const parFront = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.85, 0.18), trimMat);
    parFront.position.set(0, h + 0.82, T + 0.15);
    this.root.add(parFront);
    const parBack = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.85, 0.18), trimMat);
    parBack.position.set(0, h + 0.82, -T - 0.15);
    this.root.add(parBack);
    [-1, 1].forEach(s => {
      const parSide = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, d + 0.6), trimMat);
      parSide.position.set(s * (w / 2 + 0.15), h + 0.82, 0);
      this.root.add(parSide);
    });

    // ── Duże okno wystawowe (lewa część frontu) ───────────────────────────
    const winW = w * 0.52;
    const winH = h * 0.56;
    const winX = -w * 0.18;
    const winY = h * 0.365;

    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.16, winH + 0.16, 0.1), trimMat);
    winFrame.position.set(winX, winY, T + 0.06);
    this.root.add(winFrame);

    const winGlass = new THREE.Mesh(
      new THREE.BoxGeometry(winW, winH, 0.06),
      new THREE.MeshToonMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.62 }),
    );
    winGlass.position.set(winX, winY, T + 0.09);
    this.root.add(winGlass);

    // Krzyż na oknie
    const whb = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.07, 0.11), trimMat);
    whb.position.set(winX, winY, T + 0.11);
    this.root.add(whb);
    const wvb = new THREE.Mesh(new THREE.BoxGeometry(0.07, winH, 0.11), trimMat);
    wvb.position.set(winX, winY, T + 0.11);
    this.root.add(wvb);

    // ── Markiza (paski w grupie, pochylona do przodu) ─────────────────────
    const awnW     = winW + 0.6;
    const awnGroup = new THREE.Group();
    awnGroup.position.set(winX, h * 0.65, T + 0.08);
    awnGroup.rotation.x = -0.42;
    const STRIPES = 8;
    for (let i = 0; i < STRIPES; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(awnW / STRIPES - 0.02, 0.07, 1.45),
        toonMat(i % 2 === 0 ? awA : awB),
      );
      stripe.position.x = -awnW / 2 + (i + 0.5) * (awnW / STRIPES);
      awnGroup.add(stripe);
    }
    this.root.add(awnGroup);
    // Listwa mocująca
    const awnBar = new THREE.Mesh(new THREE.BoxGeometry(awnW, 0.1, 0.1), trimMat);
    awnBar.position.set(winX, h * 0.66, T + 0.09);
    this.root.add(awnBar);

    // ── Szyld ─────────────────────────────────────────────────────────────
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.87, 0.72, 0.15),
      toonMat(sigC),
    );
    sign.position.set(0, h * 0.845, T + 0.09);
    addOutline(sign, 0.025);
    this.root.add(sign);
    // Białe paski na szyldzie (uproszczony napis)
    [-0.20, 0, 0.20].forEach(yo => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 0.09, 0.17), trimMat);
      bar.position.set(0, h * 0.845 + yo, T + 0.17);
      this.root.add(bar);
    });

    // ── Drzwi (prawa część frontu) ────────────────────────────────────────
    const doorX = w * 0.31;
    const doorH = h * 0.53;

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.55, doorH + 0.14, 0.1), trimMat);
    doorFrame.position.set(doorX, doorH / 2, T + 0.06);
    this.root.add(doorFrame);

    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.35, doorH, 0.13), doorMat);
    doorMesh.position.set(doorX, doorH / 2, T + 0.09);
    addOutline(doorMesh, 0.03);
    this.root.add(doorMesh);

    // Klamka
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFD700 }),
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(doorX - 0.38, doorH * 0.47, T + 0.17);
    this.root.add(handle);

    // ── Okna boczne ───────────────────────────────────────────────────────
    [-1, 1].forEach(side => {
      const sf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 1.85), trimMat);
      sf.position.set(side * (w / 2 + 0.07), h * 0.52, 0);
      this.root.add(sf);
      const sg = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 1.0, 1.65),
        new THREE.MeshToonMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.5 }),
      );
      sg.position.set(side * (w / 2 + 0.1), h * 0.52, 0);
      this.root.add(sg);
    });

    // ── Stopnie wejściowe ─────────────────────────────────────────────────
    [
      [0.28, 1.95, 0.5],
      [0.18, 1.62, 0.5],
      [0.10, 1.30, 0.5],
    ].forEach(([sh, sw, sd], i) => {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, sd),
        toonMat(0xD4C9A8),
      );
      step.position.set(doorX, sh / 2, T + 0.27 + i * 0.5);
      step.castShadow = step.receiveShadow = true;
      this.root.add(step);
    });

    // ── Doniczki przy wejściu ─────────────────────────────────────────────
    [-1, 1].forEach(s => {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.18, 0.38, 8), toonMat(0x7B4F2E),
      );
      pot.position.set(doorX + s * 1.2, 0.19, T + 0.56);
      this.root.add(pot);
      const plant = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6), toonMat(0x27AE60),
      );
      plant.position.set(doorX + s * 1.2, 0.56, T + 0.56);
      this.root.add(plant);
    });

    // ── Kosz na śmieci ────────────────────────────────────────────────────
    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.68, 8), toonMat(0x556677),
    );
    bin.position.set(-w / 2 + 0.55, 0.34, T - 0.65);
    this.root.add(bin);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.24, 0.12, 8), toonMat(0x778899),
    );
    lid.position.set(-w / 2 + 0.55, 0.75, T - 0.65);
    this.root.add(lid);

    // ── Ścieżka (krótka — mieści się na chodniku, nie wychodzi na jezdnię) ──
    const path = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.0), toonMat(0xD4C9A8));
    path.position.set(doorX, 0.025, T + 0.8);
    path.receiveShadow = true;
    this.root.add(path);
  }

  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    this._addPhysicsBox(wx, wy + (h + 0.6) / 2, wz, w / 2, (h + 0.6) / 2, d / 2);
  }
}
