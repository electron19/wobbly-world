import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Wieżowiec — modernistyczny budynek z 4 sekcjami-setbackami.
 *
 * Sekcja A (baza):    10×10, wys 14  →  y: 0–14
 * Sekcja B (środek):   7×7,  wys 12  →  y: 14–26
 * Sekcja C (górna):    5×5,  wys 10  →  y: 26–36
 * Sekcja D (iglica):   3×3,  wys  8  →  y: 36–44
 * Antena: y 44–52
 * Łączna wysokość: ~52 jednostki
 */
export class Skyscraper extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      wallColor:  0xB4C8D8,
      glassColor: 0x3A7BBF,
      trimColor:  0x2A3A4A,
      accentColor: 0xFFCC44,
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { wallColor, glassColor, trimColor, accentColor, facing } = this.cfg;

    const wallMat   = toonMat(wallColor);
    const trimMat   = toonMat(trimColor);
    const accentMat = toonMat(accentColor);
    const glassMat  = new THREE.MeshToonMaterial({
      color: glassColor, transparent: true, opacity: 0.80,
    });

    this.root.rotation.y = facing;

    // ── Sekcje budynku ────────────────────────────────────────────────────
    const SECTIONS = [
      { w: 10, d: 10, h: 14, yBase:  0 },
      { w:  7, d:  7, h: 12, yBase: 14 },
      { w:  5, d:  5, h: 10, yBase: 26 },
      { w:  3, d:  3, h:  8, yBase: 36 },
    ];

    SECTIONS.forEach(({ w, d, h, yBase }) => {
      // Ściany
      this._box(0, yBase + h / 2, 0, w, h, d, wallMat);

      // Gzyms-setback na podstawie każdej sekcji (oprócz parteru)
      if (yBase > 0) {
        const ledge = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.7, 0.60, d + 0.7), trimMat,
        );
        ledge.position.set(0, yBase + 0.30, 0);
        this.root.add(ledge);
      }

      // Poziome paski okien co 3 jednostki (toon-style)
      const FLOOR_H  = 3.0;
      const GLASS_H  = FLOOR_H * 0.56;
      const floors   = Math.floor(h / FLOOR_H);
      for (let f = 0; f < floors; f++) {
        const gy = yBase + f * FLOOR_H + FLOOR_H * 0.50;
        // Przód + tył
        [d / 2 + 0.04, -(d / 2 + 0.04)].forEach(gz => {
          const gl = new THREE.Mesh(
            new THREE.BoxGeometry(w - 0.5, GLASS_H, 0.06), glassMat,
          );
          gl.position.set(0, gy, gz);
          this.root.add(gl);
        });
        // Boki
        [w / 2 + 0.04, -(w / 2 + 0.04)].forEach(gx => {
          const gl = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, GLASS_H, d - 0.5), glassMat,
          );
          gl.position.set(gx, gy, 0);
          this.root.add(gl);
        });
      }
    });

    // Gzyms na szczycie sekcji D (y=44) — "korona"
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.60, 3.8), trimMat,
    );
    crown.position.set(0, 44.30, 0);
    this.root.add(crown);

    // Akcent podświetlający koronę
    const crownStripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.25, 3.4), accentMat,
    );
    crownStripe.position.set(0, 44.75, 0);
    this.root.add(crownStripe);

    // ── Antena ────────────────────────────────────────────────────────────
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.20, 8, 8), trimMat,
    );
    antenna.position.y = 48;
    this.root.add(antenna);

    // Kulka na szczycie
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 6), accentMat,
    );
    ball.position.y = 52.3;
    this.root.add(ball);

    // ── Lobby (przyziemie wejściowe) ──────────────────────────────────────
    const lobbyH = 4.8;
    const lobbyD = 1.1;

    const lobby = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, lobbyH, lobbyD), wallMat,
    );
    lobby.position.set(0, lobbyH / 2, 5.0 + lobbyD / 2);
    addOutline(lobby, 0.04);
    this.root.add(lobby);

    // Szklana fasada lobby
    const lobbyGlass = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, lobbyH - 0.5, 0.08),
      new THREE.MeshToonMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.78 }),
    );
    lobbyGlass.position.set(0, lobbyH / 2, 5.0 + lobbyD + 0.01);
    this.root.add(lobbyGlass);

    // Poziome ramy okienne lobby
    [1.2, 2.4, 3.6].forEach(ly => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(5.3, 0.09, 0.10), trimMat,
      );
      bar.position.set(0, ly, 5.0 + lobbyD + 0.02);
      this.root.add(bar);
    });

    // Markiza nad wejściem
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.22, 1.4), trimMat,
    );
    canopy.position.set(0, lobbyH + 0.1, 5.0 + lobbyD / 2 + 0.7);
    this.root.add(canopy);

    // ── Ścieżka przed wejściem ────────────────────────────────────────────
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.05, 5.0), toonMat(0xCDC9BC),
    );
    path.position.set(0, 0.025, 5.0 + lobbyD + 2.5);
    path.receiveShadow = true;
    this.root.add(path);

    // ── Logo / accent strip na bazie ─────────────────────────────────────
    [Math.PI / 2, -Math.PI / 2, 0, Math.PI].forEach(angle => {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.30, 0.08), accentMat,
      );
      // Umieść na każdej ścianie sekcji B na poziomie y=20
      strip.position.set(
        Math.sin(angle) * 3.56,
        20,
        Math.cos(angle) * 3.56,
      );
      this.root.add(strip);
    });
  }

  _buildColliders(wx, wy, wz) {
    // Osobne boxy dla każdej sekcji (bez facing — sekcje są symetryczne)
    [
      { w: 10, d: 10, h: 14, yBase:  0 },
      { w:  7, d:  7, h: 12, yBase: 14 },
      { w:  5, d:  5, h: 10, yBase: 26 },
      { w:  3, d:  3, h:  8, yBase: 36 },
    ].forEach(({ w, d, h, yBase }) => {
      this._addPhysicsBox(wx, wy + yBase + h / 2, wz, w / 2, h / 2, d / 2);
    });
  }
}
