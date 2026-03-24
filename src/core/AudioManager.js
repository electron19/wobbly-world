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
// 5 biegów: progi zmiany dobrane do MAX_SPEED=200 km/h
const GEAR_UP_KMH    = [16, 34, 58, 88];   // prędkości zmiany w górę (km/h)
const GEAR_DOWN_KMH  = [ 9, 22, 42, 68];   // prędkości zmiany w dół (histereza)
// RPM/(km/h) dla każdego biegu — przy progu zmiany RPM ≈ RPM_MAX
const RPM_PER_KMH    = [425, 200, 117, 77, 34];
const RPM_IDLE       = 850;
const RPM_MAX        = 6800;
const RPM_DROP       = 2200;  // spadek RPM przy zmianie biegu w górę
const SHIFT_COOLDOWN = 0.50;  // blokada po zmianie (anti-ping-pong)

// Mapowanie RPM → częstotliwość oscylatora (Hz).
// Niższy zakres = głębszy, bardziej samochodowy dźwięk.
// Idle: ~30 Hz, max: ~118 Hz; osc2 (3x) dodaje harmoniczne 90-354 Hz.
function rpmToHz(rpm) {
  return 30 + (rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE) * 88;
}

export class AudioManager {
  constructor() {
    this._ctx = null;

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
    this._skidNoise     = null;   // główny szum pisku (wąski bandpass)
    this._skidNoise2    = null;   // drugi szum (high-end syczenie)
    this._skidNoiseF    = null;
    this._skidGain      = null;
    this._skidActive    = false;

    // ── klakson ──
    this._hornOsc     = null;
    this._hornF       = null;
    this._hornGain    = null;
    this._hornRunning = false;

    // ── kroki ──
    this._lastFootFloor = 0;
  }

  // ─── Kontekst ─────────────────────────────────────────────────────────────

  _ensureCtx() {
    if (!this._ctx) this._ctx = new AudioContext();
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

    src.connect(f); f.connect(g); g.connect(ctx.destination);
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
    osc.connect(g); g.connect(ctx.destination);
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
    osc.connect(og); og.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.13);

    const buf = this._makeNoise(0.09);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 210;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.20, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(f); f.connect(ng); ng.connect(ctx.destination);
    src.start(now); src.stop(now + 0.09);
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
    starterG.connect(ctx.destination);
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
    catchG.connect(ctx.destination);
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
    flareG.connect(ctx.destination);
    flareOsc.start(now + 0.64);
    flareOsc.stop(now + 1.05);

