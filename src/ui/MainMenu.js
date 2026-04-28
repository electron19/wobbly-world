const STORAGE_KEY = 'wobbly-world-settings-v2';

export const DEFAULT_SETTINGS = {
  volume:         0.82,
  renderDistance: 'medium',
  graphicsQuality:'high',
  avatar:         'grabpack',
};

const CHARACTERS = [
  {
    id:    'grabpack',
    name:  'Poppy',
    desc:  'GrabPack Worker',
    emoji: '🟡',
    bg:    '#FFE040',
  },
  {
    id:    'classic',
    name:  'Blob',
    desc:  'Klasyczny Wobbly',
    emoji: '🫧',
    bg:    '#6BCB77',
  },
];

export class MainMenu {
  /**
   * @param {{ onStart: (settings) => void, onChange: (settings) => void }} opts
   */
  constructor({ onStart, onChange } = {}) {
    this._onStart  = onStart;
    this._onChange = onChange;
    this._settings = this._loadSettings();
    this._root     = null;
    this._build();
    this._bind();
  }

  get settings() { return { ...this._settings }; }

  // ── Public API ────────────────────────────────────────────────────────────

  show(started = false) {
    this._root.hidden = false;
    this._root.removeAttribute('aria-hidden');

    const title  = this._root.querySelector('.mw-title');
    const startB = this._root.querySelector('#mw-start');

    if (started) {
      title.textContent  = '⏸ Pauza';
      startB.textContent = '▶ Wróć do gry';
      this._root.querySelector('[data-tab="play"]').style.display = 'none';
      this._switchTab('settings');
    } else {
      title.textContent  = 'Wobbly World 🏘️';
      startB.textContent = '▶ Start';
      this._root.querySelector('[data-tab="play"]').style.display = '';
      this._switchTab('play');
    }
  }

  hide() {
    this._root.hidden = true;
    this._root.setAttribute('aria-hidden', 'true');
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'mw-root';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    el.innerHTML = this._template();
    document.body.appendChild(el);
    this._root = el;

    // Character cards
    const grid = this._root.querySelector('.mw-char-grid');
    for (const ch of CHARACTERS) {
      const card = document.createElement('button');
      card.className = 'mw-char-card' + (ch.id === this._settings.avatar ? ' selected' : '');
      card.dataset.char = ch.id;
      card.style.setProperty('--ch-bg', ch.bg);
      card.innerHTML = `
        <div class="mw-char-emoji">${ch.emoji}</div>
        <div class="mw-char-name">${ch.name}</div>
        <div class="mw-char-desc">${ch.desc}</div>
      `;
      grid.appendChild(card);
    }

    // Set form values from saved settings
    this._root.querySelector('#mw-volume').value     = this._settings.volume;
    this._root.querySelector('#mw-vol-label').textContent = this._volLabel(this._settings.volume);
    this._root.querySelector('#mw-render').value     = this._settings.renderDistance;
    this._root.querySelector('#mw-quality').value    = this._settings.graphicsQuality;
  }

  _template() {
    return `
    <div class="mw-overlay"></div>
    <div class="mw-panel" role="dialog" aria-modal="true">

      <div class="mw-header">
        <div class="mw-title">Wobbly World 🏘️</div>
      </div>

      <nav class="mw-tabs" role="tablist">
        <button class="mw-tab active" data-tab="play"    role="tab">🎮 Graj</button>
        <button class="mw-tab"        data-tab="settings" role="tab">⚙️ Ustawienia</button>
        <button class="mw-tab"        data-tab="credits"  role="tab">👥 Autorzy</button>
      </nav>

      <!-- ── TAB: play ──────────────────────────────────────────────────── -->
      <section class="mw-content active" id="mw-tab-play">
        <h3 class="mw-section-title">Wybierz postać</h3>
        <div class="mw-char-grid"></div>
        <button id="mw-start" class="mw-btn-start">▶ Start</button>
      </section>

      <!-- ── TAB: settings ──────────────────────────────────────────────── -->
      <section class="mw-content" id="mw-tab-settings">
        <h3 class="mw-section-title">Dźwięk</h3>
        <div class="mw-row">
          <label for="mw-volume">🔊 Głośność</label>
          <input type="range" id="mw-volume" min="0" max="1" step="0.01">
          <span id="mw-vol-label" class="mw-val">82%</span>
        </div>

        <h3 class="mw-section-title">Grafika</h3>
        <div class="mw-row">
          <label for="mw-render">🏔️ Odległość renderowania</label>
          <select id="mw-render">
            <option value="near">Blisko — lepsza wydajność</option>
            <option value="medium">Średnia</option>
            <option value="far">Daleko — wymaga mocnego PC</option>
          </select>
        </div>
        <div class="mw-row">
          <label for="mw-quality">✨ Jakość grafiki</label>
          <select id="mw-quality">
            <option value="low">Niska</option>
            <option value="medium">Średnia</option>
            <option value="high">Wysoka</option>
          </select>
        </div>

        <div class="mw-settings-footer">
          <button id="mw-reset" class="mw-btn-reset">↺ Domyślne</button>
          <button id="mw-resume" class="mw-btn-start small">▶ Wróć do gry</button>
        </div>
      </section>

      <!-- ── TAB: credits ───────────────────────────────────────────────── -->
      <section class="mw-content" id="mw-tab-credits">
        <h3 class="mw-section-title">Twórcy</h3>
        <div class="mw-credits-grid">
          <div class="mw-credit-card">
            <div class="mw-credit-avatar">👨‍💻</div>
            <div class="mw-credit-name">Tata</div>
            <div class="mw-credit-role">Programowanie</div>
          </div>
          <div class="mw-credit-card">
            <div class="mw-credit-avatar">👦</div>
            <div class="mw-credit-name">Ignaś</div>
            <div class="mw-credit-role">Pomysł &amp; Testowanie</div>
          </div>
        </div>
        <p class="mw-credits-note">Zrobione z ❤️ &nbsp;·&nbsp; Wobbly World 2026</p>
      </section>

    </div>
    `;
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  _bind() {
    // Tabs
    this._root.querySelectorAll('.mw-tab').forEach(btn =>
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab)));

