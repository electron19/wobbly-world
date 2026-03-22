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

    // ─── Dach spadzisty ──────────────────────────────────────────────────────
    this._roof(0, h + h * 0.28, 0, w * 0.9, h * 0.55, roofMat);

    // ─── Drzwi (front) ───────────────────────────────────────────────────────
    this._box(0, 1.1, d / 2 + 0.02, 1.0, 2.2, 0.05, doorMat, { outline: 0.02 });

    // ─── Okna (front) ────────────────────────────────────────────────────────
    [[-w * 0.3, h * 0.62], [w * 0.3, h * 0.62]].forEach(([xOff, yOff]) => {
      this._box(xOff, yOff, d / 2 + 0.02, 1.2, 1.0, 0.05, winMat, { outline: 0.02 });
      // Krzyż okienny
      this._box(xOff, yOff, d / 2 + 0.04, 0.07, 1.0, 0.04, crossMat, { outline: false, cast: false });
      this._box(xOff, yOff, d / 2 + 0.04, 1.2, 0.07, 0.04, crossMat, { outline: false, cast: false });
    });

    // ─── Okna (tył) ──────────────────────────────────────────────────────────
    [[-w * 0.3, h * 0.62], [w * 0.3, h * 0.62]].forEach(([xOff, yOff]) => {
      this._box(xOff, yOff, -d / 2 - 0.02, 1.2, 1.0, 0.05, winMat, { outline: 0.02 });
    });

    // ─── Okno boczne ─────────────────────────────────────────────────────────
    this._box(w / 2 + 0.02, h * 0.62, 0, 0.05, 1.0, 1.2, winMat, { outline: 0.02 });
  }
}
