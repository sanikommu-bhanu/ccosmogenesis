/**
 * Physical data for every body in the flythrough.
 *
 * Sizes are compressed with a square-root law normalised to Earth = 1.0 scene unit.
 * A linear scale would make Mercury 0.19 px next to Jupiter; a pure log scale
 * flattens Jupiter into "slightly bigger than Earth". The square root keeps the
 * ordering and the felt drama of the gas giants (Jupiter reads 3.3x Earth instead of
 * its true 11x) while leaving the rocky planets legible in the same frame.
 *
 * Rotation is expressed as a signed sidereal period and applied inside the tilted
 * frame, so retrograde bodies fall out of the physics rather than being special-cased:
 * Venus (177.4 degrees obliquity) and Uranus (97.8) end up spinning backwards on
 * screen exactly as they do in reality.
 */

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

export interface Fact {
  /** Mono label, shown uppercase in the HUD. */
  label: string
  /** The value itself, kept short enough to sit on one leader line. */
  value: string
}

export interface MoonDef {
  id: string
  name: string
  /** Scene units, same square-root law as the planets. */
  radius: number
  /** Orbital radius in units of the parent's radius. */
  distance: number
  /** Seconds per orbit at the film's artistic time scale. */
  period: number
  /** Orbital inclination in degrees. */
  inclination: number
  /** Texture path under /textures, or null to use the procedural material. */
  map: string | null
  /**
   * Procedural surface kind, used when `map` is null. Colours are the measured
   * geometric albedo and spectral appearance of the real body.
   */
  procedural?: {
    kind: 'ice-lineae' | 'grooved-ice' | 'dark-regolith'
    base: string
    accent: string
    albedo: number
  }
}

export interface RingDef {
  /** Inner/outer radius in units of the planet's radius. */
  inner: number
  outer: number
  /** Colour+alpha strip, or null for the faint procedural dust rings. */
  map: string | null
  /** Peak opacity. Jupiter's and Neptune's rings are genuinely almost invisible. */
  opacity: number
  /** Number of instanced particles layered over the ring plane, 0 to disable. */
  particles: number
  tint: string
}

export interface AtmosphereDef {
  /** Shell thickness as a fraction of planet radius. */
  thickness: number
  /** Rim colour at grazing angles. */
  color: string
  /** Forward-scatter colour seen against the terminator. */
  sunset: string
  /** Rim falloff exponent; higher is a tighter, thinner-looking atmosphere. */
  power: number
  intensity: number
}

export interface Planet {
  id: PlanetId
  name: string
  /** HUD designation, in the spirit of an instrument readout. */
  designation: string
  /** Scene units (Earth = 1). */
  radius: number
  /** Scene units from the Sun, log-compressed for layout. */
  orbitRadius: number
  /** Degrees. Values above 90 are physically retrograde. */
  axialTilt: number
  /** Sidereal rotation period in hours. Sign is informational; tilt carries direction. */
  rotationHours: number
  /** Seconds of screen time this planet gets, relative to the others. */
  weight: number
  /** Sun-relative orbital phase in radians. */
  phase: number
  /** Base colour used for atmosphere maths and as the loading placeholder. */
  color: string
  /** True-colour texture set. */
  maps: {
    albedo: string
    night?: string
    clouds?: string
    normal?: string
    specular?: string
    /** Venus is the odd one out: an opaque cloud deck over a radar surface map. */
    surface?: string
  }
  atmosphere?: AtmosphereDef
  rings?: RingDef
  moons: MoonDef[]
  facts: Fact[]
  /** Longer copy revealed by the click-to-explore panel. */
  detail: string
}

/** Square-root size law, normalised to Earth. */
const R_EARTH_KM = 6371
export const sizeOf = (radiusKm: number) => Math.sqrt(radiusKm) / Math.sqrt(R_EARTH_KM)

/**
 * Log-compressed orbital layout.
 *
 * The exponent is chosen so the *character* of the spacing survives compression:
 * Mercury through Mars stay visibly bunched together while Jupiter through Neptune
 * spread out, which is the most striking fact about the Solar System's geometry.
 * A linear scale would put the four rocky planets inside a single pixel; equal
 * spacing would throw the fact away entirely.
 */
