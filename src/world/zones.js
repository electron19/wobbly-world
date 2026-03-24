/**
 * SYSTEM STREF — definicje wszystkich dróg i reguł bezpiecznego umieszczania.
 *
 * ─── SIATKA DRÓG ─────────────────────────────────────────────────────────────
 *
 *   N-S główna    : x =   0  (oś Z)
 *   N-S wschodnia : x =  65  (oś Z)
 *   N-S zachodnia : x = −65  (oś Z)
 *
 *   E-W główna    : z =   0  (oś X)
 *   E-W północna  : z = −50  (oś X)
 *   E-W południowa: z =  50  (oś X)
 *
 *   Pas jezdni : ROAD_HALF = ±3   (jezdnia)
 *   Pas czysty : ROAD_CLEAR = ±4.5 (jezdnia + chodnik)
 *
 * ─── BLOKI MIASTA ────────────────────────────────────────────────────────────
 *
 *   Strefa centralna (4 bloki): x∈[-60,-5]∪[5,60], z∈[-45,-5]∪[5,45]
 *   Przedmieścia N/S           : z∈[-90,-55]∪[55,90]
 *   Dzielnica biznesowa E/W    : x∈[70,120]∪[-120,-70]
 *   Wzgórza                    : narożniki x=±140, z=±140 (daleko od dróg)
 */

// ── Parametry dróg ────────────────────────────────────────────────────────────
export const ROAD_HALF  = 3.0;   // połowa szerokości jezdni
export const ROAD_CLEAR = 4.5;   // jezdnia + chodnik

/** Wszystkie drogi w świecie. */
export const ROADS = [
  { name: 'N-S główna',     axis: 'x', center:   0, clear: ROAD_CLEAR },
  { name: 'N-S wschodnia',  axis: 'x', center:  65, clear: ROAD_CLEAR },
  { name: 'N-S zachodnia',  axis: 'x', center: -65, clear: ROAD_CLEAR },
  { name: 'E-W główna',     axis: 'z', center:   0, clear: ROAD_CLEAR },
  { name: 'E-W północna',   axis: 'z', center: -50, clear: ROAD_CLEAR },
  { name: 'E-W południowa', axis: 'z', center:  50, clear: ROAD_CLEAR },
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

/** Przedmieścia — poza głównymi drogami. */
export const ZONE_SUBURBAN = {
  N_W: { xMin: -60, xMax:  -5, zMin: -90, zMax: -55 },
  N_E: { xMin:   5, xMax:  60, zMin: -90, zMax: -55 },
  S_W: { xMin: -60, xMax:  -5, zMin:  55, zMax:  90 },
  S_E: { xMin:   5, xMax:  60, zMin:  55, zMax:  90 },
};

/** Dzielnice biznesowe — poza drogami zewnętrznymi N-S. */
export const ZONE_CBD = {
  EAST: { xMin:  70, xMax: 125, zMin: -45, zMax:  45 },
  WEST: { xMin: -125, xMax: -70, zMin: -45, zMax:  45 },
};

/** Wzgórza — daleko od wszystkich dróg (narożniki świata). */
export const ZONE_HILLS = {
  NW: { xMin: -180, xMax: -90, zMin: -180, zMax:  -90 },
  SE: { xMin:   90, xMax: 180, zMin:   90, zMax:  180 },
};
