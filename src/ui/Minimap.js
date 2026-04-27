/**
 * Mini-mapa (heading-up) z kompasem — prawy dolny róg ekranu.
 *
 * Obrót: facing=0 (+Z/południe) jest zawsze "do przodu" (góra ekranu).
 * Kompas N/S/E/W wyświetlany jako etykiety poza kółkiem mapy.
 */
import { ROADS, ROAD_HALF } from '../world/zones.js';

export class Minimap {
  constructor(container = document.body) {
    this._SIZE  = 160;   // rozmiar canvas [px]
    this._R     = 72;    // promień kółka mapy (8px margines na etykiety kompasu)
    this._SCALE = 1.4;   // jednostki świata na piksel (72 * 1.4 ≈ 101 j.ś. widoczne)
    this._cx    = this._SIZE / 2;
    this._cy    = this._SIZE / 2;

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;bottom:20px;right:20px;' +
      `width:${this._SIZE}px;height:${this._SIZE}px;` +
      'pointer-events:none;user-select:none;';
    this._wrap = wrap;

    const canvas = document.createElement('canvas');
    canvas.width  = this._SIZE;
    canvas.height = this._SIZE;
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    this._ctx = canvas.getContext('2d');
  }

  /**
   * @param {THREE.Vector3} centerPos    środek mapy (gracz lub prowadzone auto)
   * @param {number}        entityFacing  kierunek [rad]: facing=0 = +Z = południe
   * @param {Array}         cars          wszystkie Car[]
   * @param {object|null}   activeCar     prowadzone auto (pomijane jako dot)
   * @param {Array}         buildings     wszystkie Building[]
   */
  update(centerPos, entityFacing, cars, activeCar, buildings) {
    const ctx = this._ctx;
    const S   = this._SIZE;
    const R   = this._R;
    const cx  = this._cx;
    const cy  = this._cy;
    const sc  = this._SCALE;

    ctx.clearRect(0, 0, S, S);

    // ── 1. Clip do koła ───────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // ── 2. Tło — trawa ────────────────────────────────────────────────────────
    ctx.fillStyle = '#3a7a18';
    ctx.fillRect(0, 0, S, S);

    // ── 3. Rotacja mapy — heading-up ─────────────────────────────────────────
    // facing=0 (faces +Z/south) → mapRot = π → south at top
    // Wzór: mapRot = entityFacing + π
    const mapRot = entityFacing + Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mapRot);

    // ── 4. Drogi ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#606060';
    for (const road of ROADS) {
      const hw = ROAD_HALF / sc;
      if (road.axis === 'x') {
        // Droga N-S: pionowy pasek
        const px = (road.center - centerPos.x) / sc;
        ctx.fillRect(px - hw, -R, hw * 2, R * 2);
      } else {
        // Droga E-W: poziomy pasek
        const pz = (road.center - centerPos.z) / sc;
        ctx.fillRect(-R, pz - hw, R * 2, hw * 2);
      }
    }

    // ── 5. Budynki ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#C8935A';
    for (const b of buildings) {
      const bx = (b.root.position.x - centerPos.x) / sc;
      const bz = (b.root.position.z - centerPos.z) / sc;
      if (bx * bx + bz * bz > (R + 10) * (R + 10)) continue;
      ctx.fillRect(bx - 3, bz - 3, 6, 6);
    }

    // ── 6. Inne auta — czerwone kropki ────────────────────────────────────────
    ctx.fillStyle = '#FF5533';
    for (const car of cars) {
      if (car === activeCar) continue;
      const dx = (car.root.position.x - centerPos.x) / sc;
      const dz = (car.root.position.z - centerPos.z) / sc;
      if (dx * dx + dz * dz > R * R * 1.3) continue;
      ctx.beginPath();
      ctx.arc(dx, dz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();   // undo rotacji mapy

    // ── 7. Trójkąt gracza — centrum, zawsze góra ──────────────────────────────
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx,     cy - 8);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── 8. Krawędź koła ───────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.60)';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();   // undo clip

    // ── 9. Etykiety kompasu (poza clipem) ─────────────────────────────────────
    // Wyprowadzenie kierunków (facing=0 = +Z):
    //   N (-Z): dx = -sin(f),  dy = +cos(f)
    //   S (+Z): dx = +sin(f),  dy = -cos(f)
    //   E (+X): dx = -cos(f),  dy = -sin(f)
    //   W (-X): dx = +cos(f),  dy = +sin(f)
    const compassR = R + 11;
    const sF = Math.sin(entityFacing);
    const cF = Math.cos(entityFacing);

    ctx.font         = 'bold 10px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const label = (text, dx, dy, color, glow) => {
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 4; }
      ctx.fillStyle = color;
      ctx.fillText(text, cx + dx * compassR, cy + dy * compassR);
      ctx.shadowBlur = 0;
    };

    label('N', -sF,  cF, '#FF4444', true);
    label('S',  sF, -cF, 'rgba(255,255,255,0.75)');
    label('E', -cF, -sF, 'rgba(255,255,255,0.75)');
    label('W',  cF,  sF, 'rgba(255,255,255,0.75)');
  }

  show() { this._wrap.style.display = 'block'; }
  hide() { this._wrap.style.display = 'none'; }
}
