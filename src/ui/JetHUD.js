/**
 * JetHUD — cockpit HUD overlay for fighter jet (F-16) and bomber (B-29).
 *
 * Instruments:
 *   ADI       — Attitude Director Indicator (artificial horizon)
 *   SPD tape  — airspeed (km/h)
 *   ALT tape  — altitude (m)
 *   HDG       — heading compass strip
 *   THR       — throttle bar 0-100%
 *   AFTERBURNER — blinking label when throttle > 0.7 and type === 'jet'
 *   G-force indicator
 */

const GREEN = '#00ff88';
const AMBER = '#ffcc00';
const WHITE = '#ffffff';
const RED   = '#ff4444';
const SKY_C = '#1a3a6a';
const GND_C = '#4a2e10';
const CYAN  = '#00eeff';

export class JetHUD {
  constructor() {
    this._container   = null;
    this._adiCanvas   = null;
    this._adiCtx      = null;
    this._cmpCanvas   = null;
    this._cmpCtx      = null;
    this._spdTape     = null;
    this._spdTapeCtx  = null;
    this._altTape     = null;
    this._altTapeCtx  = null;
    this._hdgEl       = null;
    this._vsiEl       = null;
    this._gEl         = null;
    this._thrFill     = null;
    this._thrPct      = null;
    this._abLabel     = null;
    this._modeEl      = null;

    this._currentType = 'jet';
    this._spdMax      = 500;   // km/h — changes per type

    this._build();
    this.hide();
  }

  // ── DOM build ──────────────────────────────────────────────────────────────

  _build() {
    this._injectCSS();

    this._container = document.createElement('div');
    this._container.id = 'jet-hud';
    this._container.innerHTML = `
      <!-- Top status bar -->
      <div class="jhud-topbar">
        <span id="jet-mode" class="jhud-mode">◈ F-16 FIGHTING FALCON</span>
        <span id="jet-hdg-text" class="jhud-hdg-text">HDG 000° N</span>
        <span id="jet-ab-label" class="jhud-ab-label">▲ AFTERBURNER</span>
      </div>

      <!-- Main instrument row -->
      <div class="jhud-row">

        <!-- Airspeed tape -->
        <div class="jhud-tape-box">
          <div class="jhud-tape-label">IAS</div>
          <canvas id="jet-spd-tape" width="64" height="180"></canvas>
          <div class="jhud-tape-label">km/h</div>
        </div>

        <!-- ADI + compass -->
        <div class="jhud-center-col">
          <canvas id="jet-adi" width="180" height="180"></canvas>
          <canvas id="jet-cmp" width="260" height="44"></canvas>
        </div>

        <!-- Altitude tape -->
        <div class="jhud-tape-box">
          <div class="jhud-tape-label">ALT</div>
          <canvas id="jet-alt-tape" width="64" height="180"></canvas>
          <div class="jhud-tape-label">m</div>
        </div>

      </div>

      <!-- Bottom status strip -->
      <div class="jhud-bottom">
        <span id="jet-vsi" class="jhud-vsi">V/S  ±0.0 m/s</span>
        <div class="jhud-thr-wrap">
          <span class="jhud-label-sm">THR</span>
          <div id="jet-thr-bar" class="jhud-thr-bar">
            <div id="jet-thr-fill" class="jhud-thr-fill"></div>
          </div>
          <span id="jet-thr-pct" class="jhud-label-sm">0%</span>
        </div>
        <span id="jet-g" class="jhud-g">G ×1.0</span>
      </div>
    `;
    document.body.appendChild(this._container);

    // Cache refs
    this._adiCanvas  = document.getElementById('jet-adi');
    this._adiCtx     = this._adiCanvas.getContext('2d');
    this._cmpCanvas  = document.getElementById('jet-cmp');
    this._cmpCtx     = this._cmpCanvas.getContext('2d');
    this._spdTape    = document.getElementById('jet-spd-tape');
    this._spdTapeCtx = this._spdTape.getContext('2d');
    this._altTape    = document.getElementById('jet-alt-tape');
    this._altTapeCtx = this._altTape.getContext('2d');

    this._hdgEl  = document.getElementById('jet-hdg-text');
    this._vsiEl  = document.getElementById('jet-vsi');
    this._gEl    = document.getElementById('jet-g');
    this._thrFill = document.getElementById('jet-thr-fill');
    this._thrPct  = document.getElementById('jet-thr-pct');
    this._abLabel = document.getElementById('jet-ab-label');
    this._modeEl  = document.getElementById('jet-mode');
  }

