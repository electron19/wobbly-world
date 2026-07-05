/**
 * SYSTEM STREF — definicje wszystkich dróg i reguł bezpiecznego umieszczania.
 *
 * ─── SIATKA DRÓG ─────────────────────────────────────────────────────────────
 *
 *   N-S główna      : x =    0  (oś Z)
 *   N-S wschodnia   : x =   65  (oś Z)
 *   N-S zachodnia   : x =  −65  (oś Z)
 *   N-S dalsza E    : x =  130  (oś Z)   ← nowe
 *   N-S dalsza W    : x = −130  (oś Z)   ← nowe
 *
 *   E-W główna      : z =    0  (oś X)
 *   E-W północna    : z =  −50  (oś X)
 *   E-W południowa  : z =   50  (oś X)
 *   E-W daleka N    : z = −100  (oś X)   ← nowe
 *   E-W daleka S    : z =  100  (oś X)   ← nowe
 *
 *   Pas jezdni : ROAD_HALF = ±3   (jezdnia)
 *   Pas czysty : ROAD_CLEAR = ±4.5 (jezdnia + chodnik)
 *
 * ─── BLOKI MIASTA ────────────────────────────────────────────────────────────
 *
 *   Centrum (4 bloki)         : x∈[-60,-5]∪[5,60],     z∈[-45,-5]∪[5,45]
 *   Przedmieścia N/S          : z∈[-90,-55]∪[55,90]
 *   Dzielnica biznesowa E/W   : x∈[70,125]∪[-125,-70], z∈[-45,45]
 *   Pas środkowy N/S          : z∈[-95,-55]∪[55,95]    ← nowe (między z=-100,-50 i 50,100)
 *   Pas zewnętrzny E/W        : x∈[70,125]∪[-125,-70], nowe pasy z
 *   Daleka północ/południe    : z∈[-145,-105]∪[105,145] ← nowe
 *   Daleki wschód/zachód      : x∈[135,185]∪[-135,-185] ← nowe
 *   Wzgórza                   : narożniki ←nowe 4 kolejne
 */

// ── Parametry dróg ────────────────────────────────────────────────────────────
export const ROAD_HALF  = 3.0;   // połowa szerokości jezdni
export const ROAD_CLEAR = 4.5;   // jezdnia + chodnik

/** Wszystkie drogi w świecie. */
export const ROADS = [
  { name: 'N-S główna',     axis: 'x', center:    0, clear: ROAD_CLEAR },
  { name: 'N-S wschodnia',  axis: 'x', center:   65, clear: ROAD_CLEAR },
  { name: 'N-S zachodnia',  axis: 'x', center:  -65, clear: ROAD_CLEAR },
  { name: 'N-S dalsza E',   axis: 'x', center:  130, clear: ROAD_CLEAR },
  { name: 'N-S dalsza W',   axis: 'x', center: -130, clear: ROAD_CLEAR },
  { name: 'E-W główna',     axis: 'z', center:    0, clear: ROAD_CLEAR },
  { name: 'E-W północna',   axis: 'z', center:  -50, clear: ROAD_CLEAR },
  { name: 'E-W południowa', axis: 'z', center:   50, clear: ROAD_CLEAR },
  { name: 'E-W daleka N',      axis: 'z', center: -100, clear: ROAD_CLEAR },
  { name: 'E-W daleka S',      axis: 'z', center:  100, clear: ROAD_CLEAR },
  { name: 'E-W daleka-daleka N', axis: 'z', center: -150, clear: ROAD_CLEAR },
  { name: 'E-W daleka-daleka S', axis: 'z', center:  150, clear: ROAD_CLEAR },
  { name: 'E-W nowa N',          axis: 'z', center: -200, clear: ROAD_CLEAR },
  { name: 'E-W nowa S',          axis: 'z', center:  200, clear: ROAD_CLEAR },
  { name: 'E-W osiedle N',       axis: 'z', center: -250, clear: ROAD_CLEAR },
  { name: 'E-W osiedle S',       axis: 'z', center:  250, clear: ROAD_CLEAR },
  { name: 'N-S nowa E',          axis: 'x', center:  195, clear: ROAD_CLEAR },
  { name: 'N-S nowa W',          axis: 'x', center: -195, clear: ROAD_CLEAR },
];

// ── Detekcja nawierzchni ───────────────────────────────────────────────────────

/** Czy punkt (px, pz) leży na jezdni (ROAD_HALF, bez chodnika)? */
export function isOnRoad(px, pz) {
  for (const road of ROADS) {
    const v = road.axis === 'x' ? px : pz;
    if (Math.abs(v - road.center) < ROAD_HALF) return true;
  }
  return false;
}

/** Czy punkt leży na jezdni lub chodniku? Używaj dla koloru śladów opon. */
export function isOnHardSurface(px, pz) {
  for (const road of ROADS) {
    const v = road.axis === 'x' ? px : pz;
    if (Math.abs(v - road.center) < ROAD_CLEAR) return true;
  }
  return false;
}

// ── Sprawdzanie bezpieczeństwa ─────────────────────────────────────────────────

/** Czy punkt (px, pz) nie leży na żadnej drodze ani chodniku? */
export function isSafePoint(px, pz) {
  for (const road of ROADS) {
    const v = road.axis === 'x' ? px : pz;
    if (Math.abs(v - road.center) < road.clear) return false;
  }
  return true;
}
