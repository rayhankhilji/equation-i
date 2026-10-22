// Equation I - Silverstone surroundings layout (hand-placed after the aerial: woods, public roads, stands, hospitality, estate).
// World metres, +x east, +z south (same frame as silverstone.js). Track-relative entries use lap distance s and side
// (+1 = outside of the circuit loop, -1 = infield). Everything here is validated at build time (skipped where it would collide).
window.EI = window.EI || {};
EI.ENVDATA = EI.ENVDATA || {};
EI.ENVDATA.silverstone = {
  // grass tones (SILVERSTONE-UPGRADE): a touch drier / less blue-green than the shared palette - the 2024-26 photos show olive, half-dry summer grass
  pal: { mowA: [54, 56, 38], mowB: [61, 62, 44], venue: [58, 58, 39], venueDry: [86, 78, 56] },
  // extra woodland blocks around the estate (OSM woods are used as well)
  woods: [
    [[-1350, -120], [-1180, -170], [-1060, -90], [-1040, 120], [-1090, 330], [-1180, 460], [-1330, 420], [-1390, 200]],   // west, beyond the car parks
    [[-1460, 560], [-1300, 520], [-1180, 640], [-1240, 820], [-1420, 860], [-1520, 700]],
    [[-120, 1080], [60, 1020], [260, 1060], [380, 1180], [300, 1320], [80, 1380], [-100, 1300]],                             // south, beyond Stowe
    [[420, 1260], [600, 1200], [720, 1320], [640, 1480], [460, 1460]],
    [[150, -1150], [380, -1120], [460, -1300], [300, -1450], [120, -1380]],                                                  // north, beyond Copse
    [[760, 150], [980, 120], [1060, 320], [900, 480], [740, 420]],                                                          // east, beyond Chapel / Hangar
    [[1380, -700], [1560, -760], [1640, -560], [1500, -420], [1360, -480]],
    [[-1500, -1250], [-1280, -1300], [-1200, -1100], [-1330, -960], [-1520, -1020]],
  ],
  // public and estate roads: Dadford Road (west), the A43 (east), Silverstone village road (south) and gate roads into the estate.
  // `snap: true` extends the last point onto the perimeter service road.
  roads: [
    { name: 'Dadford Road', w: 7.5, kind: 'public', pts: [[-1250, -2100], [-1120, -1500], [-1010, -1000], [-930, -600], [-900, -200], [-930, 250], [-880, 700], [-760, 1150], [-640, 1600], [-560, 2200]] },
    { name: 'A43', w: 15, kind: 'public', pts: [[1900, -2300], [1600, -1500], [1380, -800], [1280, -200], [1220, 400], [1080, 1000], [850, 1700], [650, 2300]] },
    { name: 'Village road', w: 7, kind: 'public', pts: [[-200, 2300], [-250, 1700], [-230, 1400], [-170, 1130]], snap: true },
    { name: 'West gate', w: 7, kind: 'estate', pts: [[-905, -430], [-820, -430]], snap: true },
    { name: 'Club gate', w: 7, kind: 'estate', pts: [[-915, 520], [-820, 500]], snap: true },
    { name: 'East gate', w: 7, kind: 'estate', pts: [[1278, -150], [1050, -150], [880, -130]], snap: true },
    { name: 'North gate', w: 7, kind: 'estate', pts: [[-1000, -1010], [-640, -1010], [-300, -1060], [-60, -1080]], snap: true },
  ],
  // grandstand runs along the lap: [s0, s1, side, gap beyond the barrier, rows, roof, seat colour]
  standRuns: [
    [40, 425, 1, 6, 17, true, 0x24418f],      // Hamilton Straight (opposite the Wing)
    [445, 600, 1, 6, 13, true, 0x2b3a55],     // Abbey
    [625, 770, -1, 6, 10, false, 0x8c1d24],   // Farm
    [850, 985, 1, 6, 14, true, 0x1f5f8f],     // Village
    [1025, 1210, -1, 6, 12, true, 0x24418f],  // The Loop / Aintree
    [1420, 1900, 1, 6, 8, false, 0x5a5f69],   // Wellington Straight
    [1945, 2115, -1, 6, 14, true, 0x8c1d24],  // Brooklands
    [2150, 2420, 1, 6, 17, true, 0x24418f],   // Luffield
    [2440, 2600, 1, 6, 12, true, 0x1f5f8f],   // Woodcote
    [2650, 2980, 1, 6, 9, false, 0x5a5f69],   // National Pit Straight
    [3000, 3260, 1, 6, 15, true, 0x24418f],   // Copse
    [3480, 3700, -1, 6, 10, false, 0x2b3a55], // Maggotts
    [3740, 3920, 1, 6, 15, true, 0x8c1d24],   // Becketts
    [3925, 4005, -1, 6, 11, false, 0x1f5f8f],
    [4020, 4190, 1, 6, 12, true, 0x24418f],   // Chapel
    [4340, 4900, 1, 6, 8, false, 0x5a5f69],   // Hangar Straight
    [4420, 4820, -1, 6, 6, false, 0x2b3a55],
    [4940, 5160, 1, 6, 17, true, 0x24418f],   // Stowe
    [5190, 5420, -1, 6, 10, false, 0x8c1d24], // Vale
    [5560, 5875, 1, 6, 15, true, 0x1f5f8f],   // Club
  ],
  // hospitality clusters (white marquee roofs) behind the stands: [s, side, metres beyond the barrier, units]
  hospitality: [[250, 1, 78, 5], [520, 1, 66, 3], [900, 1, 64, 3], [2250, 1, 78, 4], [3110, 1, 72, 4], [3830, 1, 70, 3], [5050, 1, 74, 4], [5720, 1, 70, 4], [2030, -1, 62, 2], [4100, 1, 66, 3]],
  // BRDC clubhouse on the outside of Woodcote
  brdc: [2575, 1, 46],
  // Dadford Road industrial estate (west of the road)
  industrial: { x0: -1235, x1: -975, z0: -640, z1: -210 },
  // Stowe inner circuit (infield between Vale and Hangar Straight)
  stowe: [[-170, 420], [-75, 400], [-35, 462], [-8, 508], [-40, 530], [-50, 590], [-110, 630], [-190, 610], [-210, 540], [-200, 470]],
  // preferred spots for camp sites: [x, z]
  campsites: [[-420, 1180], [700, -60], [-1000, -800], [520, 760], [-1080, 980]],
};
