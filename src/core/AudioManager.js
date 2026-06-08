/**
 * AudioManager — proceduralny dźwięk przez Web Audio API.
 *
 * Zawiera:
 *  • Silnik z 5-biegową skrzynią (RPM rośnie → shift → spada → znowu rośnie)
 *  • Kroki: inny dźwięk na asfalcie vs trawie
 *  • Opony: ciągły szum/pomruk, inny road vs grass, prędkościozależny
 *  • Pisk opon przy poślizgu/hamowaniu — inny na asfalcie i trawie
 *  • Dźwięk hamulca ręcznego
 */

// ─── Konfiguracja biegów ───────────────────────────────────────────────────────
// 5 biegów — przełożenia wzorowane na fizycznym RWD (sportowe sedan):
//   całkowite ratio: 1=12.4, 2=7.2, 3=4.6, 4=2.95, 5=2.35
//   RPM_PER_KMH = ratio × (60 / (2π × WHEEL_R × 3.6)) ≈ ratio × 6.63
const GEAR_UP_KMH    = [20, 42, 68, 115];  // progi zmiany w górę (km/h)
const GEAR_DOWN_KMH  = [12, 27, 48,  85];  // progi zmiany w dół (histereza)
// Przy każdym progu: absSpd × RPM_PER_KMH[gear] ≈ RPM_MAX
// Gear 1: 20×310=6200 | 2: 42×148=6216 | 3: 68×91=6188 | 4: 115×59=6785≈RPM_MAX
// Gear 5: silnik "na czerwonym" od ~131 km/h (6800/52), max prędkość 200 km/h
// Gear 4→5 przy 115 km/h: 4 bieg ma RPM≈MAX → hz=125, 5 bieg=115×52=5980 → hz=122 (skok ~3 Hz!)
const RPM_PER_KMH    = [310, 148, 91, 59, 52];
const RPM_IDLE       = 850;
const RPM_MAX        = 6800;
const SHIFT_COOLDOWN = 0.45;  // blokada po zmianie (anti-ping-pong)

// Mapowanie RPM → częstotliwość oscylatora (Hz).
// sqrt-kompresja górnego zakresu → małe różnice słyszalne między wysokimi biegami.
// Idle: ~30 Hz, max: ~125 Hz; osc2 (3x) dodaje harmoniczne 90–375 Hz.
function rpmToHz(rpm) {
  const t = Math.max(0, (rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE));
  return 30 + Math.sqrt(t) * 95;
}

export class AudioManager {
  constructor() {
    this._ctx         = null;
    this._masterGain  = null;
    this._volume      = 0.82;

    // ── silnik ──
    this._engineOsc1    = null;   // piłkowy — fundamental
    this._engineOsc2    = null;   // sinus    — harmoniczna 3x
    this._engineNoise   = null;   // szum mechaniczny
    this._engineNoiseF  = null;
    this._engineGain    = null;
    this._engineRunning = false;

    // ── biegi ──
    this._gear          = 0;      // indeks 0-4
    this._rpm           = RPM_IDLE;
    this._shiftTimer    = 0;      // cooldown po zmianie

    // ── opony ──
    this._tireNoise     = null;
    this._tireFilter    = null;
    this._tireGain      = null;
    this._tireRunning   = false;
    this._tireOnRoad    = true;

    // ── pisk / poślizg ──
    this._skidNoise     = null;
    this._skidNoise2    = null;
    this._skidNoiseF    = null;
    this._skidGain      = null;
    this._skidLFO       = null;   // pulsacja — oscylator ~8 Hz
    this._skidDC        = null;   // DC offset dla LFO (ConstantSourceNode)
    this._skidActive    = false;

    // ── klakson ──
    this._hornOsc     = null;
    this._hornF       = null;
    this._hornGain    = null;
    this._hornRunning = false;

    // ── UFO beam ──
    this._ufoBeamOsc     = null;
    this._ufoBeamLfo     = null;
    this._ufoBeamGain    = null;
    this._ufoBeamPanner  = null;
    this._ufoBeamRunning = false;

    // ── helikoptery (spatial, jeden wpis na instancję) ──
    this._heliEngines = new Map();  // Helicopter → { panner, masterGain, rotorSrc, turbOsc, lfoOsc, hiSrc }

    // ── odrzutowce i bombowce (spatial) ──
    this._jetEngines    = new Map();  // FighterJet → { panner, masterGain, sawOsc, roarOsc, hiSrc }
    this._bomberEngines = new Map();  // Bomber → { panner, masterGain, osc1, osc2 }
    this._motoEngines   = new Map();  // Motorcycle → { panner, masterGain, osc1, osc2, noiseSrc }

    // ── kroki ──
    this._lastFootFloor = 0;
  }

