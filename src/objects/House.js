import { Building } from './Building.js';
import { toonMat, C } from '../core/Materials.js';

/**
 * Typowy dom mieszkalny: ściany + spadzisty dach + okna + drzwi.
 *
 * Konfiguracja (wszystkie opcjonalne, mają wartości domyślne z Building):
 *   w, h, d          — szerokość, wysokość, głębokość
 *   wallColor        — kolor ścian
 *   roofColor        — kolor dachu
 *   doorColor        — kolor drzwi
 *   winColor         — kolor okien
 */
export class House extends Building {
  constructor(scene, physics, cfg = {}) {
    super(scene, physics, { w: 6, h: 4, d: 8, ...cfg });
  }

  _buildGeometry() {
    const { w, h, d, wallColor, roofColor, doorColor, winColor } = this.cfg;
    const wallMat = toonMat(wallColor);
    const roofMat = toonMat(roofColor);
    const doorMat = toonMat(doorColor);
    const winMat  = toonMat(winColor);
    const crossMat = toonMat(0xBBBBBB);

    // ─── Korpus ──────────────────────────────────────────────────────────────
    this._box(0, h / 2, 0, w, h, d, wallMat);

    // ─── Dach dwuspadowy — baza piramidy styka się z górną ścianą budynku ─────
    // BufferGeometry: baza na y=0, wierzchołek na y=roofH → localY = h (top ściany)
    const roofH = h * 0.35;
    this._roof(0, h, 0, w, d, roofH, roofMat);

    // ─── Drzwi (front) — wbudowane w ścianę, minimalne wystanie ──────────────
    this._box(0, 1.1, d / 2 + 0.01, 1.0, 2.2, 0.04, doorMat, { outline: 0.015 });

    // ─── Okna (front) ────────────────────────────────────────────────────────
    [[-w * 0.3, h * 0.62], [w * 0.3, h * 0.62]].forEach(([xOff, yOff]) => {
      this._box(xOff, yOff, d / 2 + 0.01, 1.2, 1.0, 0.04, winMat, { outline: 0.015 });
      // Krzyż okienny
      this._box(xOff, yOff, d / 2 + 0.025, 0.07, 1.0, 0.03, crossMat, { outline: false, cast: false });
      this._box(xOff, yOff, d / 2 + 0.025, 1.2, 0.07, 0.03, crossMat, { outline: false, cast: false });
    });

    // ─── Okna (tył) ──────────────────────────────────────────────────────────
    [[-w * 0.3, h * 0.62], [w * 0.3, h * 0.62]].forEach(([xOff, yOff]) => {
      this._box(xOff, yOff, -d / 2 - 0.01, 1.2, 1.0, 0.04, winMat, { outline: 0.015 });
    });

    // ─── Okno boczne ─────────────────────────────────────────────────────────
    this._box(w / 2 + 0.01, h * 0.62, 0, 0.04, 1.0, 1.2, winMat, { outline: 0.015 });
  }
}
