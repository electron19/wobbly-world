/**
 * RNG — globalny generator liczb pseudolosowych z ziarnem (seedrandom).
 *
 * Ziarno pochodzi z parametru URL ?seed=<wartość>.
 * Brak parametru → domyślne ziarno 'wobbly42'.
 *
 * Przykłady:
 *   index.html?seed=hello   → zawsze ten sam świat "hello"
 *   index.html?seed=999     → inny powtarzalny świat
 *   index.html              → zawsze ziarno 'wobbly42'
 */
import seedrandom from 'seedrandom';

const params = new URLSearchParams(window.location.search);
export const SEED = params.get('seed') ?? 'wobbly42';

const _rng = seedrandom(SEED);

/** Drop-in replacement dla Math.random() — [0, 1) */
export function rand() {
  return _rng();
}