  _injectCSS() {
    if (document.getElementById('jet-hud-style')) return;
    const s = document.createElement('style');
    s.id = 'jet-hud-style';
    s.textContent = `
      #jet-hud {
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
        z-index: 201;
      }
      .jhud-topbar {
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
      .jhud-mode { color: ${WHITE}; opacity: 0.75; }
      .jhud-hdg-text { font-weight: bold; font-size: 12px; }
      .jhud-ab-label {
        color: ${AMBER};
        text-shadow: 0 0 8px ${AMBER};
        font-weight: bold;
        font-size: 11px;
        animation: ab-blink 0.35s step-end infinite;
      }
      @keyframes ab-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }
      .jhud-row {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .jhud-tape-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .jhud-tape-label {
        font-size: 10px;
        letter-spacing: 1px;
        opacity: 0.7;
      }
      #jet-spd-tape, #jet-alt-tape {
        border: 1px solid ${GREEN}55;
        border-radius: 2px;
        background: rgba(0,0,0,0.5);
        display: block;
      }
      .jhud-center-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      #jet-adi {
        border-radius: 50%;
        border: 2px solid ${CYAN};
        box-shadow: 0 0 10px ${CYAN}44;
        display: block;
      }
      #jet-cmp {
        border: 1px solid ${GREEN}55;
        border-radius: 2px;
        display: block;
        background: rgba(0,0,0,0.5);
      }
      .jhud-bottom {
        display: flex;
        gap: 20px;
        align-items: center;
        background: rgba(0,0,0,0.55);
        border: 1px solid ${GREEN}55;
        border-radius: 3px;
        padding: 4px 16px;
        font-size: 11px;
      }
      .jhud-vsi { min-width: 130px; }
      .jhud-g   { min-width: 60px; }
      .jhud-thr-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .jhud-label-sm { font-size: 10px; opacity: 0.7; letter-spacing: 1px; }
      .jhud-thr-bar {
        width: 80px; height: 9px;
        border: 1px solid ${GREEN}88;
        border-radius: 2px;
        overflow: hidden;
        background: rgba(0,0,0,0.4);
      }
      .jhud-thr-fill {
        height: 100%;
        width: 0%;
        background: ${GREEN};
        transition: width 0.06s linear;
        box-shadow: 0 0 4px ${GREEN};
      }
      .jhud-thr-fill.afterburner {
        background: ${AMBER};
        box-shadow: 0 0 6px ${AMBER};
      }
    `;
    document.head.appendChild(s);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call once when entering aircraft.
   * @param {'jet'|'bomber'} type
   */
  show(type = 'jet') {
    this._currentType = type;
    this._spdMax = type === 'jet' ? 500 : 200;
    if (this._modeEl) {
      this._modeEl.textContent = type === 'jet'
        ? '◈ F-16 FIGHTING FALCON'
        : '◈ B-29 ENOLA GAY';
    }
    this._container.style.display = 'flex';
  }

  hide() { this._container.style.display = 'none'; }

  /**
   * @param {{
   *   alt: number,
   *   speedKmh: number,
   *   velY: number,
   *   heading: number,
   *   throttle: number,
   *   pitchRad: number,
   *   bankRad: number,
   *   gForce: number,
   *   isAfterburner: boolean,
   *   type: string,
   * }} params
   */
  update(params) {
    const {
      alt = 0, speedKmh = 0, velY = 0,
      heading = 0, throttle = 0,
      pitchRad = 0, bankRad = 0, gForce = 1,
      isAfterburner = false,
    } = params;

    // Heading
    const hdgDeg = (((-heading * 180 / Math.PI) % 360) + 360) % 360;
    const dirs   = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                    'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dirStr = dirs[Math.round(hdgDeg / 22.5) % 16];
    if (this._hdgEl) this._hdgEl.textContent = `HDG ${String(Math.round(hdgDeg)).padStart(3,'0')}° ${dirStr}`;

    // Afterburner label
    if (this._abLabel) {
      this._abLabel.style.display = isAfterburner ? 'inline' : 'none';
    }

    // VSI
    if (this._vsiEl) {
      const vsiSign = velY >= 0 ? '▲ +' : '▼ ';
      this._vsiEl.textContent = `V/S  ${vsiSign}${Math.abs(velY).toFixed(1)} m/s`;
      this._vsiEl.style.color = Math.abs(velY) > 8 ? AMBER : GREEN;
    }

    // G-force
    if (this._gEl) this._gEl.textContent = `G ×${Math.abs(gForce).toFixed(1)}`;

    // Throttle bar
    if (this._thrFill) {
      const pct = Math.round(throttle * 100);
      this._thrFill.style.width = `${pct}%`;
      this._thrFill.className = 'jhud-thr-fill' + (isAfterburner ? ' afterburner' : '');
    }
    if (this._thrPct) {
      this._thrPct.textContent = `${Math.round(throttle * 100)}%`;
    }

    // Draw instruments
    this._drawADI(pitchRad, bankRad);
    this._drawSpdTape(speedKmh);
    this._drawAltTape(alt);
    this._drawCompass(hdgDeg);
  }

  // ── ADI ────────────────────────────────────────────────────────────────────

  _drawADI(pitchRad, bankRad) {
    const ctx = this._adiCtx;
    const W   = this._adiCanvas.width;
    const H   = this._adiCanvas.height;
    const cx  = W / 2;
    const cy  = H / 2;
    const R   = W / 2 - 2;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(bankRad);

    const PX_RAD   = H * 0.55;
    const pitchOff = pitchRad * PX_RAD;

    ctx.fillStyle = SKY_C;
    ctx.fillRect(-W, -H * 2 - pitchOff, W * 2, H * 2);

    ctx.fillStyle = GND_C;
    ctx.fillRect(-W, -pitchOff, W * 2, H * 2);

    ctx.strokeStyle = WHITE;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(-W, -pitchOff);
    ctx.lineTo( W, -pitchOff);
    ctx.stroke();

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
    ctx.restore();

    // Fixed overlay
    ctx.strokeStyle = CYAN;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy);  ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy);  ctx.lineTo(cx + 52, cy);
    ctx.stroke();

    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    const arcR = R - 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();

