export const CONFIG = {
  totalApples: 12,
  coats: [
    { name: 'Chestnut', body: 0xb5612f, shade: 0x8a451f },
    { name: 'Palomino', body: 0xe9c07c, shade: 0xc99a56 },
    { name: 'Midnight', body: 0x3a343b, shade: 0x262229 },
    { name: 'Cloud', body: 0xf1ece0, shade: 0xd6d0c0 },
    { name: 'Storm', body: 0x8e979e, shade: 0x6b7379 },
    { name: 'Bay', body: 0x7d4b2c, shade: 0x5b341d },
    { name: 'Bubblegum', body: 0xf28cb0, shade: 0xd66a90 },
    { name: 'Mint', body: 0x9fe0bf, shade: 0x72c79f }
  ],
  manes: [
    { name: 'Cocoa', color: 0x4a2c1a },
    { name: 'Cream', color: 0xf4e0ae },
    { name: 'Charcoal', color: 0x2a2727 },
    { name: 'Carrot', color: 0xe06a2b },
    { name: 'Sunshine', color: 0xffcc33 },
    { name: 'Sky', color: 0x7ec8f0 },
    { name: 'Lilac', color: 0xc9a5f0 },
    { name: 'Rose', color: 0xf06f9a }
  ],

  world: {
    size: 260,
    radius: 116,
    waterLevel: -1.15,
    lake: { x: -46, z: 44, radius: 20, shore: 30 },
    spawn: { x: 18, z: -6, yaw: -1.18 },
    barn: { x: 32, z: -24, rotation: -0.66 },
    windmill: { x: -34, z: -34 },
    elderOak: { x: -8, z: 22 },
    dock: { x: -42, zStart: 17, zEnd: 31 },
    paddock: { x: 4, z: 2, width: 22, depth: 15 }
  },

  // Closed loop of the riding trail (world x/z).
  path: [
    [24, -14], [17, -5], [6, 4], [-8, 16], [-28, 22], [-40, 18],
    [-52, 8], [-42, -10], [-32, -26], [-12, -30], [-2, -20], [10, -17]
  ],

  apples: [
    { x: 8.5, z: -3, label: 'Paddock' },
    { x: 15, z: 8, label: 'Meadow' },
    { x: -3, z: 25, label: 'Elder Oak' },
    { x: -16, z: 11, label: 'Flower Field' },
    { x: -42, z: 27, label: 'Dock', y: 0.95 },
    { x: -44, z: 70, label: 'North Shore' },
    { x: -36, z: -30, label: 'Windmill' },
    { x: -12, z: -27, label: 'West Trail' },
    { x: 2, z: -14, label: 'Trailhead' },
    { x: 38, z: 2, label: 'Orchard' },
    { x: 52, z: 20, label: 'East Ridge' },
    { x: -62, z: 4, label: 'West Meadow' }
  ],

  npcs: {
    june: {
      name: 'Farmer June',
      role: 'Orchard Keeper',
      x: 26, z: -16,
      colors: { skin: 0xf0b98c, hair: 0x6a3c1e, shirt: 0xf4e6c8, pants: 0x4a6d9b, hat: 0xe8c67a, accent: 0xc95a4a },
      hat: 'straw'
    },
    milo: {
      name: 'Scout Milo',
      role: 'Valley Guide',
      x: -38, z: 13,
      colors: { skin: 0xc98d62, hair: 0x2f2622, shirt: 0x6f9e58, pants: 0x574839, hat: 0x4a7d45, accent: 0xe8c67a },
      hat: 'cap'
    }
  },

  quest: {
    title: "June's Harvest",
    description: 'Find 12 Golden Apples scattered across the valley.'
  }
}

export const COAT_NAMES = CONFIG.coats.map(item => item.name)
