import { Game } from './Game.js';

async function main() {
  const game = new Game();
  await game.init();
  game.start();
}

main().catch(err => {
  console.error('Błąd inicjalizacji gry:', err);
  document.getElementById('loading').innerHTML =
    `<span style="color:#ffdddd">❌ ${err.message}</span><p>Sprawdź konsolę (F12)</p>`;
});
