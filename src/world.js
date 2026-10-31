import * as THREE from 'three'
import { CONFIG } from './config.js'
import { height, pathDistance, lakeDepth, createTerrain, createMinimap, noise2, smoothstep, clamp } from './terrain.js'

const W = CONFIG.world

let seed = 20261031
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
function randRange(min, max) {
  return min + rand() * (max - min)
}
function pick(list) {
  return list[Math.floor(rand() * list.length)]
}

function standard(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cylinder(radiusTop, radiusBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function makeLabelSprite(text, { width = 512, height = 128, background = 'rgba(255, 249, 235, 0.94)', color = '#3c2a1d', fontSize = 58, border = '#5c3a1c', marker = false } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const radius = marker ? 30 : 34
  const padding = marker ? 8 : 8
  ctx.fillStyle = background
  ctx.strokeStyle = border
  ctx.lineWidth = marker ? 8 : 6
  ctx.beginPath()
  ctx.roundRect(padding, padding, width - padding * 2, height - padding * 2, radius)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `${marker ? 76 : fontSize}px Fredoka, Nunito, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2 + (marker ? 4 : 2))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  const aspect = width / height
  sprite.scale.set(marker ? 1.1 : 3.2, (marker ? 1.1 : 3.2) / aspect, 1)
  return sprite
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255, 231, 135, 0.95)')
  gradient.addColorStop(0.35, 'rgba(255, 207, 82, 0.45)')
  gradient.addColorStop(1, 'rgba(255, 196, 60, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createWorld(scene) {
  const root = new THREE.Group()
  scene.add(root)

  const colliders = []
  const animated = []
  const glows = []

  scene.fog = new THREE.Fog(0xd9e6cf, 85, 235)
  const terrainData = createTerrain(scene)
  const minimap = createMinimap()

  // Sky ---------------------------------------------------------------------
  const sunDirection = new THREE.Vector3(-0.52, 0.58, 0.38).normalize()
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x5aa7dd) },
      horizonColor: { value: new THREE.Color(0xfbe6bd) },
      groundColor: { value: new THREE.Color(0xbfd4a9) },
      sunColor: { value: new THREE.Color(0xfff0c4) },
      sunDirection: { value: sunDirection }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        vec3 color = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.62));
        color = mix(groundColor, color, smoothstep(-0.08, 0.14, h));
        float glow = pow(max(dot(dir, sunDirection), 0.0), 26.0);
        float halo = pow(max(dot(dir, sunDirection), 0.0), 5.0);
        color += sunColor * (glow * 0.95 + halo * 0.22);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 18), skyMaterial)
  scene.add(sky)

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.85
  }))
  sunSprite.scale.set(110, 110, 1)
  sunSprite.position.copy(sunDirection).multiplyScalar(390)
  scene.add(sunSprite)

  // Lights ------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x74884f, 0.85)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffe2b3, 2.35)
  sun.position.copy(sunDirection).multiplyScalar(120)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -85
  sun.shadow.camera.right = 85
  sun.shadow.camera.top = 85
  sun.shadow.camera.bottom = -85
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 320
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.035
  sun.target.position.set(0, 0, 0)
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight(0xb9d6ff, 0.35)
  fill.position.set(50, 35, -70)
  scene.add(fill)

  // Clouds ------------------------------------------------------------------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 1, flatShading: true })
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 1)
  const cloudBlobs = []
  for (let c = 0; c < 8; c += 1) {
    const cloud = new THREE.Group()
    const count = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i += 1) {
      const blob = new THREE.Mesh(cloudGeometry, cloudMat)
      blob.position.set(randRange(-6, 6), randRange(-0.8, 0.8), randRange(-2.5, 2.5))
      blob.scale.set(randRange(2.6, 4.8), randRange(1.2, 2), randRange(2.2, 3.4))
      cloud.add(blob)
    }
    cloud.position.set(randRange(-100, 100), randRange(34, 52), randRange(-100, 100))
    cloud.userData.speed = randRange(0.35, 0.9)
    root.add(cloud)
    cloudBlobs.push(cloud)
  }

  // Birds -------------------------------------------------------------------
  const birdMat = standard(0x3d4038, 0.8)
  const birds = []
  for (let i = 0; i < 7; i += 1) {
    const bird = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.46), birdMat)
    bird.add(body)
    const wings = []
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.22), birdMat)
      wing.position.x = side * 0.36
      wing.geometry.translate(side * 0.35, 0, 0)
      bird.add(wing)
      wings.push({ wing, side })
    }
    bird.userData = {
      radius: randRange(28, 64),
      speed: randRange(0.06, 0.13),
      phase: randRange(0, Math.PI * 2),
      flap: randRange(6, 10),
      height: randRange(16, 30),
      center: new THREE.Vector3(randRange(-25, 25), 0, randRange(-25, 25))
    }
    bird.scale.setScalar(randRange(0.8, 1.3))
    root.add(bird)
    birds.push({ group: bird, wings, ...bird.userData })
  }

  // Water -------------------------------------------------------------------
  const waterUniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(0x2f7f9e) },
    shallow: { value: new THREE.Color(0x7ac6c8) },
    sky: { value: new THREE.Color(0xd9ecf2) }
  }
  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: waterUniforms,
    vertexShader: `
      uniform float time;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 0.55 + time * 1.1) * 0.05 + cos(p.y * 0.7 - time * 0.8) * 0.04;
        p.z += wave;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform vec3 sky;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        float ripple = sin(vWorld.x * 0.8 + time * 1.5) * sin(vWorld.z * 0.72 - time * 1.1);
        float ripple2 = sin(vWorld.x * 2.1 - time * 1.8) * cos(vWorld.z * 1.7 + time * 1.3);
        float h = ripple * 0.12 + ripple2 * 0.08;
        vec3 color = mix(deep, shallow, smoothstep(-0.2, 0.5, h));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 2.0);
        color = mix(color, sky, fres * 0.45);
        float sparkle = pow(max(0.0, ripple * ripple2), 6.0) * 0.35;
        color += sparkle;
        float edge = smoothstep(0.46, 0.5, length(vUv - 0.5));
        gl_FragColor = vec4(color, 0.92 - edge * 0.2);
      }
    `
  })
  const water = new THREE.Mesh(new THREE.CircleGeometry(25.5, 72), waterMaterial)
  water.rotation.x = -Math.PI / 2
  water.position.set(W.lake.x, W.waterLevel, W.lake.z)
  water.receiveShadow = false
  root.add(water)

  // Lily pads and reeds -----------------------------------------------------
  const lilyMat = new THREE.MeshStandardMaterial({ color: 0x4c8a4a, roughness: 0.85, side: THREE.DoubleSide })
  const lilyGeometry = new THREE.CircleGeometry(0.55, 7)
  const lilies = new THREE.InstancedMesh(lilyGeometry, lilyMat, 34)
  const dummy = new THREE.Object3D()
  let lilyCount = 0
  for (let i = 0; i < 150 && lilyCount < 34; i += 1) {
    const angle = rand() * Math.PI * 2
    const radius = randRange(3, 17)
    const x = W.lake.x + Math.cos(angle) * radius
    const z = W.lake.z + Math.sin(angle) * radius
    if (height(x, z) > W.waterLevel - 0.35) continue
    dummy.position.set(x, W.waterLevel + 0.05, z)
    dummy.rotation.set(-Math.PI / 2, 0, rand() * Math.PI)
    dummy.scale.setScalar(randRange(0.7, 1.5))
    dummy.updateMatrix()
    lilies.setMatrixAt(lilyCount, dummy.matrix)
    lilyCount += 1
  }
  lilies.count = lilyCount
  root.add(lilies)

  const reedMat = standard(0x6e8a4a, 0.9)
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.055, 1.5, 3), reedMat, 170)
  let reedCount = 0
  for (let i = 0; i < 900 && reedCount < 170; i += 1) {
    const angle = rand() * Math.PI * 2
    const radius = randRange(19, 27)
    const x = W.lake.x + Math.cos(angle) * radius
    const z = W.lake.z + Math.sin(angle) * radius
    const h = height(x, z)
    if (h < W.waterLevel - 0.6 || h > W.waterLevel + 0.75) continue
    dummy.position.set(x, h + 0.7, z)
    dummy.rotation.set(randRange(-0.2, 0.2), rand() * Math.PI, randRange(-0.2, 0.2))
    dummy.scale.set(1, randRange(0.7, 1.4), 1)
    dummy.updateMatrix()
    reeds.setMatrixAt(reedCount, dummy.matrix)
    reedCount += 1
  }
  reeds.count = reedCount
  reeds.castShadow = true
  root.add(reeds)

  // Trees -------------------------------------------------------------------
  const treeSpots = []
  function treeAllowed(x, z) {
    if (Math.hypot(x, z) > W.radius - 6) return false
    if (pathDistance(x, z) < 5.2) return false
    if (Math.hypot(x - W.lake.x, z - W.lake.z) < W.lake.shore + 1) return false
    if (Math.hypot(x - W.barn.x, z - W.barn.z) < 16) return false
    if (Math.hypot(x - W.windmill.x, z - W.windmill.z) < 9) return false
    if (Math.hypot(x - W.elderOak.x, z - W.elderOak.z) < 10) return false
    if (Math.abs(x - W.dock.x) < 7 && z > 10 && z < 36) return false
    if (Math.hypot(x - W.spawn.x, z - W.spawn.z) < 12) return false
    for (const spot of treeSpots) {
      if (Math.hypot(x - spot.x, z - spot.z) < 4.2) return false
    }
    return true
  }
  for (let i = 0; i < 1400 && treeSpots.length < 118; i += 1) {
    const x = randRange(-W.radius + 4, W.radius - 4)
    const z = randRange(-W.radius + 4, W.radius - 4)
    if (!treeAllowed(x, z)) continue
    treeSpots.push({ x, z, scale: randRange(0.75, 1.55), pine: rand() > 0.32 })
  }

  const pineSpots = treeSpots.filter(spot => spot.pine)
  const leafSpots = treeSpots.filter(spot => !spot.pine)

  const trunkMat = standard(0x7a5133, 0.95)
  const pineTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 6), trunkMat, pineSpots.length)
  const pineFoliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), standard(0x4e8246, 0.95), pineSpots.length * 3)
  const pineColors = [0x3f7b46, 0x4c8a4d, 0x5d9753, 0x377045]
  let pineFoliageIndex = 0
  pineSpots.forEach((spot, index) => {
    const ground = height(spot.x, spot.z)
    const s = spot.scale
    dummy.position.set(spot.x, ground + 1.4 * s, spot.z)
    dummy.rotation.set(0, rand() * Math.PI, 0)
    dummy.scale.set(s, 2.8 * s, s)
    dummy.updateMatrix()
    pineTrunk.setMatrixAt(index, dummy.matrix)
    for (let layer = 0; layer < 3; layer += 1) {
      const layerScale = s * (1.55 - layer * 0.28)
      dummy.position.set(spot.x, ground + (2.5 + layer * 1.25) * s, spot.z)
      dummy.rotation.set(0, rand() * Math.PI, 0)
      dummy.scale.set(layerScale, 2.35 * s * (1 - layer * 0.06), layerScale)
      dummy.updateMatrix()
      pineFoliage.setMatrixAt(pineFoliageIndex, dummy.matrix)
      pineFoliage.setColorAt(pineFoliageIndex, new THREE.Color(pick(pineColors)))
      pineFoliageIndex += 1
    }
    colliders.push({ x: spot.x, z: spot.z, r: 0.65 * s })
  })
  pineTrunk.castShadow = pineTrunk.receiveShadow = true
  pineFoliage.castShadow = pineFoliage.receiveShadow = true
  pineFoliage.instanceColor.needsUpdate = true
  root.add(pineTrunk, pineFoliage)

  const leafTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.4, 1, 6), trunkMat, leafSpots.length)
  const leafFoliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), standard(0x6aa257, 0.95), leafSpots.length * 4)
  const leafColors = [0x6aa257, 0x7cb35e, 0x5b944d, 0x8abf69, 0x568f52]
  let leafFoliageIndex = 0
  leafSpots.forEach((spot, index) => {
    const ground = height(spot.x, spot.z)
    const s = spot.scale
    dummy.position.set(spot.x, ground + 2 * s, spot.z)
    dummy.rotation.set(0, rand() * Math.PI, 0)
    dummy.scale.set(s, 4 * s, s)
    dummy.updateMatrix()
    leafTrunk.setMatrixAt(index, dummy.matrix)
    for (let blob = 0; blob < 4; blob += 1) {
      const angle = (blob / 4) * Math.PI * 2 + rand()
      dummy.position.set(
        spot.x + Math.cos(angle) * 1.5 * s,
        ground + (4.3 + rand() * 1.4) * s,
        spot.z + Math.sin(angle) * 1.5 * s
      )
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, 0)
      dummy.scale.set(2.3 * s, 1.9 * s, 2.3 * s)
      dummy.updateMatrix()
      leafFoliage.setMatrixAt(leafFoliageIndex, dummy.matrix)
      leafFoliage.setColorAt(leafFoliageIndex, new THREE.Color(pick(leafColors)))
      leafFoliageIndex += 1
    }
    colliders.push({ x: spot.x, z: spot.z, r: 0.7 * s })
  })
  leafTrunk.castShadow = leafTrunk.receiveShadow = true
  leafFoliage.castShadow = leafFoliage.receiveShadow = true
  leafFoliage.instanceColor.needsUpdate = true
  root.add(leafTrunk, leafFoliage)

  // Grass -------------------------------------------------------------------
  const bladeGeometry = (() => {
    const positions = []
    const indices = []
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.4
      const lean = 0.18
      const dx = Math.cos(angle) * 0.08
      const dz = Math.sin(angle) * 0.08
      const tipX = Math.cos(angle) * 0.2
      const tipZ = Math.sin(angle) * 0.2
      const base = positions.length / 3
      positions.push(-dx, 0, -dz, dx, 0, dz, tipX, 0.56, tipZ)
      indices.push(base, base + 1, base + 2)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  })()
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: false })
  const grass = new THREE.InstancedMesh(bladeGeometry, grassMaterial, 3200)
  const grassColors = [0x679b47, 0x77ad50, 0x5c8f42, 0x83b85c, 0x6fa24b]
  let grassCount = 0
  for (let i = 0; i < 9000 && grassCount < 3200; i += 1) {
    const x = randRange(-W.radius + 2, W.radius - 2)
    const z = randRange(-W.radius + 2, W.radius - 2)
    if (height(x, z) < W.waterLevel + 0.15) continue
    if (pathDistance(x, z) < 1.65) continue
    if (Math.hypot(x - W.barn.x, z - W.barn.z) < 9) continue
    if (Math.hypot(x - W.windmill.x, z - W.windmill.z) < 6) continue
    if (Math.hypot(x - W.spawn.x, z - W.spawn.z) < 4) continue
    dummy.position.set(x, height(x, z), z)
    dummy.rotation.set(0, rand() * Math.PI, 0)
    dummy.scale.setScalar(randRange(0.6, 1.5))
    dummy.updateMatrix()
    grass.setMatrixAt(grassCount, dummy.matrix)
    grass.setColorAt(grassCount, new THREE.Color(pick(grassColors)))
    grassCount += 1
  }
  grass.count = grassCount
  grass.instanceColor.needsUpdate = true
  grass.receiveShadow = true
  root.add(grass)

  // Flowers -----------------------------------------------------------------
  const flowerColors = [0xfff4d8, 0xffd166, 0xf78fb3, 0xc8a2ff, 0xff8b6b, 0x9fd8ff]
  const stemMat = standard(0x568b3e, 0.9)
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 3), stemMat, 520)
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), standard(0xffffff, 0.75), 520)
  let flowerCount = 0
  for (let i = 0; i < 3000 && flowerCount < 520; i += 1) {
    const clusterX = randRange(-95, 95)
    const clusterZ = randRange(-95, 95)
    if (height(clusterX, clusterZ) < W.waterLevel + 0.2) continue
    if (pathDistance(clusterX, clusterZ) < 2.2) continue
    if (Math.hypot(clusterX - W.barn.x, clusterZ - W.barn.z) < 10) continue
    if (Math.hypot(clusterX - W.spawn.x, clusterZ - W.spawn.z) < 5) continue
    for (let f = 0; f < 3 && flowerCount < 520; f += 1) {
      const x = clusterX + randRange(-2.2, 2.2)
      const z = clusterZ + randRange(-2.2, 2.2)
      if (height(x, z) < W.waterLevel + 0.2 || pathDistance(x, z) < 1.9) continue
      const ground = height(x, z)
      dummy.position.set(x, ground + 0.25, z)
      dummy.rotation.set(randRange(-0.1, 0.1), rand() * Math.PI, randRange(-0.1, 0.1))
      dummy.scale.setScalar(randRange(0.8, 1.4))
      dummy.updateMatrix()
      stems.setMatrixAt(flowerCount, dummy.matrix)
      dummy.position.set(x, ground + 0.52, z)
      dummy.rotation.set(0, rand() * Math.PI, 0)
      dummy.scale.setScalar(randRange(0.8, 1.5))
      dummy.updateMatrix()
      heads.setMatrixAt(flowerCount, dummy.matrix)
      heads.setColorAt(flowerCount, new THREE.Color(pick(flowerColors)))
      flowerCount += 1
    }
  }
  stems.count = flowerCount
  heads.count = flowerCount
  heads.instanceColor.needsUpdate = true
  stems.castShadow = true
  heads.castShadow = true
  root.add(stems, heads)

  // Rocks -------------------------------------------------------------------
  const rockMat = standard(0x9a968b, 0.95)
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 70)
  const rockColors = [0x9a968b, 0x8b877d, 0xa8a496, 0x817d74]
  let rockCount = 0
  for (let i = 0; i < 500 && rockCount < 70; i += 1) {
    const x = randRange(-W.radius + 3, W.radius - 3)
    const z = randRange(-W.radius + 3, W.radius - 3)
    if (pathDistance(x, z) < 4.5) continue
    if (height(x, z) < W.waterLevel + 0.2) continue
    if (Math.hypot(x - W.barn.x, z - W.barn.z) < 13) continue
    if (Math.hypot(x - W.windmill.x, z - W.windmill.z) < 8) continue
    if (Math.hypot(x - W.elderOak.x, z - W.elderOak.z) < 6) continue
    if (Math.hypot(x - W.spawn.x, z - W.spawn.z) < 8) continue
    const s = randRange(0.35, 1.75)
    dummy.position.set(x, height(x, z) + s * 0.35, z)
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    dummy.scale.set(s * randRange(0.8, 1.4), s * randRange(0.6, 1), s * randRange(0.8, 1.4))
    dummy.updateMatrix()
    rocks.setMatrixAt(rockCount, dummy.matrix)
    rocks.setColorAt(rockCount, new THREE.Color(pick(rockColors)))
    if (s > 1.05) colliders.push({ x, z, r: s * 0.9 })
    rockCount += 1
  }
  rocks.count = rockCount
  rocks.instanceColor.needsUpdate = true
  rocks.castShadow = rocks.receiveShadow = true
  root.add(rocks)

  // Barn --------------------------------------------------------------------
  const barnGroup = new THREE.Group()
  const barnGround = height(W.barn.x, W.barn.z)
  barnGroup.position.set(W.barn.x, barnGround - 0.35, W.barn.z)
  barnGroup.rotation.y = W.barn.rotation
  root.add(barnGroup)
  const barnRed = standard(0xc44b3b, 0.9)
  const barnWhite = standard(0xf3ead5, 0.85)
  const barnDark = standard(0x51301f, 0.9)
  const roofMat = standard(0x8a4c3b, 0.92)
  const stoneMat = standard(0xaca79a, 0.95)

  barnGroup.add(box(12.4, 0.7, 10.4, stoneMat, 0, 0.35, 0))
  barnGroup.add(box(12, 6.2, 10, barnRed, 0, 3.7, 0))
  barnGroup.add(box(12.6, 0.45, 10.6, barnWhite, 0, 6.85, 0))
  for (const side of [-1, 1]) {
    const roof = box(7.1, 0.45, 11.2, roofMat, side * 2.85, 8.5, 0)
    roof.rotation.z = side * -0.62
    barnGroup.add(roof)
    const trim = box(7.2, 0.16, 0.32, barnWhite, side * 2.85, 8.55, 5.45)
    trim.rotation.z = side * -0.62
    barnGroup.add(trim)
    barnGroup.add(box(0.36, 6.2, 0.4, barnWhite, side * 5.92, 3.7, 4.95))
    barnGroup.add(box(0.36, 6.2, 0.4, barnWhite, side * 5.92, 3.7, -4.95))
  }
  barnGroup.add(box(0.4, 6.2, 0.4, barnWhite, 5.95, 3.7, 0))
  barnGroup.add(box(0.4, 6.2, 0.4, barnWhite, -5.95, 3.7, 0))

  const doorGroup = new THREE.Group()
  doorGroup.position.set(0, 0, 5.06)
  barnGroup.add(doorGroup)
  doorGroup.add(box(3.9, 4.8, 0.2, barnDark, 0, 3.05, 0))
  for (const side of [-1, 1]) {
    const brace = box(0.18, 5.1, 0.1, barnWhite, 0, 3.05, 0.08)
    brace.rotation.z = side * 0.72
    doorGroup.add(brace)
  }
  doorGroup.add(box(4.4, 0.24, 0.3, barnWhite, 0, 5.55, 0.1))
  doorGroup.add(box(0.24, 4.9, 0.3, barnWhite, -1.95, 3.05, 0.1))
  doorGroup.add(box(0.24, 4.9, 0.3, barnWhite, 1.95, 3.05, 0.1))
  doorGroup.add(box(0.2, 0.2, 0.2, standard(0xe4b84a, 0.4), 1.5, 3.0, 0.2))

  const loft = box(2.4, 2.2, 0.24, barnDark, 0, 7.2, 5.08)
  barnGroup.add(loft)
  barnGroup.add(box(2.8, 2.6, 0.16, barnWhite, 0, 7.2, 5.02))
  barnGroup.add(box(2.2, 2, 0.26, barnDark, 0, 7.2, 4.95))
  for (const side of [-1, 1]) {
    const window = box(1.4, 1.6, 0.2, barnDark, side * 3.7, 3.9, 5.06)
    barnGroup.add(window)
    barnGroup.add(box(1.7, 0.18, 0.26, barnWhite, side * 3.7, 4.75, 5.08))
    barnGroup.add(box(1.7, 0.18, 0.26, barnWhite, side * 3.7, 3.05, 5.08))
    barnGroup.add(box(0.18, 1.8, 0.26, barnWhite, side * 3.0, 3.9, 5.08))
    barnGroup.add(box(0.18, 1.8, 0.26, barnWhite, side * 4.4, 3.9, 5.08))
  }
  // side windows
  for (const side of [-1, 1]) {
    for (const zPos of [-2.6, 2.6]) {
      barnGroup.add(box(0.2, 1.5, 1.3, barnDark, side * 6.02, 4.1, zPos))
      barnGroup.add(box(0.24, 0.16, 1.5, barnWhite, side * 6.04, 4.9, zPos))
      barnGroup.add(box(0.24, 0.16, 1.5, barnWhite, side * 6.04, 3.3, zPos))
    }
  }
  // Weather vane
  barnGroup.add(box(0.1, 1.4, 0.1, standard(0x44413a, 0.6), 0, 10.2, 0))
  barnGroup.add(box(1.1, 0.08, 0.08, standard(0x44413a, 0.6), 0.25, 10.8, 0))
  const vaneArrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), standard(0xc8a044, 0.4))
  vaneArrow.rotation.z = -Math.PI / 2
  vaneArrow.position.set(0.85, 10.8, 0)
  barnGroup.add(vaneArrow)
  colliders.push({ x: W.barn.x, z: W.barn.z, r: 8.4 })

  // Silo
  const siloGroup = new THREE.Group()
  const siloX = W.barn.x + 7.6
  const siloZ = W.barn.z + 2
  siloGroup.position.set(siloX, height(siloX, siloZ) - 0.3, siloZ)
  root.add(siloGroup)
  siloGroup.add(cylinder(2.2, 2.4, 12, 16, standard(0xd8d2c1, 0.9), 0, 6, 0))
  siloGroup.add(cylinder(2.45, 2.45, 0.35, 16, standard(0x9d998c, 0.9), 0, 12.15, 0))
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), standard(0xb7b0a0, 0.9))
  dome.position.y = 12.3
  dome.castShadow = true
  siloGroup.add(dome)
  for (const bandY of [2.6, 6.4, 10.2]) {
    siloGroup.add(cylinder(2.32, 2.32, 0.14, 16, standard(0x9d998c, 0.85), 0, bandY, 0))
  }
  siloGroup.add(box(1.3, 2.5, 0.2, standard(0x7b5f40, 0.9), 0, 1.35, -2.35))
  colliders.push({ x: siloX, z: siloZ, r: 2.8 })

  // Paddock ----------------------------------------------------------------
  const paddock = W.paddock
  const postMat = standard(0x8b6340, 0.9)
  const railMat = standard(0xa87c50, 0.9)
  const posts = []
  const railPairs = []
  const halfW = paddock.width / 2
  const halfD = paddock.depth / 2
  const sides = [
    { ax: -halfW, az: -halfD, bx: halfW, bz: -halfD, gate: false },
    { ax: -halfW, az: halfD, bx: halfW, bz: halfD, gate: false },
    { ax: -halfW, az: -halfD, bx: -halfW, bz: halfD, gate: false },
    { ax: halfW, az: -halfD, bx: halfW, bz: halfD, gate: true }
  ]
  const inGate = (x, z) => x > halfW - 1 && z > -1.4 && z < 3.2
  sides.forEach(side => {
    const length = Math.hypot(side.bx - side.ax, side.bz - side.az)
    const segments = Math.max(2, Math.round(length / 2.4))
    const points = []
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments
      const lx = THREE.MathUtils.lerp(side.ax, side.bx, t)
      const lz = THREE.MathUtils.lerp(side.az, side.bz, t)
      const gated = side.gate && inGate(lx, lz) && i > 0 && i < segments
      points.push(gated ? null : [lx, lz])
      if (!gated) posts.push([lx, lz])
    }
    for (let i = 0; i < segments; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      if (!a || !b) continue
      const mx = (a[0] + b[0]) / 2
      const mz = (a[1] + b[1]) / 2
      if (side.gate && inGate(mx, mz)) continue
      railPairs.push([a, b])
    }
  })
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.35, 0.22), postMat, posts.length)
  posts.forEach(([lx, lz], index) => {
    const x = paddock.x + lx
    const z = paddock.z + lz
    dummy.position.set(x, height(x, z) + 0.6, z)
    dummy.rotation.set(0, 0, randRange(-0.03, 0.03))
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    postMesh.setMatrixAt(index, dummy.matrix)
  })
  postMesh.castShadow = postMesh.receiveShadow = true
  root.add(postMesh)

  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.12), railMat, railPairs.length * 2)
  let railIndex = 0
  railPairs.forEach(([a, b]) => {
    const ax = paddock.x + a[0]
    const az = paddock.z + a[1]
    const bx = paddock.x + b[0]
    const bz = paddock.z + b[1]
    const y = (height(ax, az) + height(bx, bz)) / 2
    const angle = Math.atan2(bz - az, bx - ax)
    const distance = Math.hypot(bx - ax, bz - az)
    for (const railY of [0.45, 0.95]) {
      dummy.position.set((ax + bx) / 2, y + railY, (az + bz) / 2)
      dummy.rotation.set(0, -angle, 0)
      dummy.scale.set(distance + 0.08, 1, 1)
      dummy.updateMatrix()
      railMesh.setMatrixAt(railIndex, dummy.matrix)
      railIndex += 1
    }
  })
  railMesh.castShadow = railMesh.receiveShadow = true
  root.add(railMesh)

  // Hay bales
  const hayMat = standard(0xd9b45f, 0.95)
  const hayBand = standard(0xc39a44, 0.9)
  for (const [hx, hz, rot] of [[24.5, 4, 0.2], [27.5, 5.2, -0.4], [26, 2.2, 0.5]]) {
    const hay = new THREE.Group()
    hay.position.set(hx, height(hx, hz) + 0.55, hz)
    hay.rotation.y = rot
    hay.add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 1.15), hayMat))
    hay.add(box(2.15, 0.1, 1.2, hayBand, 0, 0.25, 0))
    hay.add(box(2.15, 0.1, 1.2, hayBand, 0, -0.25, 0))
    hay.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true } })
    root.add(hay)
    colliders.push({ x: hx, z: hz, r: 1.4 })
  }

  // Elder oak ---------------------------------------------------------------
  const oakGroup = new THREE.Group()
  const oakGround = height(W.elderOak.x, W.elderOak.z)
  oakGroup.position.set(W.elderOak.x, oakGround, W.elderOak.z)
  root.add(oakGroup)
  const oakTrunk = cylinder(1.2, 1.75, 7.4, 9, standard(0x6e4a2e, 0.95), 0, 3.7, 0)
  oakTrunk.rotation.z = 0.04
  oakGroup.add(oakTrunk)
  const oakLeafMat = standard(0x477f3f, 0.95)
  const oakBlobs = [
    [0, 9.2, 0, 4.6, 2.6, 4.2],
    [3.4, 8.2, 1.4, 3.1, 2.1, 2.9],
    [-3.2, 8.4, -1.2, 3.4, 2.2, 3.2],
    [1.2, 10.6, -2.2, 3.0, 2.0, 2.8],
    [-1.4, 9.8, 2.6, 2.6, 1.8, 2.5],
    [4.2, 9.6, -1.8, 2.2, 1.7, 2.2]
  ]
  oakBlobs.forEach(([x, y, z, sx, sy, sz]) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), oakLeafMat)
    blob.position.set(x, y, z)
    blob.scale.set(sx, sy, sz)
    blob.castShadow = true
    blob.receiveShadow = true
    oakGroup.add(blob)
  })
  // Rope swing
  const ropeMat = standard(0xcdb98d, 0.9)
  oakGroup.add(box(0.06, 3.6, 0.06, ropeMat, 2.2, 6.2, 0.4))
  oakGroup.add(box(0.06, 3.6, 0.06, ropeMat, 3.4, 6.2, 0.4))
  oakGroup.add(box(1.5, 0.12, 0.5, standard(0x9a6b3f, 0.9), 2.8, 4.35, 0.4))
  colliders.push({ x: W.elderOak.x, z: W.elderOak.z, r: 2.2 })

  // Dock -------------------------------------------------------------------
  const dockGroup = new THREE.Group()
  dockGroup.position.set(W.dock.x, W.waterLevel, 0)
  root.add(dockGroup)
  const plankMat = standard(0xa87a4a, 0.9)
  const dockPostMat = standard(0x76512f, 0.95)
  const dockZ0 = W.dock.zStart
  const dockZ1 = W.dock.zEnd
  for (let z = dockZ0; z <= dockZ1; z += 0.62) {
    const plank = box(3.4, 0.16, 0.5, plankMat, 0, 0.62, z)
    dockGroup.add(plank)
  }
  for (const side of [-1, 1]) {
    for (let z = dockZ0 - 0.4; z <= dockZ1 + 0.4; z += 3.5) {
      const post = cylinder(0.14, 0.16, 3.6, 6, dockPostMat, side * 1.62, -0.9, z)
      dockGroup.add(post)
      dockGroup.add(cylinder(0.19, 0.19, 0.12, 6, dockPostMat, side * 1.62, 0.74, z))
    }
  }
  const dockSign = makeLabelSprite('LAKESIDE DOCK', { width: 640, height: 110, fontSize: 50 })
  dockSign.position.set(W.dock.x, 5.6, 17.5)
  root.add(dockSign)
  dockSign.userData.baseY = 5.6
  dockSign.userData.bob = 0.02
  glows.push(dockSign)

  // Windmill ---------------------------------------------------------------
  const windmillGroup = new THREE.Group()
  const windGround = height(W.windmill.x, W.windmill.z)
  windmillGroup.position.set(W.windmill.x, windGround - 0.25, W.windmill.z)
  root.add(windmillGroup)
  const windStone = standard(0xd7cdb8, 0.95)
  const windTrim = standard(0x8c6743, 0.9)
  windmillGroup.add(cylinder(2.3, 3.5, 10, 12, windStone, 0, 5, 0))
  windmillGroup.add(cylinder(2.55, 2.55, 0.4, 12, windTrim, 0, 10, 0))
  const windCap = new THREE.Mesh(new THREE.ConeGeometry(2.75, 2.2, 12), standard(0x7e4a36, 0.9))
  windCap.position.y = 11.2
  windCap.castShadow = true
  windmillGroup.add(windCap)
  windmillGroup.add(box(1.3, 2.6, 0.2, standard(0x6b4a2f, 0.9), 0, 1.35, 3.35))
  windmillGroup.add(box(0.9, 0.9, 0.2, standard(0x4f3824, 0.9), 0, 6.8, 2.55))
  windmillGroup.add(box(1.2, 0.16, 0.3, windTrim, 0, 8.1, 2.5))

  const blades = new THREE.Group()
  blades.position.set(0, 8.4, 3.6)
  windmillGroup.add(blades)
  const bladeMat = standard(0xf1e5cd, 0.9)
  const bladeFrame = standard(0x8c6743, 0.9)
  for (let i = 0; i < 4; i += 1) {
    const arm = new THREE.Group()
    arm.rotation.z = (i / 4) * Math.PI * 2
    arm.add(box(0.24, 5.6, 0.18, bladeFrame, 0, 2.8, 0))
    for (let rung = 0; rung < 5; rung += 1) {
      arm.add(box(1.7, 0.12, 0.14, bladeFrame, 0, 1 + rung * 0.95, 0))
    }
    const sail = box(1.45, 4.2, 0.06, bladeMat, 0.55, 2.6, 0.05)
    arm.add(sail)
    blades.add(arm)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 10), bladeFrame)
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.1
  blades.add(hub)
  colliders.push({ x: W.windmill.x, z: W.windmill.z, r: 4.1 })

  // Welcome sign -----------------------------------------------------------
  const signGroup = new THREE.Group()
  const signX = 11
  const signZ = -21
  signGroup.position.set(signX, height(signX, signZ), signZ)
  signGroup.rotation.y = 0.55
  root.add(signGroup)
  signGroup.add(box(0.22, 2.9, 0.22, standard(0x7a5331, 0.95), -1.5, 1.45, 0))
  signGroup.add(box(0.22, 2.9, 0.22, standard(0x7a5331, 0.95), 1.5, 1.45, 0))
  signGroup.add(box(4.3, 1.6, 0.2, standard(0xa97745, 0.95), 0, 2.5, 0))
  const signFace = makeLabelSprite('HORSE VALLEY', { width: 760, height: 190, fontSize: 96, background: 'rgba(168, 119, 69, 0)', border: 'rgba(0,0,0,0)' })
  signFace.material.map.needsUpdate = true
  signFace.scale.set(2.4, 0.6, 1)
  signFace.position.set(0, 2.5, 0.16)
  signGroup.add(signFace)

  // Apples -----------------------------------------------------------------
  const appleGlowTexture = makeGlowTexture()
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffc23c,
    emissive: 0xa66a00,
    emissiveIntensity: 0.35,
    metalness: 0.55,
    roughness: 0.22
  })
  const leafMat = standard(0x5c9c48, 0.8)
  const stemMatApple = standard(0x6b4423, 0.9)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })

  const apples = []
  CONFIG.apples.forEach((spot, index) => {
    const group = new THREE.Group()
    const ground = spot.y !== undefined ? spot.y : height(spot.x, spot.z) + 1.15
    group.position.set(spot.x, ground, spot.z)
    const apple = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), goldMat)
    apple.scale.y = 0.92
    apple.castShadow = true
    group.add(apple)
    group.add(cylinder(0.035, 0.045, 0.28, 4, stemMatApple, 0, 0.32, 0))
    const leaf = box(0.22, 0.05, 0.13, leafMat, 0.12, 0.42, 0.03)
    leaf.rotation.z = 0.4
    group.add(leaf)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: appleGlowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }))
    glow.scale.set(2.3, 2.3, 1)
    group.add(glow)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 24), ringMat.clone())
    ring.rotation.x = -Math.PI / 2
    ring.position.set(spot.x, (W.waterLevel + 0.07) + (spot.y !== undefined ? 0 : 0), spot.z)
    if (spot.y === undefined) ring.position.y = height(spot.x, spot.z) + 0.07
    root.add(ring)
    root.add(group)
    const appleData = {
      group,
      ring,
      glow,
      apple,
      baseY: ground,
      collected: false,
      label: spot.label,
      index
    }
    ring.visible = false
    apples.push(appleData)
    glows.push(group)
  })

  // NPCs -------------------------------------------------------------------
  function createNpc(definition, key) {
    const group = new THREE.Group()
    const colors = definition.colors
    const skin = standard(colors.skin, 0.85)
    const shirt = standard(colors.shirt, 0.9)
    const pants = standard(colors.pants, 0.9)
    const hair = standard(colors.hair, 0.9)
    const hatMat = standard(colors.hat, 0.85)
    const accent = standard(colors.accent, 0.85)
    const dark = standard(0x33251b, 0.8)

    group.add(box(0.4, 0.9, 0.4, pants, 0.28, 0.45, 0))
    group.add(box(0.4, 0.9, 0.4, pants, -0.28, 0.45, 0))
    group.add(box(0.34, 0.2, 0.52, dark, 0.28, 0.08, 0.07))
    group.add(box(0.34, 0.2, 0.52, dark, -0.28, 0.08, 0.07))
    group.add(box(1.05, 1.15, 0.58, shirt, 0, 1.45, 0))
    const armL = new THREE.Group()
    armL.position.set(0.68, 1.9, 0)
    armL.add(box(0.3, 0.95, 0.34, skin, 0, -0.42, 0))
    group.add(armL)
    const armR = new THREE.Group()
    armR.position.set(-0.68, 1.9, 0)
    armR.add(box(0.3, 0.95, 0.34, skin, 0, -0.42, 0))
    group.add(armR)
    group.add(box(0.64, 0.64, 0.64, skin, 0, 2.36, 0))
    group.add(box(0.66, 0.2, 0.68, hair, 0, 2.6, -0.06))
    group.add(box(0.12, 0.12, 0.06, dark, 0.17, 2.4, 0.33))
    group.add(box(0.12, 0.12, 0.06, dark, -0.17, 2.4, 0.33))
    group.add(box(0.2, 0.18, 0.2, standard(0x6b3f2b, 0.85), 0, 2.27, 0.34))

    if (definition.hat === 'straw') {
      group.add(cylinder(0.78, 0.82, 0.09, 12, hatMat, 0, 2.82, 0))
      group.add(cylinder(0.42, 0.5, 0.42, 12, hatMat, 0, 2.98, 0))
      group.add(cylinder(0.51, 0.51, 0.08, 12, accent, 0, 2.87, 0))
      group.add(box(0.46, 0.5, 0.08, accent, 0, 1.25, 0.31))
      group.add(box(0.16, 0.5, 0.08, accent, 0.4, 1.75, 0.3))
      group.add(box(0.16, 0.5, 0.08, accent, -0.4, 1.75, 0.3))
    } else {
      group.add(cylinder(0.48, 0.5, 0.4, 12, hatMat, 0, 2.88, 0))
      group.add(box(0.8, 0.1, 0.55, hatMat, 0, 2.7, 0.32))
      group.add(box(0.55, 0.5, 0.2, accent, 0, 2.5, 0.36))
      group.add(box(0.72, 0.9, 0.3, standard(0x5f7a46, 0.9), 0, 1.55, -0.43))
    }

    group.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true } })
    const ground = height(definition.x, definition.z)
    group.position.set(definition.x, ground, definition.z)
    group.rotation.y = Math.atan2(W.spawn.x - definition.x, W.spawn.z - definition.z)
    root.add(group)

    const label = makeLabelSprite(definition.name, { width: 512, height: 108, fontSize: 52 })
    label.scale.set(2.15, 0.454, 1)
    label.position.set(definition.x, ground + 3.35, definition.z)
    root.add(label)
    const marker = makeLabelSprite('!', { width: 128, height: 128, marker: true, background: 'rgba(255, 200, 61, 0.97)', border: '#7a4a16', color: '#6b3d10' })
    marker.scale.set(0.78, 0.78, 1)
    marker.position.set(definition.x, ground + 4.05, definition.z)
    root.add(marker)

    return {
      key,
      name: definition.name,
      role: definition.role,
      x: definition.x,
      z: definition.z,
      group,
      armL,
      armR,
      label,
      marker,
      baseGround: ground,
      phase: rand() * Math.PI * 2
    }
  }

  const npcs = Object.entries(CONFIG.npcs).map(([key, definition]) => createNpc(definition, key))

  // Butterflies ------------------------------------------------------------
  const butterflies = []
  const butterflyColors = [0xffd166, 0xf78fb3, 0x9fd8ff, 0xfff4d8]
  for (let i = 0; i < 14; i += 1) {
    const group = new THREE.Group()
    const wingMat = new THREE.MeshBasicMaterial({ color: pick(butterflyColors), side: THREE.DoubleSide })
    const wings = []
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), wingMat)
      wing.position.x = side * 0.13
      wing.rotation.y = side * 0.2
      group.add(wing)
      wings.push({ wing, side })
    }
    const centerX = randRange(-70, 70)
    const centerZ = randRange(-70, 70)
    group.userData = { centerX, centerZ, phase: rand() * 10, radius: randRange(2, 7), speed: randRange(0.4, 1.1) }
    group.position.set(centerX, height(centerX, centerZ) + 1.3, centerZ)
    root.add(group)
    butterflies.push({ group, wings })
  }

  // Dust / sparkle particles ------------------------------------------------
  const particleCount = 260
  const particlePositions = new Float32Array(particleCount * 3)
  const particleColors = new Float32Array(particleCount * 3)
  const particleSizes = new Float32Array(particleCount)
  const particleAlphas = new Float32Array(particleCount)
  const particleLife = new Float32Array(particleCount)
  const particleMaxLife = new Float32Array(particleCount)
  const particleVelocity = new Float32Array(particleCount * 3)
  const particleGravity = new Float32Array(particleCount)
  const particleGeometry = new THREE.BufferGeometry()
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3))
  particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(particleSizes, 1))
  particleGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(particleAlphas, 1))
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (240.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.12, d) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true
  })
  const particles = new THREE.Points(particleGeometry, particleMaterial)
  particles.frustumCulled = false
  scene.add(particles)
  let particleCursor = 0

  function spawnParticles(position, color, count = 8, options = {}) {
    const { spread = 0.48, up = 2.2, size = 9, life = 0.7, gravity = 5.5 } = options
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i += 1) {
      const index = particleCursor
      particleCursor = (particleCursor + 1) % particleCount
      particlePositions[index * 3] = position.x + randRange(-0.2, 0.2)
      particlePositions[index * 3 + 1] = position.y + randRange(-0.05, 0.2)
      particlePositions[index * 3 + 2] = position.z + randRange(-0.2, 0.2)
      particleVelocity[index * 3] = randRange(-spread, spread)
      particleVelocity[index * 3 + 1] = randRange(up * 0.4, up)
      particleVelocity[index * 3 + 2] = randRange(-spread, spread)
      particleColors[index * 3] = c.r
      particleColors[index * 3 + 1] = c.g
      particleColors[index * 3 + 2] = c.b
      particleSizes[index] = size * randRange(0.6, 1.35)
      particleAlphas[index] = 1
      particleLife[index] = life * randRange(0.7, 1.2)
      particleMaxLife[index] = particleLife[index]
      particleGravity[index] = gravity
    }
    particleGeometry.attributes.position.needsUpdate = true
    particleGeometry.attributes.color.needsUpdate = true
    particleGeometry.attributes.aSize.needsUpdate = true
    particleGeometry.attributes.aAlpha.needsUpdate = true
  }

  // Update loops ------------------------------------------------------------
  let elapsed = 0

  function update(dt, time) {
    elapsed = time
    waterUniforms.time.value = time
    blades.rotation.z = time * 0.55

    cloudBlobs.forEach(cloud => {
      cloud.position.x += cloud.userData.speed * dt
      if (cloud.position.x > 120) cloud.position.x = -120
    })

    birds.forEach(bird => {
      const data = bird.group.userData
      const angle = time * data.speed + data.phase
      bird.group.position.set(
        data.center.x + Math.cos(angle) * data.radius,
        data.height + Math.sin(time * 0.8 + data.phase) * 1.2,
        data.center.z + Math.sin(angle) * data.radius
      )
      bird.group.rotation.y = -angle + Math.PI / 2
      const flap = Math.sin(time * data.flap + data.phase) * 0.6
      bird.wings.forEach(({ wing, side }) => {
        wing.rotation.z = side * flap
      })
    })

    apples.forEach(apple => {
      if (apple.collected) return
      apple.group.position.y = apple.baseY + Math.sin(time * 1.8 + apple.index) * 0.14
      apple.group.rotation.y = time * 0.9 + apple.index
      apple.glow.material.opacity = 0.65 + Math.sin(time * 3 + apple.index) * 0.2
    })

    npcs.forEach(npc => {
      npc.group.position.y = npc.baseGround + Math.sin(time * 1.5 + npc.phase) * 0.015
      npc.marker.position.y = npc.baseGround + 4.05 + Math.sin(time * 2.2 + npc.phase) * 0.12
      npc.marker.material.rotation = Math.sin(time * 1.2 + npc.phase) * 0.05
      npc.armR.rotation.z = Math.sin(time * 0.9 + npc.phase) * 0.06
      npc.armL.rotation.z = -Math.sin(time * 0.9 + npc.phase) * 0.06
    })

    butterflies.forEach((butterfly, index) => {
      const data = butterfly.group.userData
      const angle = time * data.speed + data.phase
      const x = data.centerX + Math.cos(angle) * data.radius
      const z = data.centerZ + Math.sin(angle * 0.8) * data.radius
      butterfly.group.position.set(x, height(x, z) + 1.2 + Math.sin(time * 2 + data.phase) * 0.4, z)
      butterfly.group.rotation.y = -angle
      butterfly.wings.forEach(({ wing, side }) => {
        wing.rotation.z = side * Math.sin(time * 14 + index) * 0.9
      })
    })

    // Particles
    for (let i = 0; i < particleCount; i += 1) {
      if (particleLife[i] <= 0) {
        particleAlphas[i] = 0
        continue
      }
      particleLife[i] -= dt
      const t = Math.max(0, particleLife[i] / particleMaxLife[i])
      particleVelocity[i * 3 + 1] -= particleGravity[i] * dt
      particlePositions[i * 3] += particleVelocity[i * 3] * dt
      particlePositions[i * 3 + 1] += particleVelocity[i * 3 + 1] * dt
      particlePositions[i * 3 + 2] += particleVelocity[i * 3 + 2] * dt
      particleAlphas[i] = t * t
    }
    particleGeometry.attributes.position.needsUpdate = true
    particleGeometry.attributes.aAlpha.needsUpdate = true
  }

  function collectApple(apple, effects, audio) {
    if (apple.collected) return false
    apple.collected = true
    apple.group.visible = false
    apple.ring.visible = false
    if (effects) {
      const pos = apple.group.position.clone()
      effects.burst(pos, 0xffd166, 22, { spread: 2.6, up: 5, size: 13, life: 1.1, gravity: 4 })
      effects.burst(pos, 0xfff3c0, 10, { spread: 1.4, up: 3, size: 7, life: 0.8, gravity: 2 })
    }
    if (audio) audio.collect()
    return true
  }

  function resetApples() {
    apples.forEach(apple => {
      apple.collected = false
      apple.group.visible = true
      apple.ring.visible = false
    })
  }

  return {
    root,
    terrain: terrainData,
    minimap,
    apples,
    npcs,
    colliders,
    waterLevel: W.waterLevel,
    spawn: W.spawn,
    update,
    spawnParticles,
    collectApple,
    resetApples,
    getHeight: height,
    clouds: cloudBlobs,
    trail: terrainData.trail
  }
}
