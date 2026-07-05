/**
 * SeasonSystem — 4 seasons cycling every 24 real hours.
 *
 * Cycle: spring → summer → autumn → winter → spring …
 * Real-time based: localStorage stores the start-of-cycle timestamp
 * so the season survives page reloads.
 *
 * Provides per-season atmosphere tweaks:
 *   skyTint     THREE.Color  — blended into sky colour
 *   ambientTint THREE.Color  — ambient light bias
 *   fogMult     number       — multiply base fog density
 *   isWinter    boolean      — WeatherSystem uses this for snow
 *
 * Also adds an on-screen season indicator that fades in for ~4 s on change.
 */

import * as THREE from 'three';

const SEASON_DURATION_MS = 24 * 60 * 60 * 1000;   // 24 real hours per season
const LS_KEY = 'ww_season_start';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const SEASON_CONFIG = {
  spring: {
    label:      '🌸 Wiosna',
    skyTint:    new THREE.Color(0.88, 0.97, 0.88),   // slightly green-tinted sky
    ambientHex: 0xFFEEDD,
    fogMult:    1.0,
    isWinter:   false,
  },
  summer: {
    label:      '☀️ Lato',
    skyTint:    new THREE.Color(0.85, 0.92, 1.00),   // bright clear blue
    ambientHex: 0xFFEECC,
    fogMult:    0.85,
    isWinter:   false,
  },
  autumn: {
    label:      '🍂 Jesień',
    skyTint:    new THREE.Color(1.00, 0.88, 0.72),   // warm orange-brown tint
    ambientHex: 0xFFDDAA,
    fogMult:    1.20,
    isWinter:   false,
  },
  winter: {
    label:      '❄️ Zima',
    skyTint:    new THREE.Color(0.82, 0.88, 0.98),   // cold blue-white
    ambientHex: 0xCCDDFF,
    fogMult:    1.40,
    isWinter:   true,
  },
};

export class SeasonSystem {
  constructor() {
    // Load or initialise the cycle start timestamp
    let saved = parseInt(localStorage.getItem(LS_KEY), 10);
    if (!saved || isNaN(saved)) {
      saved = Date.now();
      localStorage.setItem(LS_KEY, saved);
    }
    this._cycleStart = saved;
    this._prevSeason = null;

    // Build the UI badge
    this._badge = this._buildBadge();
  }

  _buildBadge() {
    const el = document.createElement('div');
    el.id = 'season-badge';
    Object.assign(el.style, {
      position:   'fixed',
      top:        '52px',
      left:       '50%',
      transform:  'translateX(-50%)',
      color:      'white',
      font:       'bold 18px Arial, sans-serif',
      textShadow: '0 2px 8px rgba(0,0,0,0.7)',
      background: 'rgba(0,0,0,0.45)',
      padding:    '8px 28px',
      borderRadius: '999px',
      pointerEvents: 'none',
      transition:  'opacity 0.8s',
      opacity:     '0',
      zIndex:      '50',
    });
    document.body.appendChild(el);
    return el;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  update(dt) {
    const elapsed  = Date.now() - this._cycleStart;
    const idx      = Math.floor(elapsed / SEASON_DURATION_MS) % 4;
    this._season   = SEASONS[idx];

    // Show badge when season changes
    if (this._season !== this._prevSeason) {
      this._prevSeason = this._season;
      this._showBadge(SEASON_CONFIG[this._season].label);
    }
  }

  _showBadge(text) {
    this._badge.textContent = text;
    this._badge.style.opacity = '1';
    clearTimeout(this._badgeTimer);
    this._badgeTimer = setTimeout(() => {
      this._badge.style.opacity = '0';
    }, 4000);
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  get season()      { return this._season ?? 'summer'; }
  get isWinter()    { return this._season === 'winter'; }
  get config()      { return SEASON_CONFIG[this.season]; }

  /** THREE.Color to blend into sky (used by SkySystem) */
  get skyTint()     { return SEASON_CONFIG[this.season]?.skyTint ?? null; }

  /** Fog density multiplier */
  get fogMult()     { return SEASON_CONFIG[this.season]?.fogMult ?? 1; }

  /** Force a specific season (debug / testing) */
  setSeason(name) {
    if (!SEASON_CONFIG[name]) return;
    const idx  = SEASONS.indexOf(name);
    const now  = Date.now();
    // Rewind cycle start so we land at the desired season
    this._cycleStart = now - idx * SEASON_DURATION_MS;
    localStorage.setItem(LS_KEY, this._cycleStart);
  }

  dispose() {
    clearTimeout(this._badgeTimer);
    this._badge?.remove();
  }
}