const orbitOf = (au: number) => 30 * Math.pow(au, 0.45)

/**
 * Orbital phases are a gentle fan rather than scattered.
 *
 * Real planets are never aligned, but the establishing shot needs to read as a family
 * portrait: all eight legible at once, ordered outward. A ~36 degree fan keeps them
 * from occluding one another and gives the row real depth, without collapsing into
 * the flat diagram-like line a perfect alignment would produce.
 */
const phaseOf = (index: number) => index * 0.09

/**
 * How much planets are enlarged for the establishing shot.
 *
 * At true relative scale a planet is a sub-pixel speck beside its orbit, which is
 * honest and unwatchable. Every orrery ever built exaggerates body size against
 * orbital distance for exactly this reason. The boost is uniform, so planet sizes
 * stay correct *relative to each other*; only the body-to-orbit ratio is exaggerated,
 * and it eases back to 1 as the camera drops into the ring flythrough.
 */
export const ORRERY_SIZE_BOOST = 2.2

/** The Sun, kept separate because it is a light source rather than a destination. */
export const SUN = {
  radius: sizeOf(696340), // about 10.45 scene units
  facts: [
    { label: 'DIAMETER', value: '1 392 700 km' },
    { label: 'SURFACE', value: '5 505 C' },
    { label: 'CORE', value: '15 000 000 C' },
    { label: 'MASS SHARE', value: '99.86%' },
  ] satisfies Fact[],
}

