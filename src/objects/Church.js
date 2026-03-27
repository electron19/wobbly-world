import * as THREE from 'three';
import { Building } from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Church — kościół z wieżą i iglicą.
 *
 * Bryła: prostokątna nawa + kwadratowa wieża przy wejściu + stożkowa iglica.
 * Styl: toon, kamień + czerwony dach + żółty krzyż.
 */
export class Church extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      wallColor:   0xD9D0C0,   // kamień jasnobeżowy
      roofColor:   0x8B3030,   // ciemnoczerwony dach
      spireColor:  0x6A2525,   // ciemniejszy odcień iglicy
      crossColor:  0xFFDD44,   // złoty krzyż
      winColor:    0x6699DD,   // witraż niebieski
      facing:      0,
      w: 10, h: 8, d: 18,     // nawa: 10 × 18, h=8
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { wallColor, roofColor, spireColor, crossColor, winColor, facing } = this.cfg;
    const W = 10, D = 18, H = 8;   // nawa
    const TW = 5;                    // wieża: szerokość = 5
    const TH = 12;                   // wieża: wysokość całkowita
    const SPIRE_H = 7;               // iglica

    const wallMat  = toonMat(wallColor);
    const roofMat  = toonMat(roofColor);
    const spireMat = toonMat(spireColor);
    const winMat   = new THREE.MeshToonMaterial({ color: winColor, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const crossMat = toonMat(crossColor);

    this.root.rotation.y = facing;

    // ── Nawa główna ──────────────────────────────────────────────────────────
    this._box(0, H / 2, 0, W, H, D, wallMat);
    addOutline(this.root.children[this.root.children.length - 1], 0.05);

    // ── Dach dwuspadowy nawy — pryzmat trójkątny ─────────────────────────────
    const navRoofH = 3.5;
    const nrGeo = new THREE.CylinderGeometry(0, W * 0.62, navRoofH, 4, 1);
    // Obróć pryzmat o 45° żeby linia kalenicy była wzdłuż Z
    const nrMesh = new THREE.Mesh(nrGeo, roofMat);
    nrMesh.rotation.y = Math.PI / 4;
    nrMesh.position.set(0, H + navRoofH / 2, 0);
    nrMesh.scale.set(1, 1, D / W * 1.1);
    this.root.add(nrMesh);

    // ── Wieża frontowa — przy z = +D/2 ──────────────────────────────────────
    this._box(0, TH / 2, D / 2 + TW / 2 - 0.5, TW, TH, TW, wallMat);

    // ── Iglica wieży — stożek ────────────────────────────────────────────────
    const spire = new THREE.Mesh(new THREE.ConeGeometry(TW * 0.60, SPIRE_H, 4), spireMat);
    spire.rotation.y = Math.PI / 4;  // narożniki do frontu
    spire.position.set(0, TH + SPIRE_H / 2, D / 2 + TW / 2 - 0.5);
    this.root.add(spire);

    // ── Złoty krzyż na szczycie iglicy ──────────────────────────────────────
    const cH = 1.8, cW = 1.1, cT = 0.14;
    // Pionowa belka
    this._box(0, TH + SPIRE_H + cH / 2, D / 2 + TW / 2 - 0.5, cT, cH, cT, crossMat);
    // Pozioma belka
    this._box(0, TH + SPIRE_H + cH * 0.70, D / 2 + TW / 2 - 0.5, cW, cT, cT, crossMat);

    // ── Okna witrażowe — 4 po bokach nawy, 1 okrągłe w wieży ─────────────
    const winW = 1.2, winH = 2.4;
    [-D / 2 + 3, -D / 2 + 7, D / 2 - 3, D / 2 - 7].forEach(wz => {
      // Lewe i prawe okno
      [-W / 2 - 0.02, W / 2 + 0.02].forEach(wx => {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat);
        win.rotation.y = wx < 0 ? Math.PI / 2 : -Math.PI / 2;
        win.position.set(wx, H * 0.55, wz);
        this.root.add(win);
      });
    });
    // Okrągłe okno w wieży (rozetka)
    const rose = new THREE.Mesh(new THREE.CircleGeometry(0.90, 12), winMat);
    rose.position.set(0, TH * 0.58, D / 2 + TW + 0.01);
    this.root.add(rose);

    // ── Portal (wejście) — ciemny łuk ────────────────────────────────────
    this._box(0, H * 0.33, D / 2 + 0.01, 2.2, H * 0.66, 0.10, toonMat(0x332211));
  }

  _buildColliders(wx, wy, wz) {
    const W = 10, D = 18, H = 8;
    const TW = 5, TH = 12;
    // Nawa
    this._addPhysicsBox(wx, wy + H / 2, wz, W / 2, H / 2, D / 2);
    // Wieża (obliczona z uwzględnieniem facing)
    const f = this.cfg.facing ?? 0;
    const twz = wz + Math.cos(f) * (D / 2 + TW / 2 - 0.5);
    const twx = wx - Math.sin(f) * (D / 2 + TW / 2 - 0.5);
    this._addPhysicsBox(twx, wy + TH / 2, twz, TW / 2, TH / 2, TW / 2);
  }
}