    // Character cards
    this._root.querySelector('.mw-char-grid').addEventListener('click', e => {
      const card = e.target.closest('.mw-char-card');
      if (!card) return;
      this._root.querySelectorAll('.mw-char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      this._settings.avatar = card.dataset.char;
      this._save();
      this._onChange?.(this.settings);
    });

    // Start / Resume buttons
    this._root.querySelector('#mw-start').addEventListener('click',  () => this._onStart?.(this.settings));
    this._root.querySelector('#mw-resume').addEventListener('click', () => this._onStart?.(this.settings));

    // Volume
    const volInput = this._root.querySelector('#mw-volume');
    const volLabel = this._root.querySelector('#mw-vol-label');
    volInput.addEventListener('input', () => {
      volLabel.textContent    = this._volLabel(volInput.value);
      this._settings.volume   = Number(volInput.value);
      this._save();
      this._onChange?.(this.settings);
    });

    // Selects
    for (const sel of ['#mw-render', '#mw-quality']) {
      this._root.querySelector(sel).addEventListener('change', () => {
        this._settings.renderDistance  = this._root.querySelector('#mw-render').value;
        this._settings.graphicsQuality = this._root.querySelector('#mw-quality').value;
        this._save();
        this._onChange?.(this.settings);
      });
    }

    // Reset
    this._root.querySelector('#mw-reset').addEventListener('click', () => {
      this._settings = { ...DEFAULT_SETTINGS };
      this._root.querySelector('#mw-volume').value = DEFAULT_SETTINGS.volume;
      this._root.querySelector('#mw-vol-label').textContent = this._volLabel(DEFAULT_SETTINGS.volume);
      this._root.querySelector('#mw-render').value  = DEFAULT_SETTINGS.renderDistance;
      this._root.querySelector('#mw-quality').value = DEFAULT_SETTINGS.graphicsQuality;
      this._root.querySelectorAll('.mw-char-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.char === DEFAULT_SETTINGS.avatar));
      this._save();
      this._onChange?.(this.settings);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _switchTab(name) {
    this._root.querySelectorAll('.mw-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    this._root.querySelectorAll('.mw-content').forEach(s =>
      s.classList.toggle('active', s.id === `mw-tab-${name}`));
  }

  _volLabel(v) { return `${Math.round(Number(v) * 100)}%`; }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const p = JSON.parse(raw);
      return {
        volume:          Number.isFinite(p.volume) ? Math.max(0, Math.min(1, p.volume)) : DEFAULT_SETTINGS.volume,
        renderDistance:  ['near','medium','far'].includes(p.renderDistance)  ? p.renderDistance  : DEFAULT_SETTINGS.renderDistance,
        graphicsQuality: ['low','medium','high'].includes(p.graphicsQuality) ? p.graphicsQuality : DEFAULT_SETTINGS.graphicsQuality,
        avatar:          CHARACTERS.some(c => c.id === p.avatar)            ? p.avatar          : DEFAULT_SETTINGS.avatar,
      };
    } catch (_) { return { ...DEFAULT_SETTINGS }; }
  }

  _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings)); }
}