export const PLANETS: Planet[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    designation: 'SOL_I',
    radius: sizeOf(2439.7),
    orbitRadius: orbitOf(0.387),
    axialTilt: 0.034,
    rotationHours: 1407.6,
    weight: 0.95,
    phase: phaseOf(0),
    color: '#8c8279',
    maps: { albedo: '/textures/mercury/albedo.jpg' },
    moons: [],
    facts: [
      { label: 'DIAMETER', value: '4 879 km' },
      { label: 'SOLAR DAY', value: '176 Earth days' },
      { label: 'SURFACE', value: '-173 to 427 C' },
    ],
    detail:
      'Closest to the Sun and smaller than some moons. With almost no atmosphere to move heat around, the day side reaches 427 C while the night side falls to -173 C, the widest surface temperature swing of any planet. It rotates three times for every two orbits, so a single solar day lasts two Mercurian years.',
  },
  {
    id: 'venus',
    name: 'Venus',
    designation: 'SOL_II',
    radius: sizeOf(6051.8),
    orbitRadius: orbitOf(0.723),
    axialTilt: 177.4, // above 90: the planet is effectively upside down, hence retrograde
    rotationHours: -5832.5,
    weight: 1.0,
    phase: phaseOf(1),
    color: '#d8b98a',
    maps: {
      albedo: '/textures/venus/atmosphere.jpg',
      surface: '/textures/venus/surface.jpg',
    },
    atmosphere: {
      thickness: 0.055,
      color: '#ffdca8',
      sunset: '#ff9c4a',
      power: 2.6,
      intensity: 1.35,
    },
    moons: [],
    facts: [
      { label: 'DIAMETER', value: '12 104 km' },
      { label: 'SURFACE', value: '464 C, hottest' },
      { label: 'SPIN', value: 'Retrograde, 243 days' },
    ],
    detail:
      'Almost Earth’s twin in size, and nothing like it. A carbon dioxide atmosphere ninety times heavier than ours traps enough heat to melt lead at the surface, hotter than Mercury despite being twice as far from the Sun. It also turns backwards, and so slowly that its day is longer than its year.',
  },
  {
    id: 'earth',
    name: 'Earth',
    designation: 'SOL_III',
    radius: 1,
    orbitRadius: orbitOf(1),
    axialTilt: 23.44,
    rotationHours: 23.934,
    weight: 1.35,
    phase: phaseOf(2),
    color: '#2b5a8c',
    maps: {
      albedo: '/textures/earth/day.jpg',
      night: '/textures/earth/night.jpg',
      clouds: '/textures/earth/clouds.jpg',
      normal: '/textures/earth/normal.jpg',
      specular: '/textures/earth/specular.jpg',
    },
    atmosphere: {
      thickness: 0.028,
      color: '#5aa9ff',
      sunset: '#ff7a3c',
      power: 3.1,
      intensity: 1.15,
    },
    moons: [
      {
        id: 'moon',
        name: 'Moon',
        radius: sizeOf(1737.4),
        distance: 7.2,
        period: 42,
        inclination: 5.1,
        map: '/textures/moons/moon.jpg',
      },
    ],
    facts: [
      { label: 'DIAMETER', value: '12 742 km' },
      { label: 'DAY', value: '23 h 56 m' },
      { label: 'SURFACE', value: '71% liquid water' },
    ],
    detail:
      'The only place in the observed universe known to be inhabited. Its 23.4 degree tilt is what gives it seasons; its oversized Moon holds that tilt steady enough for climate to stay liveable over geological time. The night side is the only planetary surface here lit from below, by us.',
  },
  {
    id: 'mars',
    name: 'Mars',
    designation: 'SOL_IV',
    radius: sizeOf(3389.5),
    orbitRadius: orbitOf(1.524),
    axialTilt: 25.19,
    rotationHours: 24.623,
    weight: 1.05,
    phase: phaseOf(3),
    color: '#b5613a',
    maps: { albedo: '/textures/mars/albedo.jpg' },
    atmosphere: {
      thickness: 0.018,
      color: '#e8a06a',
      sunset: '#7fa8d8', // Martian sunsets really are blue: scattering runs backwards in dust
      power: 4.0,
      intensity: 0.45,
    },
    moons: [
      {
        id: 'phobos',
        name: 'Phobos',
        radius: sizeOf(11.27),
        distance: 4.4,
        period: 11,
        inclination: 1.1,
        map: '/textures/moons/phobos.jpg',
      },
      {
        id: 'deimos',
        name: 'Deimos',
        radius: sizeOf(6.2),
        distance: 8.6,
        period: 29,
        inclination: 1.8,
        map: null,
        procedural: { kind: 'dark-regolith', base: '#6b5c4d', accent: '#3a312a', albedo: 0.068 },
      },
    ],
    facts: [
      { label: 'DIAMETER', value: '6 779 km' },
      { label: 'DAY', value: '24 h 37 m' },
      { label: 'OLYMPUS MONS', value: '21.9 km tall' },
    ],
    detail:
      'Half Earth’s width, with a day only forty minutes longer. Olympus Mons rises 21.9 km, nearly three times Everest, because Mars has no drifting plates to move a volcano off its hotspot. Its two moons are almost certainly captured asteroids; Phobos is spiralling in and will break up into a ring.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    designation: 'SOL_V',
    radius: sizeOf(69911),
    orbitRadius: orbitOf(5.203),
    axialTilt: 3.13,
    rotationHours: 9.925,
    weight: 1.3,
    phase: phaseOf(4),
    color: '#c9a882',
    maps: { albedo: '/textures/jupiter/albedo.jpg' },
    atmosphere: {
      thickness: 0.022,
      color: '#ffd9a8',
      sunset: '#e08a4a',
      power: 3.4,
      intensity: 0.7,
    },
    rings: {
      inner: 1.4,
      outer: 1.8,
      map: null,
      opacity: 0.06, // genuinely near-invisible dust, discovered only by Voyager 1
      particles: 0,
      tint: '#c8a882',
    },
    moons: [
      {
        id: 'io',
        name: 'Io',
        radius: sizeOf(1821.6),
        distance: 3.1,
        period: 18,
        inclination: 0.05,
        map: '/textures/moons/io.jpg',
      },
      {
        id: 'europa',
        name: 'Europa',
        radius: sizeOf(1560.8),
        distance: 4.3,
        period: 28,
        inclination: 0.47,
        map: null,
        procedural: { kind: 'ice-lineae', base: '#d8cfc0', accent: '#8a6f5a', albedo: 0.68 },
      },
      {
        id: 'ganymede',
        name: 'Ganymede',
        radius: sizeOf(2634.1),
        distance: 5.9,
        period: 44,
        inclination: 0.2,
        map: null,
        procedural: { kind: 'grooved-ice', base: '#9a8d7e', accent: '#5c5248', albedo: 0.43 },
      },
      {
        id: 'callisto',
        name: 'Callisto',
        radius: sizeOf(2410.3),
        distance: 8.4,
        period: 72,
        inclination: 0.19,
        map: '/textures/moons/callisto.jpg',
      },
    ],
    facts: [
      { label: 'DIAMETER', value: '139 820 km' },
      { label: 'DAY', value: '9 h 56 m, fastest' },
      { label: 'GREAT RED SPOT', value: 'Storm wider than Earth' },
    ],
    detail:
      'Two and a half times the mass of every other planet combined. It spins once in under ten hours, fast enough to visibly flatten itself at the poles and shear its clouds into the banding you can see. The Great Red Spot is a storm that has been turning for at least 190 years and is still wider than Earth.',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    designation: 'SOL_VI',
    radius: sizeOf(58232),
    orbitRadius: orbitOf(9.537),
    axialTilt: 26.73,
    rotationHours: 10.656,
    weight: 1.35,
    phase: phaseOf(5),
    color: '#d9c08a',
    maps: { albedo: '/textures/saturn/albedo.jpg' },
    atmosphere: {
      thickness: 0.024,
      color: '#ffe9bd',
      sunset: '#d9a05a',
      power: 3.2,
      intensity: 0.6,
    },
    rings: {
      inner: 1.24,
      outer: 2.28,
      map: '/textures/saturn/ring-alpha.png',
      opacity: 1,
      particles: 24000,
      tint: '#e8d8b8',
    },
    moons: [
      {
        id: 'titan',
        name: 'Titan',
        radius: sizeOf(2574.7),
        distance: 6.4,
        period: 58,
        inclination: 0.33,
        map: '/textures/moons/titan.jpg',
      },
    ],
    facts: [
      { label: 'DIAMETER', value: '116 460 km' },
      { label: 'RINGS', value: '282 000 km wide, 10 m thick' },
      { label: 'DENSITY', value: '0.69 g/cm3, would float' },
    ],
    detail:
      'Less dense than water, and by some margin: drop Saturn in a large enough ocean and it would float. The rings span most of the distance from Earth to the Moon but are only about ten metres thick, which is why they vanish entirely when seen edge-on. Titan is the only moon in the Solar System with a thick atmosphere.',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    designation: 'SOL_VII',
    radius: sizeOf(25362),
    orbitRadius: orbitOf(19.19),
    axialTilt: 97.77, // knocked over; the poles face the Sun in turn
    rotationHours: -17.24,
    weight: 1.0,
    phase: phaseOf(6),
    color: '#a8d8dd',
    maps: { albedo: '/textures/uranus/albedo.jpg' },
    atmosphere: {
      thickness: 0.03,
      color: '#b8f0f5',
      sunset: '#7fd0d8',
      power: 3.0,
      intensity: 0.75,
    },
    rings: {
      inner: 1.6,
      outer: 2.0,
      map: null,
      opacity: 0.18,
      particles: 0,
      tint: '#8fb8c4',
    },
    moons: [],
    facts: [
      { label: 'DIAMETER', value: '50 724 km' },
      { label: 'AXIAL TILT', value: '97.8 deg, on its side' },
      { label: 'ATMOSPHERE', value: '-224 C, coldest' },
    ],
    detail:
      'Tipped over onto its side, almost certainly by an ancient collision, so it rolls along its orbit rather than spinning upright. Each pole spends 42 years in continuous sunlight and 42 in darkness. Despite being closer to the Sun than Neptune, it has the coldest atmosphere measured anywhere in the Solar System.',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    designation: 'SOL_VIII',
    radius: sizeOf(24622),
    orbitRadius: orbitOf(30.07),
    axialTilt: 28.32,
    rotationHours: 16.11,
    weight: 1.0,
    phase: phaseOf(7),
    color: '#3d5ef2',
    maps: { albedo: '/textures/neptune/albedo.jpg' },
    atmosphere: {
      thickness: 0.03,
      color: '#5a7dff',
      sunset: '#3f5ad8',
      power: 3.0,
      intensity: 0.9,
    },
    rings: {
      inner: 1.7,
      outer: 2.1,
      map: null,
      opacity: 0.1,
      particles: 0,
      tint: '#6a7fc4',
    },
    moons: [],
    facts: [
      { label: 'DIAMETER', value: '49 244 km' },
      { label: 'WINDS', value: '2 100 km/h, fastest' },
      { label: 'DISTANCE', value: '4.5 billion km from Sun' },
    ],
    detail:
      'Found by mathematics before anyone looked for it: Uranus was drifting off its predicted path, and the size and position of the culprit were calculated first. Sunlight out here is 900 times fainter than on Earth, yet Neptune drives the fastest winds in the Solar System at 2 100 km/h.',
  },
]

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p])) as Record<
  PlanetId,
  Planet
