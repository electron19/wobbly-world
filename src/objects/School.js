import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Szkoła — duży 2-piętrowy budynek z zegarem, flagą, szeroką elewacją.
 *
 * Wymiary: 18 × (3.8 × 2) × 10 = 18 × 7.6 × 10
 * Front: 6 okien na piętro (po 3 z każdej strony), podwójne drzwi w centrum,
 *        pylon z zegarem nad wejściem, tyczka flagowa po lewej.
 */
export class School extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w:         18.0,
      h:          3.8,   // wysokość jednej kondygnacji
      d:         10.0,
      wallColor:  0xF2E8D6,   // kremowy
      roofColor:  0x7B2D2D,   // ciemnoczerwony
      doorColor:  0x3D5A80,   // granatowy
      trimColor:  0x5C3D2E,   // ciemnobrązowy
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w, h, d, wallColor, roofColor, doorColor, trimColor, facing } = this.cfg;
    const H = h * 2;      // 7.6 — łączna wysokość ścian
    const T = d / 2;      // 5.0 — odsunięcie frontu

    const wallMat = toonMat(wallColor);
    const roofMat = toonMat(roofColor);
    const trimMat = toonMat(trimColor);
    const doorMat = toonMat(doorColor);

    this.root.rotation.y = facing;

    // ── Główny korpus ─────────────────────────────────────────────────────
    this._box(0, H / 2, 0, w, H, d, wallMat);

    // ── Dach płaski + parapet ─────────────────────────────────────────────
    this._box(0, H + 0.22, 0, w + 0.3, 0.44, d + 0.3, roofMat);

    const mkPar = (cx, cz, pw, pd) => {
      const par = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.82, pd), trimMat);
      par.position.set(cx, H + 0.84, cz);
      this.root.add(par);
    };
    mkPar(0,                T + 0.16,  w + 0.3, 0.2);
    mkPar(0,               -T - 0.16,  w + 0.3, 0.2);
    mkPar( w / 2 + 0.16,  0,           0.2, d + 0.54);
    mkPar(-w / 2 - 0.16,  0,           0.2, d + 0.54);

    // ── Gzyms między piętrami ─────────────────────────────────────────────
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.20, d + 0.12), trimMat);
    ledge.position.set(0, h, 0);
    this.root.add(ledge);

    // ── Pylon / fronton centralny (nad wejściem) ──────────────────────────
    const pylW = 5.2;
    const pylH = 2.5;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(pylW, pylH, 0.55), wallMat);
    pylon.position.set(0, H + pylH / 2, T + 0.12);
    addOutline(pylon, 0.04);
    this.root.add(pylon);

    // Dolna listwa pylonu
    const pylBase = new THREE.Mesh(new THREE.BoxGeometry(pylW + 0.35, 0.22, 0.75), trimMat);
    pylBase.position.set(0, H + 0.11, T + 0.12);
    this.root.add(pylBase);

    // Górna listwa pylonu
    const pylTop = new THREE.Mesh(new THREE.BoxGeometry(pylW + 0.35, 0.22, 0.72), trimMat);
    pylTop.position.set(0, H + pylH, T + 0.12);
    this.root.add(pylTop);

    // ── Zegar na pylonie ──────────────────────────────────────────────────
    const clkY = H + pylH * 0.52;
    const clkZ = T + 0.48;

    const clockFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.80, 0.80, 0.15, 20),
      toonMat(0xFFFAF0),
    );
    clockFace.rotation.x = Math.PI / 2;
    clockFace.position.set(0, clkY, clkZ);
    this.root.add(clockFace);

    const clockRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.10, 8, 24),
      trimMat,
    );
    clockRim.position.set(0, clkY, clkZ + 0.01);
    this.root.add(clockRim);

    // Wskazówka godzinowa
    const hourHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.52, 0.08), toonMat(0x222233),
    );
    hourHand.position.set(0.12, clkY + 0.14, clkZ + 0.10);
    hourHand.rotation.z = -0.5;
    this.root.add(hourHand);

    // Wskazówka minutowa
    const minHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.68, 0.07), toonMat(0x222233),
    );
    minHand.position.set(-0.20, clkY, clkZ + 0.10);
    minHand.rotation.z = 0.28;
    this.root.add(minHand);

    // Czop środkowy
    const pivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8),
      toonMat(0x555555),
    );
    pivot.rotation.x = Math.PI / 2;
    pivot.position.set(0, clkY, clkZ + 0.10);
    this.root.add(pivot);

    // ── Tyczka flagowa ────────────────────────────────────────────────────
    const poleX = -w / 2 + 1.8;
    const poleH = 9.5;
    const pole  = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, poleH, 6),
      toonMat(0xBBBBBB),
    );
    pole.position.set(poleX, poleH / 2, 0);
    this.root.add(pole);

    // Flaga (biało-czerwona — 2 poziome pasy)
    const flagH = 1.1;
    const flagW = 2.1;
    const flagY = poleH - 0.4;
    const flagBase = new THREE.Mesh(
      new THREE.BoxGeometry(flagW, flagH, 0.05), toonMat(0xFFFFFF),
    );
    flagBase.position.set(poleX + flagW / 2, flagY, 0);
    this.root.add(flagBase);
    const flagStripe = new THREE.Mesh(
      new THREE.BoxGeometry(flagW, flagH * 0.5, 0.06), toonMat(0xCC2233),
    );
    flagStripe.position.set(poleX + flagW / 2, flagY - flagH * 0.25, 0);
    this.root.add(flagStripe);

    // ── Pomocnik okna ─────────────────────────────────────────────────────
    const makeWindow = (lx, ly, lz, rotY = 0) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.32, 0.11), trimMat);
      frame.position.set(lx, ly, lz);
      frame.rotation.y = rotY;
      this.root.add(frame);

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 1.12, 0.06),
        new THREE.MeshToonMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.55 }),
      );
      glass.position.set(lx, ly, lz + (rotY === 0 ? 0.07 : 0));
      glass.rotation.y = rotY;
      this.root.add(glass);

      // Krzyż
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.07, 0.12), trimMat);
      hb.position.set(lx, ly, lz + (rotY === 0 ? 0.07 : 0));
      hb.rotation.y = rotY;
      this.root.add(hb);
      const vb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.12, 0.12), trimMat);
      vb.position.set(lx, ly, lz + (rotY === 0 ? 0.07 : 0));
      vb.rotation.y = rotY;
      this.root.add(vb);
    };

    // Pozycje okien frontu — 3 z lewej, 3 z prawej (symetrycznie od centrum)
    const fWinX = [-7.2, -5.2, -3.2,  3.2,  5.2,  7.2];
    fWinX.forEach(wx => {
      makeWindow(wx, h * 0.56, T + 0.07);   // parter
      makeWindow(wx, h * 1.56, T + 0.07);   // 1. piętro
    });

    // Okna tylnej ściany
    [-5.5, 0, 5.5].forEach(wx => {
      makeWindow(wx, h * 0.56, -T - 0.07, Math.PI);
      makeWindow(wx, h * 1.56, -T - 0.07, Math.PI);
    });

    // ── Wejście główne (podwójne drzwi + naświetle) ───────────────────────
    const mainFrame = new THREE.Mesh(new THREE.BoxGeometry(3.5, h * 0.72, 0.11), trimMat);
    mainFrame.position.set(0, h * 0.36, T + 0.07);
    this.root.add(mainFrame);

    [-0.77, 0.77].forEach(dx => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.38, h * 0.68, 0.14), doorMat);
      door.position.set(dx, h * 0.34, T + 0.10);
      addOutline(door, 0.03);
      this.root.add(door);
    });

    // Naświetle (transom)
    const transom = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 0.52, 0.11),
      new THREE.MeshToonMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.62 }),
    );
    transom.position.set(0, h * 0.72 + 0.18, T + 0.10);
    this.root.add(transom);

    // Kolumny przy wejściu
    [-1.6, 1.6].forEach(cx => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, h * 0.95, 8), trimMat,
      );
      col.position.set(cx, h * 0.475, T + 0.16);
      this.root.add(col);
    });

    // ── Stopnie przed wejściem ────────────────────────────────────────────
    [
      [0.24, 6.0, 0.55],
      [0.17, 5.5, 0.55],
      [0.11, 5.0, 0.55],
      [0.06, 4.5, 0.55],
    ].forEach(([sh, sw, sd], i) => {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, sd), toonMat(0xD4C9A8),
      );
      step.position.set(0, sh / 2, T + 0.3 + i * 0.52);
      step.castShadow = step.receiveShadow = true;
      this.root.add(step);
    });

    // ── Ścieżka przed wejściem ────────────────────────────────────────────
    const path = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.05, 5.5), toonMat(0xD4C9A8));
    path.position.set(0, 0.025, T + 2.8);
    path.receiveShadow = true;
    this.root.add(path);

    // ── Ławki przed szkołą ────────────────────────────────────────────────
    [-2.5, 2.5].forEach(bx => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.10, 0.45), toonMat(0x8B6914));
      seat.position.set(bx, 0.42, T + 4.0);
      this.root.add(seat);
      [-0.7, 0.7].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.40, 0.35), toonMat(0x5C3D2E));
        leg.position.set(bx + lx, 0.20, T + 4.0);
        this.root.add(leg);
      });
    });
  }

  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    const H = h * 2;
    // Główny budynek
    this._addPhysicsBox(wx, wy + (H + 0.66) / 2, wz, w / 2, (H + 0.66) / 2, d / 2);
    // Pylon nad wejściem
    this._addPhysicsBox(wx, wy + H + 1.36, wz, 2.7, 1.36, d / 2);
  }
}