    for (const ang of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
      const a   = -Math.PI / 2 + ang * Math.PI / 180;
      const len = ang === 0 || Math.abs(ang) === 30 || Math.abs(ang) === 45 ? 8 : 5;
      const x0  = cx + arcR       * Math.cos(a);
      const y0  = cy + arcR       * Math.sin(a);
      const x1  = cx + (arcR-len) * Math.cos(a);
      const y1  = cy + (arcR-len) * Math.sin(a);
      ctx.strokeStyle = ang === 0 ? WHITE : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = ang === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
    }

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

    ctx.strokeStyle = CYAN;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Speed tape ─────────────────────────────────────────────────────────────

  _drawSpdTape(speedKmh) {
    const ctx  = this._spdTapeCtx;
    const W    = this._spdTape.width;
    const H    = this._spdTape.height;
    const spd  = Math.max(0, speedKmh);
    const cy   = H / 2;
    // Scale: more compressed for jets (max 500 km/h) vs heli (max 280 km/h)
    const PX   = this._currentType === 'jet' ? 1.2 : 2.5;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    const step = this._currentType === 'jet' ? 50 : 20;
    const lo   = Math.floor((spd - H / (2 * PX)) / step) * step;
    const hi   = Math.ceil ((spd + H / (2 * PX)) / step) * step;

    ctx.font      = '9px Courier New';
    ctx.textAlign = 'right';
    for (let v = lo; v <= hi; v += step) {
      if (v < 0) continue;
      const y     = cy - (v - spd) * PX;
      ctx.strokeStyle = `rgba(0,255,136,0.8)`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(W - 12, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.fillText(v.toString(), W - 14, y + 3.5);
    }

    ctx.fillStyle = 'rgba(0,255,136,0.12)';
    ctx.fillRect(0, cy - 14, W, 28);

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, cy - 13, W - 2, 26);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(0, cy - 13, W - 2, 26);

    ctx.fillStyle   = GREEN;
    ctx.font        = 'bold 13px Courier New';
    ctx.textAlign   = 'center';
    ctx.fillText(Math.round(spd).toString(), W / 2, cy + 5);

    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(7, cy - 5);
    ctx.lineTo(7, cy + 5);
    ctx.fill();
  }

