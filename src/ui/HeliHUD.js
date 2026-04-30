/**
 * HeliHUD — cockpit HUD overlay for the helicopter.
 *
 * Instruments:
 *   ADI  — Attitude Director Indicator (artificial horizon), canvas
 *   SPD  — airspeed tape (km/h)
 *   ALT  — altitude tape (m)
 *   HDG  — heading compass strip + text
 *   VSI  — vertical speed indicator
 *   WPN  — weapon ready / cooldown bar
 */

const GREEN  = '#00ff88';
const AMBER  = '#ffcc00';
const WHITE  = '#ffffff';
const RED    = '#ff4444';
const SKY_C  = '#1a3a6a';
const GND_C  = '#4a2e10';

export class HeliHUD {
  constructor() {
    this._container    = null;
    this._adiCanvas    = null;
    this._adiCtx       = null;
    this._cmpCanvas    = null;
    this._cmpCtx       = null;
    this._spdEl        = null;
    this._altEl        = null;
    this._vsiEl        = null;
    this._hdgEl        = null;
    this._wpnLbl       = null;
    this._wpnBar       = null;
    this._spdTape      = null;
    this._altTape      = null;
    this._spdTapeCtx   = null;
    this._altTapeCtx   = null;

    this._build();
    this.hide();
  }

  // ── DOM build ─────────────────────────────────────────────────────────────

  _build() {
    this._injectCSS();

    this._container = document.createElement('div');
    this._container.id = 'heli-hud';
    this._container.innerHTML = `
      <!-- Top status bar -->
      <div class="hud-topbar">
        <span class="hud-mode">◈ POLICE HELICOPTER</span>
        <span id="heli-hdg-text" class="hud-hdg-text">HDG 000° N</span>
        <span id="heli-wpn-lbl" class="hud-wpn-lbl">◆ READY</span>
      </div>

      <!-- Main instrument row -->
      <div class="hud-row">

        <!-- Airspeed tape (canvas) -->
        <div class="hud-tape-box">
          <div class="hud-tape-label">IAS</div>
          <canvas id="heli-spd-tape" width="64" height="180"></canvas>
          <div class="hud-tape-label">km/h</div>
        </div>

        <!-- ADI + compass column -->
        <div class="hud-center-col">
          <!-- Artificial horizon -->
          <canvas id="heli-adi" width="180" height="180"></canvas>
          <!-- Heading compass strip -->
          <canvas id="heli-cmp" width="260" height="44"></canvas>
        </div>

        <!-- Altitude tape (canvas) -->
        <div class="hud-tape-box">
          <div class="hud-tape-label">ALT</div>
          <canvas id="heli-alt-tape" width="64" height="180"></canvas>
          <div class="hud-tape-label">m</div>
        </div>

      </div>

      <!-- Bottom status strip -->
      <div class="hud-bottom">
        <span id="heli-vsi" class="hud-vsi">V/S  ±0.0 m/s</span>
        <div class="hud-wpn-wrap">
          <span class="hud-label-sm">WPN</span>
          <div id="heli-wpn-bar" class="hud-wpn-bar"><div id="heli-wpn-fill" class="hud-wpn-fill"></div></div>
        </div>
        <span id="heli-g" class="hud-g">G ×1.0</span>
      </div>
    `;
    document.body.appendChild(this._container);

    // Cache canvas refs
    this._adiCanvas  = document.getElementById('heli-adi');
    this._adiCtx     = this._adiCanvas.getContext('2d');
    this._cmpCanvas  = document.getElementById('heli-cmp');
    this._cmpCtx     = this._cmpCanvas.getContext('2d');
    this._spdTape    = document.getElementById('heli-spd-tape');
    this._spdTapeCtx = this._spdTape.getContext('2d');
    this._altTape    = document.getElementById('heli-alt-tape');
    this._altTapeCtx = this._altTape.getContext('2d');

    // Cache text element refs
    this._hdgEl    = document.getElementById('heli-hdg-text');
    this._wpnLbl   = document.getElementById('heli-wpn-lbl');
    this._vsiEl    = document.getElementById('heli-vsi');
    this._wpnFill  = document.getElementById('heli-wpn-fill');
    this._gEl      = document.getElementById('heli-g');
  }