    // Właściwy silnik startuje po 0.65s (po złapaniu)
    setTimeout(() => this.startEngine(), 640);

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
    this._engineGain.connect(ctx.destination);

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
        this._rpm = Math.max(RPM_IDLE, this._rpm - RPM_DROP);
        this._shiftTimer = SHIFT_COOLDOWN;
      } else if (this._gear > 0 && absSpd < GEAR_DOWN_KMH[this._gear - 1]) {
        this._gear--;
        this._shiftTimer = SHIFT_COOLDOWN * 0.5;
      }
    }

    // ── Target RPM na podstawie prędkości i biegu ─────────────────────────
    const targetRpm = Math.max(RPM_IDLE, absSpd * RPM_PER_KMH[this._gear]);

    // Wolne narastanie RPM gdy gaz (0.27s), wolne opadanie przy zwalnianiu (0.70s)
    const tau = Math.abs(gas) > 0.05 ? 0.27 : 0.70;
    this._rpm += (targetRpm - this._rpm) * Math.min(1, dt / tau);
    this._rpm  = Math.min(RPM_MAX, Math.max(RPM_IDLE, this._rpm));

    // ── Oscylatory ────────────────────────────────────────────────────────
    const hz = rpmToHz(this._rpm);
    this._engineOsc1.frequency.setTargetAtTime(hz,     now, 0.06);
    this._engineOsc2.frequency.setTargetAtTime(hz * 3, now, 0.06);

    // Głośność: rośnie trochę z obrotami + lekko z gazem
    const vol = 0.055 + (this._rpm - RPM_IDLE) / (RPM_MAX - RPM_IDLE) * 0.07
              + Math.abs(gas) * 0.025;
    this._engineGain.gain.setTargetAtTime(vol, now, 0.06);
  }

  stopEngine() {
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

  _startTires() {
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
    this._tireGain.connect(ctx.destination);
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

    // Głośność: 0 przy niskiej prędkości, rośnie
    const vol = absSpd < 3 ? 0 : Math.min((absSpd - 3) / 60, 1) * (onRoad ? 0.10 : 0.14);
    this._tireGain.gain.setTargetAtTime(vol, now, 0.12);
  }

  _stopTires() {
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
    // Utrzymaj głośność gdy trwa pisk
    if (skidding && this._skidGain) {
      const vol = onRoad ? 0.28 : 0.16;
      this._skidGain.gain.setTargetAtTime(vol, this._ctx.currentTime, 0.05);
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
    this._skidGain.connect(ctx.destination);

    const makeNoiseSrc = () => {
      const buf = ctx.createBuffer(1, rate * 2, rate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      return src;
    };

    if (onRoad) {
      // ── Asfalt: "iiiihhh" — wąski bandpass na ~3200 Hz (ton pisku) ──────────
      // + szerokie wysokie częstotliwości (syk)
      this._skidNoise  = makeNoiseSrc();
      this._skidNoiseF = ctx.createBiquadFilter();
      this._skidNoiseF.type = 'bandpass';
      this._skidNoiseF.frequency.value = 3200;
      this._skidNoiseF.Q.value = 10;    // bardzo wąski → wyraźny ton pisku
      const boost = ctx.createGain(); boost.gain.value = 2.2;
      this._skidNoise.connect(this._skidNoiseF);
      this._skidNoiseF.connect(boost);
      boost.connect(this._skidGain);
      this._skidNoise.start(now);

      // Druhia warstwa: szerokie syczenie powyżej 1800 Hz
      this._skidNoise2 = makeNoiseSrc();
      const f2 = ctx.createBiquadFilter();
      f2.type = 'highpass'; f2.frequency.value = 1800;
      const g2 = ctx.createGain(); g2.gain.value = 0.28;
      this._skidNoise2.connect(f2); f2.connect(g2); g2.connect(this._skidGain);
      this._skidNoise2.start(now);

    } else {
      // ── Trawa: niski szelest/tarcie ─────────────────────────────────────────
      this._skidNoise  = makeNoiseSrc();
      this._skidNoiseF = ctx.createBiquadFilter();
      this._skidNoiseF.type = 'lowpass';
      this._skidNoiseF.frequency.value = 300;
      this._skidNoise.connect(this._skidNoiseF);
      this._skidNoiseF.connect(this._skidGain);
      this._skidNoise.start(now);
    }
  }

  _stopSkid() {
    if (!this._skidActive) return;
    this._skidActive = false;
    if (!this._skidGain) return;
    const now = this._ctx.currentTime;
    this._skidGain.gain.setTargetAtTime(0.001, now, 0.12);
    const n1 = this._skidNoise, n2 = this._skidNoise2;
    setTimeout(() => {
      try { n1?.stop(); } catch (_) {}
      try { n2?.stop(); } catch (_) {}
    }, 400);
    this._skidNoise  = null;
    this._skidNoise2 = null;
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
    this._hornGain.connect(ctx.destination);
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

    osc.connect(f); f.connect(g); g.connect(ctx.destination);
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
      osc.connect(og); og.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);

      const buf = this._makeNoise(0.12);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 600; f.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.20 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(f); f.connect(ng); ng.connect(ctx.destination);
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
      osc.connect(og); og.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.10);

      // Drżenie gałęzi — szum długi
      const buf = this._makeNoise(0.22);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 300; f.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.14 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(f); f.connect(ng); ng.connect(ctx.destination);
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
      osc.connect(og); og.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.50);

      // Szum zderzenia
      const buf = this._makeNoise(0.07);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18 * vol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      src.connect(f); f.connect(ng); ng.connect(ctx.destination);
      src.start(now); src.stop(now + 0.07);
    }
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
}
