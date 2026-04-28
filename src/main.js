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

async function startGame(settings) {
  if (!started) {
    started = true;
    loading.style.display = 'flex';
    loading.style.opacity = '1';
    loading.querySelector('p').textContent = 'Ładowanie świata...';
    try {
      game = new Game();
      await game.init(settings);
      loading.style.opacity = '0';
      setTimeout(() => { loading.style.display = 'none'; }, 650);
      menu.hide();
      game.start();
    } catch (err) {
      console.error('Błąd inicjalizacji:', err);
      loading.innerHTML = `<span style="color:#ffdddd">❌ ${err.message}</span><p>Sprawdź konsolę (F12)</p>`;
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