  _injectCSS() {
    if (document.getElementById('heli-hud-style')) return;
    const s = document.createElement('style');
    s.id = 'heli-hud-style';
    s.textContent = `
      #heli-hud {
        position: fixed;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding-bottom: 6px;
        pointer-events: none;
        user-select: none;
        font-family: 'Courier New', Courier, monospace;
        color: ${GREEN};
        text-shadow: 0 0 7px ${GREEN};
        z-index: 200;
      }
      .hud-topbar {
        display: flex;
        gap: 24px;
        align-items: center;
        background: rgba(0,0,0,0.55);
        border: 1px solid ${GREEN}55;
        border-radius: 3px;
        padding: 3px 14px;
        font-size: 11px;
        letter-spacing: 1px;
      }
      .hud-mode  { color: ${WHITE}; opacity: 0.7; }
      .hud-hdg-text { font-weight: bold; font-size: 12px; }
      .hud-wpn-lbl  { font-size: 11px; }
      .hud-wpn-lbl.firing { color: ${AMBER}; text-shadow: 0 0 7px ${AMBER}; }

      .hud-row {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .hud-tape-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .hud-tape-label {
        font-size: 10px;
        letter-spacing: 1px;
        opacity: 0.7;
      }
      #heli-spd-tape, #heli-alt-tape {
        border: 1px solid ${GREEN}55;
        border-radius: 2px;
        background: rgba(0,0,0,0.5);
        display: block;
      }
      .hud-center-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      #heli-adi {
        border-radius: 50%;
        border: 2px solid ${GREEN};
        box-shadow: 0 0 10px ${GREEN}44;
        display: block;
      }
      #heli-cmp {
        border: 1px solid ${GREEN}55;
        border-radius: 2px;
        display: block;
        background: rgba(0,0,0,0.5);
      }
      .hud-bottom {
        display: flex;
        gap: 20px;
        align-items: center;
        background: rgba(0,0,0,0.55);
        border: 1px solid ${GREEN}55;
        border-radius: 3px;
        padding: 4px 16px;
        font-size: 11px;
      }
      .hud-vsi { min-width: 130px; }
      .hud-g   { min-width: 60px; }
      .hud-wpn-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hud-label-sm { font-size: 10px; opacity: 0.7; letter-spacing: 1px; }
      .hud-wpn-bar {
        width: 80px; height: 9px;
        border: 1px solid ${GREEN}88;
        border-radius: 2px;
        overflow: hidden;
        background: rgba(0,0,0,0.4);
      }
      .hud-wpn-fill {
        height: 100%;
        width: 100%;
        background: ${GREEN};
        transition: width 0.05s linear;
        box-shadow: 0 0 4px ${GREEN};
      }
    `;
    document.head.appendChild(s);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  show() { this._container.style.display = 'flex'; }
  hide() { this._container.style.display = 'none'; }

  /**
   * @param {{
   *   alt: number,        altitude [m]
   *   speedKmh: number,   horizontal speed [km/h]
   *   velY: number,       vertical velocity [m/s] (+ = up)
   *   heading: number,    heading [radians, 0 = +Z north]
   *   shootCooldown: number,
   *   shootCdMax: number,
   *   pitchRad: number,   nose pitch angle [rad] (neg = nose down)
   *   bankRad: number,    bank angle [rad] (pos = right wing down)
   *   gForce: number,
   * }} params
   */
  update(params) {
    const {
      alt = 0, speedKmh = 0, velY = 0,
      heading = 0, shootCooldown = 0, shootCdMax = 0.14,
      pitchRad = 0, bankRad = 0, gForce = 1,
    } = params;

    // Heading in degrees (game: facing=0 → +Z. North = 0°, East = 90°)
    const hdgDeg = (((-heading * 180 / Math.PI) % 360) + 360) % 360;
    const dirs   = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                    'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dirStr = dirs[Math.round(hdgDeg / 22.5) % 16];
    this._hdgEl.textContent = `HDG ${String(Math.round(hdgDeg)).padStart(3,'0')}° ${dirStr}`;

    // Weapon bar
    const cdFrac  = Math.min(1, shootCooldown / shootCdMax);
    const wpnRdy  = cdFrac < 0.05;
    this._wpnFill.style.width = `${Math.round((1 - cdFrac) * 100)}%`;
    this._wpnFill.style.background = wpnRdy ? GREEN : AMBER;
    this._wpnLbl.textContent  = wpnRdy ? '◆ READY' : '◆ FIRE';
    this._wpnLbl.className    = 'hud-wpn-lbl' + (wpnRdy ? '' : ' firing');

    // VSI
    const vsiSign = velY >= 0 ? '▲ +' : '▼ ';
    this._vsiEl.textContent = `V/S  ${vsiSign}${Math.abs(velY).toFixed(1)} m/s`;
    this._vsiEl.style.color = Math.abs(velY) > 5 ? AMBER : GREEN;

    // G-force
    this._gEl.textContent = `G ×${Math.abs(gForce).toFixed(1)}`;

    // Draw instruments
    this._drawADI(pitchRad, bankRad);
    this._drawSpdTape(speedKmh);
    this._drawAltTape(alt);
    this._drawCompass(hdgDeg);
  }

  // ── ADI — Artificial horizon ──────────────────────────────────────────────

  _drawADI(pitchRad, bankRad) {
    const ctx  = this._adiCtx;
    const W    = this._adiCanvas.width;
    const H    = this._adiCanvas.height;
    const cx   = W / 2;
    const cy   = H / 2;
    const R    = W / 2 - 2;

    ctx.clearRect(0, 0, W, H);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Rotate whole scene by bank angle
    ctx.translate(cx, cy);
    ctx.rotate(bankRad);

    // Pitch offset — 1 radian = H * 0.55 pixels
    const PX_RAD   = H * 0.55;
    const pitchOff = pitchRad * PX_RAD;

    // Sky
    ctx.fillStyle = SKY_C;
    ctx.fillRect(-W, -H * 2 - pitchOff, W * 2, H * 2);

    // Ground
    ctx.fillStyle = GND_C;
    ctx.fillRect(-W, -pitchOff, W * 2, H * 2);

    // Horizon line
    ctx.strokeStyle = WHITE;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(-W, -pitchOff);
    ctx.lineTo( W, -pitchOff);
    ctx.stroke();

    // Pitch ladder (every 5°, ±30° range)
    ctx.font      = '9px Courier New';
    ctx.textAlign = 'center';
    for (let deg = -30; deg <= 30; deg += 5) {
      if (deg === 0) continue;
      const pRad = deg * Math.PI / 180;
      const y    = -pitchOff + pRad * PX_RAD;
      const major = Math.abs(deg) % 10 === 0;
      const lw    = major ? 38 : 22;
      ctx.strokeStyle = `rgba(255,255,255,${major ? 0.85 : 0.45})`;
      ctx.lineWidth   = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(-lw, y);
      ctx.lineTo( lw, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        const lbl = Math.abs(deg).toString();
        ctx.fillText(lbl, -lw - 12, y + 3.5);
        ctx.fillText(lbl,  lw + 12, y + 3.5);
      }
    }

    ctx.restore(); // restore clip + rotation

    // ── Fixed overlay (always upright) ──────────────────────────────────────

    // Wing bars
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy);  ctx.lineTo(cx - 14, cy);  // left
    ctx.moveTo(cx + 14, cy);  ctx.lineTo(cx + 52, cy);  // right
    ctx.stroke();

    // Center dot
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Bank angle arc
    const arcR = R - 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();

    // Bank tick marks at 0, ±10, ±20, ±30, ±45°
    for (const ang of [-45,-30,-20,-10,0,10,20,30,45]) {
      const a    = -Math.PI / 2 + ang * Math.PI / 180;
      const len  = ang === 0 || Math.abs(ang) === 30 || Math.abs(ang) === 45 ? 8 : 5;
      const x0   = cx + arcR       * Math.cos(a);
      const y0   = cy + arcR       * Math.sin(a);
      const x1   = cx + (arcR-len) * Math.cos(a);
      const y1   = cy + (arcR-len) * Math.sin(a);
      ctx.strokeStyle = ang === 0 ? WHITE : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = ang === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Bank indicator triangle (rotates with bankRad)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bankRad);
    ctx.fillStyle   = WHITE;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -(arcR));
    ctx.lineTo(-5, -(arcR - 11));
    ctx.lineTo( 5, -(arcR - 11));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Outer ring
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Speed tape ────────────────────────────────────────────────────────────

