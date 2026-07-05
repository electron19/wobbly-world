import { Game }     from './Game.js';
import { MainMenu } from './ui/MainMenu.js';

const loading = document.getElementById('loading');

// ── 1. Show menu immediately (game loads only after Start) ───────────────────
const menu = new MainMenu({
  onStart:  (settings) => startGame(settings),
  onChange: (settings) => { if (game) game.applySettings(settings); },
});

menu.show(false);
loading.classList.add('hidden');
setTimeout(() => { loading.style.display = 'none'; }, 650);

// ── 2. Game lifecycle ─────────────────────────────────────────────────────────
let game    = null;
let started = false;
let starting = false;

async function startGame(settings) {
  if (starting) return;
  if (!started) {
    starting = true;
    loading.style.display = 'flex';
    loading.style.opacity = '1';
    loading.innerHTML = '🏘️ Wobbly World<p>Ładowanie świata...</p>';
    try {
      game = new Game();
      await game.init(settings);
      started = true;
      loading.style.opacity = '0';
      setTimeout(() => { loading.style.display = 'none'; }, 650);
      menu.hide();
      game.start();
    } catch (err) {
      console.error('Błąd inicjalizacji:', err);
      game?.dispose?.();
      game = null;
      started = false;
      const msg = err?.message ?? String(err);
      loading.innerHTML = `<span style="color:#ffdddd">❌ ${msg}</span><p>Sprawdź konsolę (F12)</p>`;
      setTimeout(() => {
        loading.style.opacity = '0';
        loading.style.display = 'none';
      }, 2500);
    } finally {
      starting = false;
    }
  } else {
    menu.hide();
    game.resume();
  }
}

// ── 3. ESC — pauza / wznowienie ──────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !started || !game) return;
  if (menu._root.hidden) {
    game.pause();
    menu.show(true);
  } else {
    menu.hide();
    game.resume();
  }
});