>

/**
 * World position of a planet.
 *
 * Planets sit at fixed orbital phases rather than orbiting the Sun during the film.
 * Orbital motion would mean the camera choreography had to chase a moving target, and
 * at these compressed distances the movement would read as drift rather than as orbit
 * anyway.
 *
 * Shared by the renderer and the camera rig so the two can never disagree about where
 * a planet is.
 */
export function planetPosition(planet: Planet, out?: { x: number; y: number; z: number }) {
  const target = out ?? { x: 0, y: 0, z: 0 }
  target.x = Math.cos(planet.phase) * planet.orbitRadius
  target.y = 0
  target.z = Math.sin(planet.phase) * planet.orbitRadius
  return target
}

export interface PlanetSegment {
  planet: Planet
  /** Local progress within the ring phase at which this planet's beat starts. */
  start: number
  end: number
}

/**
 * The eight planet beats, laid out inside the ring-exploration phase.
 * Each beat is: arrive, fly a full orbital ring, break away to the next.
 */
export const PLANET_SEGMENTS: PlanetSegment[] = (() => {
  const total = PLANETS.reduce((sum, p) => sum + p.weight, 0)
  let cursor = 0
  return PLANETS.map((planet) => {
    const start = cursor
    const end = cursor + planet.weight / total
    cursor = end
    return { planet, start, end }
  })
})()