  _drawSpdTape(speedKmh) {
    const ctx = this._spdTapeCtx;
    const W   = this._spdTape.width;
    const H   = this._spdTape.height;
    const spd = Math.max(0, speedKmh);
    const cy  = H / 2;
    const PX  = 3;          // pixels per km/h

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // Tick marks
    const lo = Math.floor((spd - H / (2 * PX)) / 10) * 10;
    const hi = Math.ceil ((spd + H / (2 * PX)) / 10) * 10;

    ctx.font      = '9px Courier New';
    ctx.textAlign = 'right';
    for (let v = lo; v <= hi; v += 10) {
      if (v < 0) continue;
      const y     = cy - (v - spd) * PX;
      const major = v % 50 === 0;
      ctx.strokeStyle = major ? `rgba(0,255,136,0.8)` : `rgba(255,255,255,0.3)`;
      ctx.lineWidth   = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(W - (major ? 12 : 7), y);
      ctx.lineTo(W, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = GREEN;
        ctx.fillText(v.toString(), W - 14, y + 3.5);
      }
    }

    // Highlight band for current reading
    ctx.fillStyle = 'rgba(0,255,136,0.12)';
    ctx.fillRect(0, cy - 14, W, 28);

    // Current speed box
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, cy - 13, W - 2, 26);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(0, cy - 13, W - 2, 26);