  // ─── Kontekst ─────────────────────────────────────────────────────────────

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) this._masterGain.gain.value = this._volume;
  }

  _ensureCtx() {
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // ─── Kroki ────────────────────────────────────────────────────────────────

  checkFootstep(walkPhase, isMoving, grounded, onRoad) {
    const floor = Math.floor(walkPhase / Math.PI);
    if (isMoving && grounded && floor !== this._lastFootFloor) {
      this._playFootstep(onRoad);
    }
    this._lastFootFloor = floor;
  }

  _playFootstep(onRoad) {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const buf = this._makeNoise(onRoad ? 0.09 : 0.18);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const f = ctx.createBiquadFilter();
    if (onRoad) {
      // Asfalt: twardy, krótki, wyższe częstotliwości
      f.type = 'bandpass';
      f.frequency.value = 520;
      f.Q.value = 1.1;
    } else {
      // Trawa: miękki szelest, niższe freq
      f.type = 'lowpass';
      f.frequency.value = 160;
      f.Q.value = 0.7;
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(onRoad ? 0.22 : 0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (onRoad ? 0.09 : 0.17));

    src.connect(f); f.connect(g); g.connect(this._masterGain);
    src.start(now);
    src.stop(now + (onRoad ? 0.09 : 0.18));
  }

  // ─── Skok / lądowanie ─────────────────────────────────────────────────────

  playJump() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g); g.connect(this._masterGain);
    osc.start(now); osc.stop(now + 0.15);
  }

  playLand() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.13);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.28, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(og); og.connect(this._masterGain);
    osc.start(now); osc.stop(now + 0.13);

    const buf = this._makeNoise(0.09);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 210;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.20, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(f); f.connect(ng); ng.connect(this._masterGain);
    src.start(now); src.stop(now + 0.09);
  }

  playNPCScream() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const baseHz = 520 + Math.random() * 180;
    osc.frequency.setValueAtTime(baseHz, now);
    osc.frequency.linearRampToValueAtTime(baseHz * (1.18 + Math.random() * 0.14), now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(240 + Math.random() * 60, now + 0.30);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + Math.random() * 500, now);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065 + Math.random() * 0.03, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    osc.start(now);
    osc.stop(now + 0.33);
  }

  // ─── Przestrzenny dźwięk (pozycja w świecie) ──────────────────────────────

  /**
   * Aktualizuj pozycję AudioListener (= uszy gracza/kamera).
   * Wywołaj co klatkę z pozycją gracza/kamery.
   */
  setListenerPos(x, y, z) {
    if (!this._ctx) return;
    const L = this._ctx.listener;
    if (L.positionX) {
      L.positionX.value = x;
      L.positionY.value = y;
      L.positionZ.value = z;
    } else {
      L.setPosition(x, y, z);
    }
  }

  /** Tworzy PannerNode z pozycją (nie podłączony — caller musi .connect()). */
  _makePanner(x, y, z, refDist = 10, maxDist = 120, rolloff = 2.0) {
    const p = this._ctx.createPanner();
    p.panningModel  = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance   = refDist;
    p.maxDistance   = maxDist;
    p.rolloffFactor = rolloff;
    this._setPannerPos(p, x, y, z);
    return p;
  }

  _setPannerPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
  }

  // ─── Silnik helikoptera (spatial, looping) ────────────────────────────────

  /**
   * Wywołaj co klatkę dla każdego helikoptera.
   * Automatycznie startuje dźwięk przy pierwszym wywołaniu po inicjalizacji ctx.
   * @param {object} heli     referencja do instancji Helicopter (klucz w Map)
   * @param {number} x,y,z    pozycja w świecie
   * @param {boolean} occupied  czy gracz siedzi w środku
   */
  updateHeliEngine(heli, x, y, z, occupied) {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    let e = this._heliEngines.get(heli);
    if (!e) {
      e = this._startHeliEngineFor(heli, x, y, z);
      if (!e) return;
    }
    this._setPannerPos(e.panner, x, y, z);
    // Głośność: cicho gdy zaparkowany, głośno gdy pilotowany
    const tgtVol  = occupied ? 0.40 : 0.09;
    const tgtFreq = occupied ? 195  : 128;
    const tgtLFO  = occupied ? 5.2  : 2.1;
    e.masterGain.gain.setTargetAtTime(tgtVol,  now, 0.45);
    e.turbOsc.frequency.setTargetAtTime(tgtFreq, now, 0.90);
    e.lfoOsc.frequency.setTargetAtTime(tgtLFO,  now, 0.55);
  }

  _startHeliEngineFor(heli, x, y, z) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // PannerNode — helikopter słyszalny do ~140 j.ś.
    const panner = this._makePanner(x, y, z, 14, 140, 1.8);
    panner.connect(this._masterGain);

    // Wspólny gain dla tego helikoptera
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.09;
    masterGain.connect(panner);

    // ── 1. Wirnik: szum → lowpass (rotor whomp) ──────────────────────────────
    const rotorBuf = this._makeNoise(2.5);
    const rotorSrc = ctx.createBufferSource();
    rotorSrc.buffer = rotorBuf;
    rotorSrc.loop   = true;

    const rotorLP  = ctx.createBiquadFilter();
    rotorLP.type   = 'lowpass';
    rotorLP.frequency.value = 90;
    rotorLP.Q.value = 2.0;

    // LFO — "klap klap" łopat
    const lfoOsc  = ctx.createOscillator();
    lfoOsc.type   = 'sine';
    lfoOsc.frequency.value = 2.1;
    const lfoAmp  = ctx.createGain();
    lfoAmp.gain.value = 48;  // moduluje cutoff filtra ±48 Hz
    lfoOsc.connect(lfoAmp);
    lfoAmp.connect(rotorLP.frequency);

    const rotorGain = ctx.createGain();
    rotorGain.gain.value = 0.9;
    rotorSrc.connect(rotorLP);
    rotorLP.connect(rotorGain);
    rotorGain.connect(masterGain);
    rotorSrc.start(now);
    lfoOsc.start(now);

    // ── 2. Turbina: piłokształtny → bandpass (whine) ──────────────────────────
    const turbOsc  = ctx.createOscillator();
    turbOsc.type   = 'sawtooth';
    turbOsc.frequency.value = 128;

    const turbBP   = ctx.createBiquadFilter();
    turbBP.type    = 'bandpass';
    turbBP.frequency.value = 260;
    turbBP.Q.value = 1.6;

    const turbGain = ctx.createGain();
    turbGain.gain.value = 0.30;
    turbOsc.connect(turbBP);
    turbBP.connect(turbGain);
    turbGain.connect(masterGain);
    turbOsc.start(now);

    // ── 3. Mechaniczny szum wysokoczęstotliwościowy (skrzynia, przekładnie) ───
    const hiNoiseBuf = this._makeNoise(1.8);
    const hiSrc  = ctx.createBufferSource();
    hiSrc.buffer = hiNoiseBuf;
    hiSrc.loop   = true;
    const hiHP   = ctx.createBiquadFilter();
    hiHP.type    = 'highpass';
    hiHP.frequency.value = 1100;
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.055;
    hiSrc.connect(hiHP);
    hiHP.connect(hiGain);
    hiGain.connect(masterGain);
    hiSrc.start(now);

    const entry = { panner, masterGain, rotorSrc, turbOsc, lfoOsc, hiSrc };
    this._heliEngines.set(heli, entry);
    return entry;
  }

  // ─── Silnik odrzutowy (spatial, looping) ──────────────────────────────────

  /**
   * Wywołaj co klatkę dla każdego myśliwca / boeinga.
   * @param {object} aircraft  referencja do instancji (klucz w Map)
   * @param {number} x,y,z     pozycja w świecie
   * @param {number} throttle  [0..1]
   */
  updateJetEngine(aircraft, x, y, z, throttle) {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    let e = this._jetEngines.get(aircraft);
    if (!e) {
      e = this._startJetEngineFor(aircraft, x, y, z);
      if (!e) return;
    }
    this._setPannerPos(e.panner, x, y, z);

    // Pitch and volume scale with throttle
    const tgtFreq  = 420 + throttle * 380;   // 420 Hz idle → 800 Hz full
    const roarFreq = 180 + throttle * 120;
    const tgtVol   = 0.05 + throttle * 0.40;

    e.masterGain.gain.setTargetAtTime(tgtVol,   now, 0.25);
    e.sawOsc.frequency.setTargetAtTime(tgtFreq,  now, 0.30);
    e.roarOsc.frequency.setTargetAtTime(roarFreq, now, 0.40);
  }

  _startJetEngineFor(aircraft, x, y, z) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const panner = this._makePanner(x, y, z, 14, 180, 2.0);
    panner.connect(this._masterGain);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.05;
    masterGain.connect(panner);

    // 1. Sawtooth turbine whine
    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.value = 420;
    const sawBP = ctx.createBiquadFilter();
    sawBP.type = 'bandpass';
    sawBP.frequency.value = 900;
    sawBP.Q.value = 1.8;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.65;
    sawOsc.connect(sawBP);
    sawBP.connect(sawGain);
    sawGain.connect(masterGain);
    sawOsc.start(now);

    // 2. Low roar oscillator
    const roarOsc = ctx.createOscillator();
    roarOsc.type = 'sawtooth';
    roarOsc.frequency.value = 180;
    const roarLP = ctx.createBiquadFilter();
    roarLP.type = 'lowpass';
    roarLP.frequency.value = 400;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.50;
    roarOsc.connect(roarLP);
    roarLP.connect(roarGain);
    roarGain.connect(masterGain);
    roarOsc.start(now);

    // 3. High-frequency noise
    const hiNoiseBuf = this._makeNoise(2.0);
    const hiSrc = ctx.createBufferSource();
    hiSrc.buffer = hiNoiseBuf;
    hiSrc.loop = true;
    const hiHP = ctx.createBiquadFilter();
    hiHP.type = 'highpass';
    hiHP.frequency.value = 1800;
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.08;
    hiSrc.connect(hiHP);
    hiHP.connect(hiGain);
    hiGain.connect(masterGain);
    hiSrc.start(now);

    const entry = { panner, masterGain, sawOsc, roarOsc, hiSrc };
    this._jetEngines.set(aircraft, entry);
    return entry;
  }

  stopJetEngine(aircraft) {
    const e = this._jetEngines.get(aircraft);
    if (!e || !this._ctx) return;
    const now = this._ctx.currentTime;
    e.masterGain.gain.setTargetAtTime(0.001, now, 0.3);
    const { sawOsc, roarOsc, hiSrc } = e;
    setTimeout(() => {
      try { sawOsc.stop();  } catch (_) {}
      try { roarOsc.stop(); } catch (_) {}
      try { hiSrc.stop();   } catch (_) {}
    }, 1000);
    this._jetEngines.delete(aircraft);
  }

  // ─── Silnik bombowca (spatial, looping) ───────────────────────────────────

  /**
   * Wywołaj co klatkę dla każdego bombowca.
   */
  updateBomberEngine(aircraft, x, y, z, throttle) {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    let e = this._bomberEngines.get(aircraft);
    if (!e) {
      e = this._startBomberEngineFor(aircraft, x, y, z);
      if (!e) return;
    }
    this._setPannerPos(e.panner, x, y, z);

    // 4 radial engines — deep piston rumble
    const baseFreq  = 65 + throttle * 45;   // 65 Hz idle → 110 Hz full
    const beatFreq  = baseFreq * 1.017;     // slight beat/detune for character
    const tgtVol    = 0.06 + throttle * 0.30;

    e.masterGain.gain.setTargetAtTime(tgtVol,     now, 0.5);
    e.osc1.frequency.setTargetAtTime(baseFreq,    now, 0.6);
    e.osc2.frequency.setTargetAtTime(beatFreq,    now, 0.6);
  }

  _startBomberEngineFor(aircraft, x, y, z) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const panner = this._makePanner(x, y, z, 16, 160, 1.8);
    panner.connect(this._masterGain);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.06;
    masterGain.connect(panner);

    // Osc1 — fundamental tłokowy
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 65;
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 320;
    lp1.Q.value = 1.2;
    const g1 = ctx.createGain();
    g1.gain.value = 0.7;
    osc1.connect(lp1);
    lp1.connect(g1);
    g1.connect(masterGain);
    osc1.start(now);

    // Osc2 — lekko roztrojony (beating effect — 4 silniki nigdy idealnie zsynchronizowane)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 66.1;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 300;
    lp2.Q.value = 1.0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.55;
    osc2.connect(lp2);
    lp2.connect(g2);
    g2.connect(masterGain);
    osc2.start(now);

    // Mechaniczny szum (przekładnie)
    const noiseBuf = this._makeNoise(2.2);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = 240;
    noiseBP.Q.value = 1.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;
    noiseSrc.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(now);

    const entry = { panner, masterGain, osc1, osc2, noiseSrc };
    this._bomberEngines.set(aircraft, entry);
    return entry;
  }

  stopBomberEngine(aircraft) {
    const e = this._bomberEngines.get(aircraft);
    if (!e || !this._ctx) return;
    const now = this._ctx.currentTime;
    e.masterGain.gain.setTargetAtTime(0.001, now, 0.4);
    const { osc1, osc2, noiseSrc } = e;
    setTimeout(() => {
      try { osc1.stop();     } catch (_) {}
      try { osc2.stop();     } catch (_) {}
      try { noiseSrc.stop(); } catch (_) {}
    }, 1200);
    this._bomberEngines.delete(aircraft);
  }

  // ─── Silnik motocykla (spatial, looping) ──────────────────────────────────

  /**
   * Wywołaj co klatkę dla motocykla, którym gracz jeździ.
   * throttle: 0..1, speed: 0..1 (frakcja maksymalnej prędkości)
   */
  updateMotorcycleEngine(moto, x, y, z, throttle, speedFrac) {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    let e = this._motoEngines.get(moto);
    if (!e) {
      e = this._startMotorcycleEngineFor(moto, x, y, z);
      if (!e) return;
    }
    this._setPannerPos(e.panner, x, y, z);

    // Wyższe RPM niż w aucie — motocyklowy charakter (~120 Hz idle → ~340 Hz pełne RPM)
    const baseFreq = 120 + speedFrac * 220;
    const beatFreq = baseFreq * 1.012;
    const tgtVol   = 0.06 + (0.18 * throttle + 0.06 * speedFrac);

    e.masterGain.gain.setTargetAtTime(tgtVol,  now, 0.20);
    e.osc1.frequency.setTargetAtTime(baseFreq, now, 0.18);
    e.osc2.frequency.setTargetAtTime(beatFreq, now, 0.18);
    // Filtr otwiera się przy gazie — bardziej agresywny dźwięk
    if (e.lp) {
      const cutoff = 600 + throttle * 1600;
      e.lp.frequency.setTargetAtTime(cutoff, now, 0.20);
    }
    // Rev LFO — "wrrr...mmm" przyspiesza i pogłębia przy gazie/prędkości
    if (e.revLfo && e.revPitchAmp && e.revFilterAmp) {
      const revHz    = 0.9 + throttle * 1.4 + speedFrac * 0.6;   // 0.9 → ~2.9 Hz
      const pitchDep = 18 + speedFrac * 32;                       // ±18..50 Hz
      const filtDep  = 220 + throttle * 380;                      // ±220..600 Hz
      e.revLfo.frequency.setTargetAtTime(revHz,        now, 0.25);
      e.revPitchAmp.gain.setTargetAtTime(pitchDep,     now, 0.25);
      e.revFilterAmp.gain.setTargetAtTime(filtDep,     now, 0.25);
    }
  }

  _startMotorcycleEngineFor(moto, x, y, z) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const panner = this._makePanner(x, y, z, 10, 90, 1.6);
    panner.connect(this._masterGain);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.06;
    masterGain.connect(panner);

    // Wspólny lowpass — otwiera się przy gazie
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.9;
    lp.connect(masterGain);

    // Osc1 — fundament (single cylinder thump)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 120;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    osc1.connect(g1);
    g1.connect(lp);
    osc1.start(now);

    // Osc2 — lekko roztrojony (vibe)
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 121.4;
    const g2 = ctx.createGain();
    g2.gain.value = 0.30;
    osc2.connect(g2);
    g2.connect(lp);
    osc2.start(now);

    // Szum mechaniczny
    const noiseBuf = this._makeNoise(1.6);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = 380;
    noiseBP.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.08;
    noiseSrc.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(now);

    // Rev LFO — "wrrr...mmm" — sinus modulujący pitch obu osc + cutoff filtra
    const revLfo = ctx.createOscillator();
    revLfo.type = 'sine';
    revLfo.frequency.value = 0.9;
    const revPitchAmp = ctx.createGain();
    revPitchAmp.gain.value = 18;
    revLfo.connect(revPitchAmp);
    revPitchAmp.connect(osc1.frequency);
    revPitchAmp.connect(osc2.frequency);
    const revFilterAmp = ctx.createGain();
    revFilterAmp.gain.value = 220;
    revLfo.connect(revFilterAmp);
    revFilterAmp.connect(lp.frequency);
    revLfo.start(now);

    const entry = { panner, masterGain, lp, osc1, osc2, noiseSrc, revLfo, revPitchAmp, revFilterAmp };
    this._motoEngines.set(moto, entry);
    return entry;
  }

  stopMotorcycleEngine(moto) {
    const e = this._motoEngines.get(moto);
    if (!e || !this._ctx) return;
    const now = this._ctx.currentTime;
    e.masterGain.gain.setTargetAtTime(0.001, now, 0.25);
    const { osc1, osc2, noiseSrc, revLfo } = e;
    setTimeout(() => {
      try { osc1.stop();     } catch (_) {}
      try { osc2.stop();     } catch (_) {}
      try { noiseSrc.stop(); } catch (_) {}
      try { revLfo?.stop();  } catch (_) {}
    }, 700);
    this._motoEngines.delete(moto);
  }

  stopHeliEngine(heli) {
    const e = this._heliEngines.get(heli);
    if (!e || !this._ctx) return;
    const now = this._ctx.currentTime;
    e.masterGain.gain.setTargetAtTime(0.001, now, 0.3);
    const { rotorSrc, turbOsc, lfoOsc, hiSrc } = e;
    setTimeout(() => {
      try { rotorSrc.stop(); } catch (_) {}
      try { turbOsc.stop();  } catch (_) {}
      try { lfoOsc.stop();   } catch (_) {}
      try { hiSrc.stop();    } catch (_) {}
    }, 1000);
    this._heliEngines.delete(heli);
  }

  /** @param {number} x,y,z  pozycja UFO w świecie */
  startUFOBeam(x = 0, y = 20, z = 0) {
    if (this._ufoBeamRunning) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    // Panner — UFO słyszalne do ~180 j.ś.
    this._ufoBeamPanner = this._makePanner(x, y, z, 18, 180, 1.2);
    this._ufoBeamPanner.connect(this._masterGain);

    this._ufoBeamOsc = ctx.createOscillator();
    this._ufoBeamOsc.type = 'sawtooth';
    this._ufoBeamOsc.frequency.setValueAtTime(122, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(540, now);
    filter.Q.value = 2.8;

    this._ufoBeamGain = ctx.createGain();
    this._ufoBeamGain.gain.setValueAtTime(0.001, now);
    this._ufoBeamGain.gain.linearRampToValueAtTime(0.05, now + 0.10);

    this._ufoBeamLfo = ctx.createOscillator();
    this._ufoBeamLfo.type = 'sine';
    this._ufoBeamLfo.frequency.setValueAtTime(7.5, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 24;
    this._ufoBeamLfo.connect(lfoGain);
    lfoGain.connect(this._ufoBeamOsc.frequency);

    this._ufoBeamOsc.connect(filter);
    filter.connect(this._ufoBeamGain);
    this._ufoBeamGain.connect(this._ufoBeamPanner);  // → panner → masterGain
    this._ufoBeamOsc.start(now);
    this._ufoBeamLfo.start(now);
    this._ufoBeamRunning = true;
  }

  /** Aktualizuj pozycję UFO co klatkę gdy beam aktywny. */
  updateUFOBeamPos(x, y, z) {
    if (this._ufoBeamPanner) this._setPannerPos(this._ufoBeamPanner, x, y, z);
  }

  stopUFOBeam() {
    if (!this._ufoBeamRunning || !this._ufoBeamGain) return;
    const now = this._ctx.currentTime;
    this._ufoBeamGain.gain.setTargetAtTime(0.001, now, 0.10);
    const osc    = this._ufoBeamOsc;
    const lfo    = this._ufoBeamLfo;
    const panner = this._ufoBeamPanner;
    setTimeout(() => {
      try { osc?.stop();    } catch (_) {}
      try { lfo?.stop();    } catch (_) {}
      try { panner?.disconnect(); } catch (_) {}
    }, 350);
    this._ufoBeamOsc    = null;
    this._ufoBeamLfo    = null;
    this._ufoBeamGain   = null;
    this._ufoBeamPanner = null;
    this._ufoBeamRunning = false;
  }

  // ─── Silnik ───────────────────────────────────────────────────────────────

  /**
   * Rozruch silnika: sekwencja krakania startera → złapanie silnika → bieg jałowy.
   * Wywołaj gdy gracz wsiada do auta (przed właściwą pętlą silnika).
   * @returns {number} czas trwania sekwencji (ms) — po tym czasie silnik "pracuje"
   */
  playEngineStart() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    // ── Faza 1: Starter (0–0.45s) ─────────────────────────────────────────
    // Szybkie "wrrr" — oscylator + szum, narastający i opadający
    const starterOsc = ctx.createOscillator();
    starterOsc.type = 'sawtooth';
    starterOsc.frequency.setValueAtTime(55, now);
    starterOsc.frequency.linearRampToValueAtTime(85, now + 0.35);

    const starterF = ctx.createBiquadFilter();
    starterF.type = 'lowpass';
    starterF.frequency.value = 400;

    const starterG = ctx.createGain();
    starterG.gain.setValueAtTime(0.001, now);
    starterG.gain.linearRampToValueAtTime(0.18, now + 0.08);
    starterG.gain.setValueAtTime(0.18, now + 0.35);
    starterG.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    starterOsc.connect(starterF);
    starterF.connect(starterG);
    starterG.connect(this._masterGain);
    starterOsc.start(now);
    starterOsc.stop(now + 0.46);

    // ── Faza 2: Złapanie (0.4–0.65s) ──────────────────────────────────────
    // Głuchy "buch" + nagłe przyspieszenie RPM
    const catchOsc = ctx.createOscillator();
    catchOsc.type = 'sawtooth';
    catchOsc.frequency.setValueAtTime(70, now + 0.40);
    catchOsc.frequency.exponentialRampToValueAtTime(160, now + 0.60);

    const catchG = ctx.createGain();
    catchG.gain.setValueAtTime(0.001, now + 0.40);
    catchG.gain.linearRampToValueAtTime(0.22, now + 0.44);
    catchG.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    catchOsc.connect(catchG);
    catchG.connect(this._masterGain);
    catchOsc.start(now + 0.40);
    catchOsc.stop(now + 0.65);

    // ── Faza 3: Stabilizacja na biegu jałowym (0.65s+) ────────────────────
    // Krótki "flare" RPM (typowe dla starych aut) potem spokój
    const flareOsc = ctx.createOscillator();
    flareOsc.type = 'sawtooth';
    flareOsc.frequency.setValueAtTime(140, now + 0.64);
    flareOsc.frequency.exponentialRampToValueAtTime(rpmToHz(RPM_IDLE), now + 1.0);

    const flareG = ctx.createGain();
    flareG.gain.setValueAtTime(0.10, now + 0.64);
    flareG.gain.exponentialRampToValueAtTime(0.001, now + 1.05);

    flareOsc.connect(flareG);
    flareG.connect(this._masterGain);
    flareOsc.start(now + 0.64);
    flareOsc.stop(now + 1.05);

    // Właściwy silnik startuje po 0.65s (po złapaniu)
    this._engineStartId = setTimeout(() => this.startEngine(), 640);

    return 640; // ms
  }

  startEngine() {
    if (this._engineRunning) return;
    const ctx = this._ensureCtx();

    this._gear = 0;
    this._rpm  = RPM_IDLE;

    // Osc1 — piłkowy fundamental
    this._engineOsc1 = ctx.createOscillator();
    this._engineOsc1.type = 'sawtooth';
    this._engineOsc1.frequency.value = rpmToHz(RPM_IDLE);

    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 1.0;

    // Osc2 — sinus na 3x freq (gra rolę 3. harmonicznej, dodaje brzmienie)
    this._engineOsc2 = ctx.createOscillator();
    this._engineOsc2.type = 'sine';
    this._engineOsc2.frequency.value = rpmToHz(RPM_IDLE) * 3;

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.18;

    // Szum mechaniczny — bandpass ~350 Hz
    const rate     = ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, rate * 2, rate);
    const nd       = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this._engineNoise = ctx.createBufferSource();
    this._engineNoise.buffer = noiseBuf;
    this._engineNoise.loop   = true;

    this._engineNoiseF = ctx.createBiquadFilter();
    this._engineNoiseF.type = 'bandpass';
    this._engineNoiseF.frequency.value = 350;
    this._engineNoiseF.Q.value = 1.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.022;

    // Master gain silnika — zaczyna cicho, narasta
    this._engineGain = ctx.createGain();
    this._engineGain.gain.setValueAtTime(0.001, ctx.currentTime);
    this._engineGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.6);

    // Graf audio
    this._engineOsc1.connect(osc1Gain);
    this._engineOsc2.connect(osc2Gain);
    this._engineNoise.connect(this._engineNoiseF);
    this._engineNoiseF.connect(noiseGain);

    osc1Gain.connect(this._engineGain);
    osc2Gain.connect(this._engineGain);
    noiseGain.connect(this._engineGain);
    this._engineGain.connect(this._masterGain);

    this._engineOsc1.start();
    this._engineOsc2.start();
    this._engineNoise.start();
    this._engineRunning = true;
  }

  /**
   * Aktualizuj każdą klatkę gdy gracz jedzie autem.
   * @param {number} speedKmh  — prędkość (może być ujemna przy cofaniu)
   * @param {number} gas       — gaz: -1..1 (>0 = przód, <0 = wstecz)
   * @param {number} dt        — delta time (sekundy)
   */
  updateEngine(speedKmh, gas, dt) {
    if (!this._engineRunning || !this._engineOsc1) return;
    const ctx    = this._ctx;
    const absSpd = Math.abs(speedKmh);
    const now    = ctx.currentTime;

    // ── Zmiana biegów ─────────────────────────────────────────────────────
    this._shiftTimer = Math.max(0, this._shiftTimer - dt);
    if (this._shiftTimer === 0) {
      if (this._gear < GEAR_UP_KMH.length && absSpd > GEAR_UP_KMH[this._gear]) {
        this._gear++;
        // RPM po zmianie = prędkość × przełożenie nowego biegu (jak w fizycznym samochodzie)
        this._rpm = Math.max(RPM_IDLE, absSpd * RPM_PER_KMH[this._gear]);
        this._shiftTimer = SHIFT_COOLDOWN;
      } else if (this._gear > 0 && absSpd < GEAR_DOWN_KMH[this._gear - 1]) {
        this._gear--;
        this._shiftTimer = SHIFT_COOLDOWN * 0.5;
      }
    }

    // ── Target RPM na podstawie prędkości i biegu ─────────────────────────
    const targetRpm = Math.max(
      RPM_IDLE,
      absSpd * RPM_PER_KMH[this._gear] + Math.max(0, gas) * 1200,
    );

    // Szybsza odpowiedź audio przy przyspieszaniu, wolniejsza przy odpuszczaniu.
    const tau = Math.abs(gas) > 0.05 ? 0.16 : 0.45;
    this._rpm += (targetRpm - this._rpm) * Math.min(1, dt / tau);
    this._rpm  = Math.min(RPM_MAX, Math.max(RPM_IDLE, this._rpm));

    // ── Oscylatory ────────────────────────────────────────────────────────
    const hz = rpmToHz(this._rpm);
    this._engineOsc1.frequency.setTargetAtTime(hz,     now, 0.06);
    this._engineOsc2.frequency.setTargetAtTime(hz * 3, now, 0.06);

    // Głośność: rośnie trochę z obrotami + lekko z gazem
    const rpmNorm = (this._rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE);
    const spdNorm = Math.min(1, absSpd / 140);
    const vol = 0.06 + rpmNorm * 0.10 + spdNorm * 0.03 + Math.abs(gas) * 0.04;
    this._engineGain.gain.setTargetAtTime(vol, now, 0.06);
  }

  stopEngine() {
    clearTimeout(this._engineStartId);
    if (!this._engineRunning) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    this._engineGain.gain.setTargetAtTime(0.001, now, 0.22);
    this._stopSkid();

    const o1 = this._engineOsc1, o2 = this._engineOsc2, n = this._engineNoise;
    setTimeout(() => {
      try { o1.stop(); } catch (_) {}
      try { o2.stop(); } catch (_) {}
      try { n.stop();  } catch (_) {}
    }, 800);

    this._engineOsc1   = null;
    this._engineOsc2   = null;
    this._engineNoise  = null;
    this._engineRunning = false;
    this._gear = 0;
  }

  // ─── Opony (ciągły dźwięk podczas jazdy) ──────────────────────────────────

  startTires() {
    const ctx  = this._ensureCtx();
    const rate = ctx.sampleRate;
    const buf  = ctx.createBuffer(1, rate * 3, rate);
    const d    = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this._tireNoise = ctx.createBufferSource();
    this._tireNoise.buffer = buf;
    this._tireNoise.loop   = true;

    this._tireFilter = ctx.createBiquadFilter();
    this._tireFilter.type = 'bandpass';
    this._tireFilter.frequency.value = 1100;
    this._tireFilter.Q.value = 1.8;

    this._tireGain = ctx.createGain();
    this._tireGain.gain.value = 0;

    this._tireNoise.connect(this._tireFilter);
    this._tireFilter.connect(this._tireGain);
    this._tireGain.connect(this._masterGain);
    this._tireNoise.start();
    this._tireRunning = true;
    this._tireOnRoad  = true;
  }

  /**
   * Aktualizuj każdą klatkę gdy jedzie auto.
   * @param {number} speedKmh — prędkość
   * @param {boolean} onRoad  — czy na asfalcie
   */
  updateTires(speedKmh, onRoad) {
    if (!this._tireRunning || !this._tireGain) return;
    const ctx    = this._ctx;
    const absSpd = Math.abs(speedKmh);
    const now    = ctx.currentTime;

    // Zmiana brzmienia przy zmianie nawierzchni
    if (onRoad !== this._tireOnRoad) {
      this._tireOnRoad = onRoad;
      if (onRoad) {
        // Asfalt: wysoki syk ~1100 Hz
        this._tireFilter.type = 'bandpass';
        this._tireFilter.frequency.setTargetAtTime(1100, now, 0.3);
        this._tireFilter.Q.setTargetAtTime(1.8, now, 0.3);
      } else {
        // Trawa: niski pomruk ~200 Hz
        this._tireFilter.type = 'lowpass';
        this._tireFilter.frequency.setTargetAtTime(220, now, 0.3);
      }
    }

    if (onRoad) {
      const roadFreq = 900 + Math.min(absSpd, 160) * 11;
      const roadQ = 1.3 + Math.min(absSpd, 140) / 120;
      this._tireFilter.frequency.setTargetAtTime(roadFreq, now, 0.10);
      this._tireFilter.Q.setTargetAtTime(roadQ, now, 0.12);
    } else {
      const grassFreq = 180 + Math.min(absSpd, 120) * 1.8;
      this._tireFilter.frequency.setTargetAtTime(grassFreq, now, 0.14);
    }

    // Głośność: szybciej rośnie na asfalcie, żeby mocniej sprzedać prędkość.
    const vol = absSpd < 2 ? 0 : Math.min((absSpd - 2) / 42, 1) * (onRoad ? 0.17 : 0.16);
    this._tireGain.gain.setTargetAtTime(vol, now, 0.12);
  }

  stopTires() {
    if (!this._tireRunning) return;
    if (this._tireGain) {
      this._tireGain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.2);
    }
    const n = this._tireNoise;
    setTimeout(() => { try { n.stop(); } catch (_) {} }, 600);
    this._tireNoise   = null;
    this._tireRunning = false;
  }

  // ─── Pisk opon / poślizg ──────────────────────────────────────────────────

  /**
   * Wywołuj każdą klatkę gdy jedzie auto.
   * @param {boolean} skidding — czy aktualnie ślizga
   * @param {boolean} onRoad   — nawierzchnia
   */
  updateSkid(skidding, onRoad) {
    if (skidding && !this._skidActive) {
      this._startSkid(onRoad);
    } else if (!skidding && this._skidActive) {
      this._stopSkid();
    }
    if (skidding && this._skidGain) {
      this._skidGain.gain.setTargetAtTime(onRoad ? 0.32 : 0.20, this._ctx.currentTime, 0.05);
    }
  }

  _startSkid(onRoad) {
    const ctx  = this._ensureCtx();
    const now  = ctx.currentTime;
    const rate = ctx.sampleRate;
    this._skidActive = true;

    this._skidGain = ctx.createGain();
    this._skidGain.gain.setValueAtTime(0.001, now);
    this._skidGain.gain.linearRampToValueAtTime(onRoad ? 0.32 : 0.14, now + 0.10);
    this._skidGain.connect(this._masterGain);

    const makeNoiseSrc = () => {
      const buf = ctx.createBuffer(1, rate * 2, rate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      return src;
    };

    if (onRoad) {
      // ── Asfalt: pulsujący wysoki pisk — LFO 8 Hz moduluje amplitudę ──────────
      // pulseGain.gain oscyluje 0→1 (DC 0.5 + LFO ±0.5)
      const pulseGain = ctx.createGain();
      pulseGain.gain.value = 0;
      pulseGain.connect(this._skidGain);

      const dc = new ConstantSourceNode(ctx, { offset: 0.5 });
      this._skidDC = dc;
      dc.connect(pulseGain.gain);
      dc.start(now);

      this._skidLFO = ctx.createOscillator();
      this._skidLFO.type = 'sine';
      this._skidLFO.frequency.value = 8;   // 8 Hz = przerywany pisk
      const lfoAmp = ctx.createGain(); lfoAmp.gain.value = 0.5;
      this._skidLFO.connect(lfoAmp);
      lfoAmp.connect(pulseGain.gain);
      this._skidLFO.start(now);

      // Wąski bandpass 3200 Hz → pulseGain
      this._skidNoise  = makeNoiseSrc();
      this._skidNoiseF = ctx.createBiquadFilter();
      this._skidNoiseF.type = 'bandpass';
      this._skidNoiseF.frequency.value = 3200;
      this._skidNoiseF.Q.value = 10;
      const boost = ctx.createGain(); boost.gain.value = 2.2;
      this._skidNoise.connect(this._skidNoiseF);
      this._skidNoiseF.connect(boost);
      boost.connect(pulseGain);
      this._skidNoise.start(now);

      // High-end syczenie → pulseGain
      this._skidNoise2 = makeNoiseSrc();
      const f2 = ctx.createBiquadFilter();
      f2.type = 'highpass'; f2.frequency.value = 1800;
      const g2 = ctx.createGain(); g2.gain.value = 0.28;
      this._skidNoise2.connect(f2); f2.connect(g2); g2.connect(pulseGain);
      this._skidNoise2.start(now);

    } else {
      // ── Trawa: mokry błotnisty szum — głęboki rumble + "chlupot" ────────────
      // Warstwa 1: głęboki pomruk (lowpass ~120 Hz) — podłoże szumu
      this._skidNoise  = makeNoiseSrc();
      this._skidNoiseF = ctx.createBiquadFilter();
      this._skidNoiseF.type = 'lowpass';
      this._skidNoiseF.frequency.value = 120;
      const g1 = ctx.createGain(); g1.gain.value = 1.4;
      this._skidNoise.connect(this._skidNoiseF);
      this._skidNoiseF.connect(g1);
      g1.connect(this._skidGain);
      this._skidNoise.start(now);

      // Warstwa 2: wilgotny chlupot — bandpass ~320 Hz, umiarkowane Q
      this._skidNoise2 = makeNoiseSrc();
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 320; f2.Q.value = 1.8;
      const g2 = ctx.createGain(); g2.gain.value = 0.85;
      this._skidNoise2.connect(f2); f2.connect(g2); g2.connect(this._skidGain);
      this._skidNoise2.start(now);
    }
  }

  _stopSkid() {
    if (!this._skidActive) return;
    this._skidActive = false;
    if (!this._skidGain) return;
    const now = this._ctx.currentTime;
    this._skidGain.gain.setTargetAtTime(0.001, now, 0.12);
    const n1 = this._skidNoise, n2 = this._skidNoise2;
    const lfo = this._skidLFO,  dc = this._skidDC;
    setTimeout(() => {
      try { n1?.stop();  } catch (_) {}
      try { n2?.stop();  } catch (_) {}
      try { lfo?.stop(); } catch (_) {}
      try { dc?.stop();  } catch (_) {}
    }, 400);
    this._skidNoise  = null;
    this._skidNoise2 = null;
    this._skidLFO    = null;
    this._skidDC     = null;
    this._skidGain   = null;
  }

  // ─── Klakson ──────────────────────────────────────────────────────────────

  /** Zacznij trąbić — ciągły dźwięk klaksonu. */
  startHorn() {
    if (this._hornRunning) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    this._hornOsc  = ctx.createOscillator();
    this._hornOsc.type = 'sawtooth';
    this._hornOsc.frequency.value = 440;
    this._hornF    = ctx.createBiquadFilter();
    this._hornF.type = 'bandpass'; this._hornF.frequency.value = 540; this._hornF.Q.value = 2.2;
    this._hornGain = ctx.createGain();
    this._hornGain.gain.setValueAtTime(0.001, now);
    this._hornGain.gain.linearRampToValueAtTime(0.38, now + 0.06);
    this._hornOsc.connect(this._hornF);
    this._hornF.connect(this._hornGain);
    this._hornGain.connect(this._masterGain);
    this._hornOsc.start(now);
    this._hornRunning = true;
  }

  /** Przestań trąbić. */
  stopHorn() {
    if (!this._hornRunning) return;
    const now = this._ctx.currentTime;
    this._hornGain.gain.setTargetAtTime(0.001, now, 0.05);
    const osc = this._hornOsc;
    setTimeout(() => { try { osc.stop(); } catch (_) {} }, 200);
    this._hornOsc     = null;
    this._hornGain    = null;
    this._hornF       = null;
    this._hornRunning = false;
  }

  // ─── Hamulec ręczny ───────────────────────────────────────────────────────

  /**
   * Odegraj dźwięk zablokowania tylnych kół.
   * Wywołaj gdy B jest wciśnięte i speed > 10 km/h.
   */
  playHandbrake(speedKmh) {
    if (Math.abs(speedKmh) < 8) return;
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const intensity = Math.min(Math.abs(speedKmh) / 60, 1);

    // Pisk + szum wysokoczęstotliwościowy
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.linearRampToValueAtTime(780, now + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 3.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.22 * intensity, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

    osc.connect(f); f.connect(g); g.connect(this._masterGain);
    osc.start(now); osc.stop(now + 0.40);
  }

  // ─── Uderzenia w przeszkody ───────────────────────────────────────────────

  /**
   * Dźwięk uderzenia zależny od materiału przeszkody.
   * @param {'wall'|'wood'|'metal'|'ground'} material
   * @param {number} velocity — prędkość uderzenia (m/s)
   */
  playCollision(material, velocity) {
    if (velocity < 1.5) return;  // za słabe, pomijaj
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const vol = Math.min(velocity / 25, 1);  // normalizuj do 0-1

    if (material === 'wall') {
      // Beton/cegła: głuchy bum + metaliczny brzdęk
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.18);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.35 * vol, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(og); og.connect(this._masterGain);
      osc.start(now); osc.stop(now + 0.18);

      const buf = this._makeNoise(0.12);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 600; f.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.20 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(f); f.connect(ng); ng.connect(this._masterGain);
      src.start(now); src.stop(now + 0.12);

    } else if (material === 'wood') {
      // Drewno (drzewo): suchy trzask
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.10);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.28 * vol, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      osc.connect(og); og.connect(this._masterGain);
      osc.start(now); osc.stop(now + 0.10);

      // Drżenie gałęzi — szum długi
      const buf = this._makeNoise(0.22);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 300; f.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.14 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(f); f.connect(ng); ng.connect(this._masterGain);
      src.start(now); src.stop(now + 0.22);

    } else if (material === 'metal') {
      // Metal (latarnia): wysoki brzęk + rezonans
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(480, now + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.22 * vol, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.50);  // długi zanik — metaliczny
      osc.connect(og); og.connect(this._masterGain);
      osc.start(now); osc.stop(now + 0.50);

      // Szum zderzenia
      const buf = this._makeNoise(0.07);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      src.connect(f); f.connect(ng); ng.connect(this._masterGain);
      src.start(now); src.stop(now + 0.07);
    }
  }

  // ─── Pierdnięcie i beknięcie ──────────────────────────────────────────────

  playFart() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    // "Prrrrrryk" — krótki, ostry, wibrujący dźwięk wargowy
    const dur = 0.10 + Math.random() * 0.18;   // 0.10–0.28 s

    // ── Bazowy szum przefiltrowany w niskim paśmie ─────────────────────────────
    const buf = this._makeNoise(dur + 0.05);
    const src = ctx.createBufferSource(); src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 160 + Math.random() * 120;  // 160–280 Hz — niski "prr"
    bp.Q.value = 7;

    // ── LFO ~45–80 Hz — wibrowanie warg (charakter "prr") ────────────────────
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 45 + Math.random() * 35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.8;
    lfo.connect(lfoGain);

    // ── Amplituda: mocny atak, gwałtowny zanik ─────────────────────────────────
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(3.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    lfoGain.connect(gain.gain);

    // ── Krótki "prrk" — trzask na końcu ──────────────────────────────────────
    const click = ctx.createOscillator();
    click.type = 'sawtooth';
    click.frequency.setValueAtTime(120, now + dur * 0.8);
    click.frequency.exponentialRampToValueAtTime(40, now + dur + 0.04);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1.2, now + dur * 0.8);
    cg.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.05);
    click.connect(cg); cg.connect(this._masterGain);
    click.start(now + dur * 0.8); click.stop(now + dur + 0.06);

    src.connect(bp); bp.connect(gain); gain.connect(this._masterGain);
    lfo.start(now); lfo.stop(now + dur);
    src.start(now); src.stop(now + dur + 0.05);
  }

  playBurp() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const dur = 0.32 + Math.random() * 0.35;  // 0.32–0.67 s

    // Piła — gardłowe, bekawe brzmienie
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360 + Math.random() * 120, now);
    osc.frequency.exponentialRampToValueAtTime(80 + Math.random() * 40, now + dur);

    // Rezonansowy lowpass — gardłowa barwa
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(lp); lp.connect(gain); gain.connect(this._masterGain);
    osc.start(now); osc.stop(now + dur + 0.05);
  }

  /** Usypiający gaz — ciche syczenie (jak ulatniający się gaz/aerozol). */
  playYawn() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const dur = 0.9 + Math.random() * 0.4;

    // Szum filtrowany — syczenie
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this._makeNoise(dur + 0.1);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200 + Math.random() * 800;  // wysoka częstotliwość = "sss"
    bp.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);   // ciche!
    gain.gain.setValueAtTime(0.12, now + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noiseSrc.connect(bp);
    bp.connect(gain);
    gain.connect(this._masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + dur + 0.05);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _makeNoise(duration) {
    const ctx  = this._ctx;
    const rate = ctx.sampleRate;
    const buf  = ctx.createBuffer(1, Math.ceil(rate * duration), rate);
    const d    = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ─── Strzał z broni ───────────────────────────────────────────────────────

  /**
   * Krótki, ostry wystrzał — szum perkusyjny + "thump" na niskich.
   * Wywołaj raz przy każdym spawnie pocisku.
   */
  playGunshot() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Klik mechanizmu — bardzo krótki impuls perkusyjny (pitched noise)
    const clickBuf = this._makeNoise(0.04);
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 3800;
    clickFilter.Q.value = 0.7;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.55, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    clickSrc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this._masterGain);
    clickSrc.start(now);
    clickSrc.stop(now + 0.04);

    // "Boom" — niskie uderzenie jak bum wystrzelenia
    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(140, now);
    boomOsc.frequency.exponentialRampToValueAtTime(38, now + 0.08);

    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.30, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    boomOsc.connect(boomGain);
    boomGain.connect(this._masterGain);
    boomOsc.start(now);
    boomOsc.stop(now + 0.08);

    // Szum wylotu lufy — krótki, wysoki "crack" (jak karabin maszynowy)
    const crackBuf = this._makeNoise(0.06);
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackHp = ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 2200;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.25, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    crackSrc.connect(crackHp);
    crackHp.connect(crackGain);
    crackGain.connect(this._masterGain);
    crackSrc.start(now);
    crackSrc.stop(now + 0.06);
  }

  // ─── Syrena nocna (zombie alarm) ──────────────────────────────────────────

  /**
   * Uruchamia ciągłą syrenę alarmową (wyjące "iiiiiAAA").
   * Zwraca { stop } — wywołaj stop() gdy dzień nastaje.
   */
  startSiren() {
    const ctx = this._ensureCtx();
    if (!ctx) return { stop: () => {} };

    // Oscylator główny — niska, wycia melodia
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 250;

    // Oscylator drugi — lekko zdestrojowany (chorus effect)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 252;

    // LFO — wyjąca modulacja częstotliwości (sinus: 3s w górę + 3s w dół = okres 6s)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1 / 6;  // 0.1667 Hz — narastanie 3s, opadanie 3s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;    // zakres modulacji ±160 Hz → sweep ~90..410 Hz
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Filtr — ostre brzmienie syreny
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 1.2;

    // Głośność — cicha syrena w tle
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 1.5);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);

    osc1.start(); osc2.start(); lfo.start();

    return {
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 1.5);
        osc1.stop(t + 1.6);
        osc2.stop(t + 1.6);
        lfo.stop(t + 1.6);
      },
    };
  }

  // ─── Bomby (zrzut + wybuch) ───────────────────────────────────────────────

  /** Krótki świst opadającej bomby. */
  playBombDrop() {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.1);
    g.gain.linearRampToValueAtTime(0.001, now + 1.3);
    osc.connect(f); f.connect(g); g.connect(this._masterGain);
    osc.start(now); osc.stop(now + 1.35);
  }

  /** Wybuch bomby — spatial przy pozycji uderzenia. */
  playBombExplosion(wx, wz) {
    const ctx = this._ensureCtx();
    const now = ctx.currentTime;

    const panner = this._makePanner(wx, 1, wz, 20, 380, 1.5);
    panner.connect(this._masterGain);

    // Głęboki boom — low sin sweep
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.9);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(og); og.connect(panner);
    osc.start(now); osc.stop(now + 1.45);

    // Wybuch — szum biały filtrowany
    const buf = this._makeNoise(1.6);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(2200, now);
    nf.frequency.exponentialRampToValueAtTime(200, now + 1.2);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.55, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    src.connect(nf); nf.connect(ng); ng.connect(panner);
    src.start(now); src.stop(now + 1.65);
  }
}