/** Local progress inside the ring phase to the planet on screen. */
export function planetSegmentAt(local: number): PlanetSegment {
  const p = Math.min(0.999999, Math.max(0, local))
  for (const seg of PLANET_SEGMENTS) {
    if (p >= seg.start && p < seg.end) return seg
  }
  return PLANET_SEGMENTS[PLANET_SEGMENTS.length - 1]
}

/**
 * The planets chapter is two movements, not one.
 *
 * The first slice is the orrery: a held establishing shot of the whole system, all
 * eight worlds alive in frame at once. The rest is the ring exploration, a chain of
 * orbital loops threaded from Mercury out to Neptune.
 *
 * Everything downstream derives from this constant, so the balance between "look at
 * the system" and "visit the worlds" is a single number.
 */
export const ORRERY_FRACTION = 0.17

/** Splits chapter-local progress into which movement we are in, and how far through it. */
export function planetsPhase(chapterLocal: number): {
  phase: 'orrery' | 'rings'
  /** 0 to 1 within that movement. */
  t: number
  /** Eased 0 to 1 blend from orrery framing into ring framing. */
  handover: number
} {
  if (chapterLocal < ORRERY_FRACTION) {
    const t = chapterLocal / ORRERY_FRACTION
    return { phase: 'orrery', t, handover: 0 }
  }
  const t = (chapterLocal - ORRERY_FRACTION) / (1 - ORRERY_FRACTION)
  // The first stretch of the ring phase is still leaving the orrery behind.
  const raw = Math.min(1, t / 0.06)
  return { phase: 'rings', t, handover: raw * raw * (3 - 2 * raw) }
}
