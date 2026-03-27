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

/**
 * Czy okrąg o środku (cx, cz) i promieniu r nie nachodzi na żadną drogę?
 * Używaj dla: drzew (r≈0.5), budynków (r≈połowa_przekątnej), wzgórz.
 */
export function isSafe(cx, cz, r = 0) {
  const margin = ROAD_CLEAR + r;
  for (const road of ROADS) {
    const v = road.axis === 'x' ? cx : cz;
    if (Math.abs(v - road.center) < margin) return false;
  }
  return true;
}

/** Alias semantyczny dla wzgórz. */
export function isSafeHill(cx, cz, r) {
  return isSafe(cx, cz, r);
}

// ── Strefy nazwane ─────────────────────────────────────────────────────────────

/** Centrum — 4 bloki przy głównym skrzyżowaniu. */
export const ZONE_CENTRE = {
  NW: { xMin: -60, xMax:  -5, zMin: -45, zMax:  -5 },
  NE: { xMin:   5, xMax:  60, zMin: -45, zMax:  -5 },
  SW: { xMin: -60, xMax:  -5, zMin:   5, zMax:  45 },
  SE: { xMin:   5, xMax:  60, zMin:   5, zMax:  45 },
};

/** Przedmieścia bliskie — poza głównymi drogami E-W (z=±50). */
export const ZONE_SUBURBAN = {
  N_W: { xMin: -60, xMax:  -5, zMin: -90, zMax: -55 },
  N_E: { xMin:   5, xMax:  60, zMin: -90, zMax: -55 },
  S_W: { xMin: -60, xMax:  -5, zMin:  55, zMax:  90 },
  S_E: { xMin:   5, xMax:  60, zMin:  55, zMax:  90 },
};

/** Pas środkowy N/S — między z=±50 a z=±100. */
export const ZONE_MID_BAND = {
  N_IW: { xMin: -60, xMax:  -5, zMin: -95, zMax: -55 },
  N_IE: { xMin:   5, xMax:  60, zMin: -95, zMax: -55 },
  N_OW: { xMin:-125, xMax: -70, zMin: -95, zMax: -55 },
  N_OE: { xMin:  70, xMax: 125, zMin: -95, zMax: -55 },
  S_IW: { xMin: -60, xMax:  -5, zMin:  55, zMax:  95 },
  S_IE: { xMin:   5, xMax:  60, zMin:  55, zMax:  95 },
  S_OW: { xMin:-125, xMax: -70, zMin:  55, zMax:  95 },
  S_OE: { xMin:  70, xMax: 125, zMin:  55, zMax:  95 },
};

/** Dzielnice biznesowe — poza drogami zewnętrznymi N-S (x=±65). */
export const ZONE_CBD = {
  EAST: { xMin:  70, xMax: 125, zMin: -45, zMax:  45 },
  WEST: { xMin:-125, xMax: -70, zMin: -45, zMax:  45 },
};

/** Daleka północ/południe — poza drogami z=±100. */
export const ZONE_FAR_NS = {
  N_W: { xMin:-125, xMax: -70, zMin:-145, zMax:-105 },
  N_IW:{ xMin: -60, xMax:  -5, zMin:-145, zMax:-105 },
  N_IE:{ xMin:   5, xMax:  60, zMin:-145, zMax:-105 },
  N_E: { xMin:  70, xMax: 125, zMin:-145, zMax:-105 },
  S_W: { xMin:-125, xMax: -70, zMin: 105, zMax: 145 },
  S_IW:{ xMin: -60, xMax:  -5, zMin: 105, zMax: 145 },
  S_IE:{ xMin:   5, xMax:  60, zMin: 105, zMax: 145 },
  S_E: { xMin:  70, xMax: 125, zMin: 105, zMax: 145 },
};

/** Daleki wschód/zachód — poza drogami x=±130. */
export const ZONE_FAR_EW = {
  E_N: { xMin: 135, xMax: 185, zMin: -95, zMax: -55 },
  E_C: { xMin: 135, xMax: 185, zMin: -45, zMax:  45 },
  E_S: { xMin: 135, xMax: 185, zMin:  55, zMax:  95 },
  W_N: { xMin:-185, xMax:-135, zMin: -95, zMax: -55 },
  W_C: { xMin:-185, xMax:-135, zMin: -45, zMax:  45 },
  W_S: { xMin:-185, xMax:-135, zMin:  55, zMax:  95 },
};

/** Wzgórza — daleko od wszystkich dróg (narożniki świata). */
export const ZONE_HILLS = {
  NW:  { xMin:-260, xMax:-160, zMin:-260, zMax:-160 },
  NE:  { xMin: 160, xMax: 260, zMin:-260, zMax:-160 },
  SW:  { xMin:-260, xMax:-160, zMin: 160, zMax: 260 },
  SE:  { xMin: 160, xMax: 260, zMin: 160, zMax: 260 },
};