  // ── Altitude tape ──────────────────────────────────────────────────────────

  _drawAltTape(alt) {
    const ctx = this._altTapeCtx;
    const W   = this._altTape.width;
    const H   = this._altTape.height;
    const cy  = H / 2;
    // Jets fly much higher — use finer pixel/metre scale
    const PX  = this._currentType === 'jet' ? 0.8 : 1.2;
    const step = this._currentType === 'jet' ? 200 : 50;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    if (alt < 40) {
      const t = Math.max(0, 1 - alt / 40);
      ctx.fillStyle = `rgba(255,68,68,${t * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }

    const lo = Math.floor((alt - H / (2 * PX)) / step) * step;
    const hi = Math.ceil ((alt + H / (2 * PX)) / step) * step;

    ctx.font      = '9px Courier New';
    ctx.textAlign = 'left';
    for (let v = lo; v <= hi; v += step) {
      if (v < 0) continue;
      const y = cy - (v - alt) * PX;
      ctx.strokeStyle = `rgba(0,255,136,0.8)`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(12, y);
      ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.fillText(v.toString(), 14, y + 3.5);
    }

    ctx.fillStyle = 'rgba(0,255,136,0.12)';
    ctx.fillRect(0, cy - 14, W, 28);

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(2, cy - 13, W, 26);
    ctx.strokeStyle = alt < 15 ? RED : GREEN;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(2, cy - 13, W, 26);

    ctx.fillStyle  = alt < 15 ? RED : GREEN;
    ctx.font       = 'bold 13px Courier New';
    ctx.textAlign  = 'center';
    ctx.fillText(Math.round(alt).toString(), W / 2 + 2, cy + 4.5);

    if (alt < 15) {
      ctx.fillStyle = RED;
      ctx.font      = 'bold 8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('GROUND', W / 2, cy - 16);
    }

    ctx.fillStyle = alt < 15 ? RED : GREEN;
    ctx.beginPath();
    ctx.moveTo(W, cy);
    ctx.lineTo(W - 7, cy - 5);
    ctx.lineTo(W - 7, cy + 5);
    ctx.fill();
  }

  // ── Heading compass ────────────────────────────────────────────────────────

  _drawCompass(hdgDeg) {
    const ctx = this._cmpCtx;
    const W   = this._cmpCanvas.width;
    const H   = this._cmpCanvas.height;
    const cx  = W / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    const PPD = W / 86;
    const LABELS = {
      0:'N', 45:'NE', 90:'E', 135:'SE',
      180:'S', 225:'SW', 270:'W', 315:'NW',
    };

    for (let offset = -45; offset <= 45; offset++) {
      const deg    = ((Math.round(hdgDeg) + offset + 360) % 360);
      const x      = cx + offset * PPD;
      const is10   = deg % 10 === 0;
      const is30   = deg % 30 === 0;
      const isCard = deg % 90 === 0;
      const isOrd  = deg % 45 === 0 && !isCard;

      if (!is10 && !isCard && !isOrd) continue;

      const tickH = isCard ? 16 : isOrd ? 11 : 7;
      ctx.strokeStyle = isCard ? CYAN : isOrd ? `rgba(0,238,255,0.6)` : 'rgba(255,255,255,0.3)';
      ctx.lineWidth   = isCard ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, H - tickH);
      ctx.lineTo(x, H);
      ctx.stroke();

      if (isCard || isOrd) {
        const lbl = LABELS[deg] ?? '';
        ctx.fillStyle   = isCard ? CYAN : 'rgba(255,255,255,0.7)';
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

    // Center indicator
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

    ctx.strokeStyle = `${CYAN}55`;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, 0, W, H);
  }
}