    ctx.fillStyle   = GREEN;
    ctx.font        = 'bold 14px Courier New';
    ctx.textAlign   = 'center';
    ctx.fillText(Math.round(spd).toString(), W / 2, cy + 5);

    // Pointer triangle
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(7, cy - 5);
    ctx.lineTo(7, cy + 5);
    ctx.fill();
  }

  // ── Altitude tape ─────────────────────────────────────────────────────────

  _drawAltTape(alt) {
    const ctx = this._altTapeCtx;
    const W   = this._altTape.width;
    const H   = this._altTape.height;
    const cy  = H / 2;
    const PX  = 2;          // pixels per metre

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // Danger zone — below 15 m
    if (alt < 40) {
      const t = Math.max(0, 1 - alt / 40);
      ctx.fillStyle = `rgba(255,68,68,${t * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }

    const lo = Math.floor((alt - H / (2 * PX)) / 10) * 10;
    const hi = Math.ceil ((alt + H / (2 * PX)) / 10) * 10;

    ctx.font      = '9px Courier New';
    ctx.textAlign = 'left';
    for (let v = lo; v <= hi; v += 10) {
      if (v < 0) continue;
      const y     = cy - (v - alt) * PX;
      const major = v % 50 === 0;
      ctx.strokeStyle = major ? `rgba(0,255,136,0.8)` : `rgba(255,255,255,0.3)`;
      ctx.lineWidth   = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(major ? 12 : 7, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = GREEN;
        ctx.fillText(v.toString(), 14, y + 3.5);
      }
    }

    // Highlight band
    ctx.fillStyle = 'rgba(0,255,136,0.12)';
    ctx.fillRect(0, cy - 14, W, 28);

    // Current alt box
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(2, cy - 13, W, 26);
    ctx.strokeStyle = alt < 15 ? RED : GREEN;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(2, cy - 13, W, 26);

    ctx.fillStyle   = alt < 15 ? RED : GREEN;
    ctx.font        = 'bold 13px Courier New';
    ctx.textAlign   = 'center';
    ctx.fillText(Math.round(alt).toString(), W / 2 + 2, cy + 4.5);

    // Ground proximity warning
    if (alt < 15) {
      ctx.fillStyle = RED;
      ctx.font      = 'bold 8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('GROUND', W / 2, cy - 16);
    }

    // Pointer triangle (right side)
    ctx.fillStyle = alt < 15 ? RED : GREEN;
    ctx.beginPath();
    ctx.moveTo(W, cy);
    ctx.lineTo(W - 7, cy - 5);
    ctx.lineTo(W - 7, cy + 5);
    ctx.fill();
  }

  // ── Heading compass strip ─────────────────────────────────────────────────

  _drawCompass(hdgDeg) {
    const ctx = this._cmpCtx;
    const W   = this._cmpCanvas.width;
    const H   = this._cmpCanvas.height;
    const cx  = W / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // 3 degrees per pixel — show ±43° range
    const PPD = W / 86;

    const LABELS = {
      0:'N', 45:'NE', 90:'E', 135:'SE',
      180:'S', 225:'SW', 270:'W', 315:'NW',
    };

    for (let offset = -45; offset <= 45; offset++) {
      const deg = ((Math.round(hdgDeg) + offset + 360) % 360);
      const x   = cx + offset * PPD;
      const is10  = deg % 10 === 0;
      const is30  = deg % 30 === 0;
      const isCard = deg % 90 === 0;
      const isOrd  = deg % 45 === 0 && !isCard;

      if (!is10 && !isCard && !isOrd) continue;

      const tickH = isCard ? 16 : isOrd ? 11 : is10 ? 7 : 4;
      ctx.strokeStyle = isCard ? GREEN : isOrd ? 'rgba(0,255,136,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth   = isCard ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, H - tickH);
      ctx.lineTo(x, H);
      ctx.stroke();

      if (isCard || isOrd) {
        const lbl = LABELS[deg] ?? '';
        ctx.fillStyle   = isCard ? GREEN : 'rgba(255,255,255,0.7)';
        ctx.font        = isCard ? 'bold 12px Courier New' : '10px Courier New';
        ctx.textAlign   = 'center';
        if (lbl) ctx.fillText(lbl, x, H - tickH - 3);
      } else if (is30) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font      = '8px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(String(deg).padStart(3,'0'), x, H - tickH - 3);
      }
    }

    // Center heading indicator (triangle + line)
    ctx.fillStyle   = AMBER;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx - 6, 10);
    ctx.lineTo(cx + 6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = `${AMBER}88`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx, H);
    ctx.stroke();

    // Border
    ctx.strokeStyle = `${GREEN}55`;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, 0, W, H);
  }
}
