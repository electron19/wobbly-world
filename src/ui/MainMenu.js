const STORAGE_KEY = 'wobbly-world-settings-v1';

export const DEFAULT_SETTINGS = {
  volume: 0.82,
  renderDistance: 'medium',
  graphicsQuality: 'high',
  avatar: 'grabpack',
};

export class MainMenu {
  constructor({ onStart, onChange } = {}) {
    this._onStart = onStart;
    this._onChange = onChange;

    this._root = document.getElementById('main-menu');
    this._startBtn = document.getElementById('menu-start');
    this._resetBtn = document.getElementById('menu-reset');
    this._stateEl = document.getElementById('menu-state');
    this._volumeInput = document.getElementById('setting-volume');
    this._volumeValue = document.getElementById('setting-volume-value');
    this._renderInput = document.getElementById('setting-render-distance');
    this._graphicsInput = document.getElementById('setting-graphics-quality');
    this._avatarInput = document.getElementById('setting-avatar');

    this._settings = this._loadSettings();
    this._applySettingsToForm(this._settings);
    this._bind();
  }

  get settings() {
    return { ...this._settings };
  }

  show(started = false) {
    this._root.hidden = false;
    this._root.setAttribute('aria-hidden', 'false');
    this._stateEl.textContent = started
      ? 'Pauza i ustawienia'
      : 'Skonfiguruj świat przed startem';
    this._startBtn.textContent = started ? 'Wznów grę' : 'Start gry';
  }

  hide() {
    this._root.hidden = true;
    this._root.setAttribute('aria-hidden', 'true');
  }

  _bind() {
    this._startBtn.addEventListener('click', () => {
      this._onStart?.(this.settings);
    });

    this._resetBtn.addEventListener('click', () => {
      this._settings = { ...DEFAULT_SETTINGS };
      this._applySettingsToForm(this._settings);
      this._saveSettings();
      this._onChange?.(this.settings);
    });

    this._volumeInput.addEventListener('input', () => {
      this._syncVolumeLabel();
      this._handleFormChange();
    });

    [
      this._renderInput,
      this._graphicsInput,
      this._avatarInput,
    ].forEach(input => input.addEventListener('change', () => this._handleFormChange()));
  }

  _handleFormChange() {
    this._settings = this._readSettingsFromForm();
    this._saveSettings();
    this._onChange?.(this.settings);
  }

  _readSettingsFromForm() {
    return {
      volume: Number(this._volumeInput.value),
      renderDistance: this._renderInput.value,
      graphicsQuality: this._graphicsInput.value,
      avatar: this._avatarInput.value,
    };
  }

  _applySettingsToForm(settings) {
    this._volumeInput.value = String(settings.volume);
    this._renderInput.value = settings.renderDistance;
    this._graphicsInput.value = settings.graphicsQuality;
    this._avatarInput.value = settings.avatar;
    this._syncVolumeLabel();
  }

  _syncVolumeLabel() {
    this._volumeValue.textContent = `${Math.round(Number(this._volumeInput.value) * 100)}%`;
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        volume: Number.isFinite(parsed.volume) ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume,
        renderDistance: ['near', 'medium', 'far'].includes(parsed.renderDistance)
          ? parsed.renderDistance
          : DEFAULT_SETTINGS.renderDistance,
        graphicsQuality: ['low', 'medium', 'high'].includes(parsed.graphicsQuality)
          ? parsed.graphicsQuality
          : DEFAULT_SETTINGS.graphicsQuality,
        avatar: ['classic', 'grabpack'].includes(parsed.avatar)
          ? parsed.avatar
          : DEFAULT_SETTINGS.avatar,
      };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  _saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
  }
}
