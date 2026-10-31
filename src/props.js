import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt, slopeAt, WATER_LEVEL } from './terrain.js'

const clamp = THREE.MathUtils.clamp
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

const SUN_DIR = new THREE.Vector3(-0.22, 0.3, -0.93).normalize()

export const BRIDGE = {
  x: -6,
  halfWidth: 2.5,
  deckHeight: 1.35,
  rampStart: 15.5,
  rampEnd: 20.5,
  endHeight: 0.35,
}

export function bridgeDeckAt(x, z) {
  if (Math.abs(x - BRIDGE.x) > BRIDGE.halfWidth) return null
  const az = Math.abs(z)
  if (az > BRIDGE.rampEnd) return null
  const t = clamp((az - BRIDGE.rampStart) / (BRIDGE.rampEnd - BRIDGE.rampStart), 0, 1)
  return BRIDGE.deckHeight - (BRIDGE.deckHeight - BRIDGE.endHeight) * t
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1)

let roofTileTex = null
function roofTileTexture() {
  if (roofTileTex) return roofTileTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f7f2ea'
  ctx.fillRect(0, 0, 256, 256)
  const rows = 9
  const rowH = 256 / rows
  for (let r = 0; r < rows; r++) {
    const y = r * rowH
    ctx.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(70,40,25,0.07)'
    ctx.fillRect(0, y, 256, rowH)
    ctx.strokeStyle = 'rgba(55,30,20,0.22)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, y + rowH)
    ctx.lineTo(256, y + rowH)
    ctx.stroke()
    const cols = 9
    for (let k = 0; k <= cols; k++) {
      const x = (k / cols) * 256 + (r % 2 ? 14 : 0)
      ctx.strokeStyle = 'rgba(55,30,20,0.13)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + rowH)
      ctx.stroke()
    }
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 40},${45 + Math.random() * 30},${30 + Math.random() * 20},${Math.random() * 0.09})`
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  roofTileTex = tex
  return tex
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(BOX, material)
  mesh.scale.set(w, h, d)
  return mesh
}

function shadowed(mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function makeSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color('#2f86e6') },
    uHorizon: { value: new THREE.Color('#ffcf94') },
    uHaze: { value: new THREE.Color('#eaf3df') },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color('#fff2c8') },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uHaze;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.24, h));
        col = mix(col, uHaze, smoothstep(0.24, 0.75, h) * 0.12);
        float sunAmount = max(dot(dir, uSunDir), 0.0);
        float glow = pow(sunAmount, 5.0) * 0.3;
        float disc = smoothstep(0.9975, 0.9990, sunAmount) * 0.9;
        col += uSunColor * (glow + disc);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })

  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 40, 24), material)
  sky.renderOrder = -2
  scene.add(sky)

  // Soft sun bloom behind the disc.
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,226,158,0.95)')
  grad.addColorStop(0.2, 'rgba(255,198,116,0.58)')
  grad.addColorStop(0.52, 'rgba(255,176,94,0.17)')
  grad.addColorStop(1, 'rgba(255,165,80,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    opacity: 0.92,
  }))
  sprite.position.copy(SUN_DIR).multiplyScalar(470)
  sprite.scale.setScalar(62)
  scene.add(sprite)

  return sky
}

function makeClouds(scene, rng) {
  const geometry = new THREE.IcosahedronGeometry(1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.94,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.22,
  })
  const puffs = []
  const cloudCenters = []
  for (let i = 0; i < 16; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 90 + rng() * 120
    const cx = Math.cos(angle) * radius
    const cz = Math.sin(angle) * radius
    const cy = 56 + rng() * 34
    const count = 4 + Math.floor(rng() * 4)
    cloudCenters.push({ cx, cy, cz })
    for (let j = 0; j < count; j++) {
      puffs.push({
        x: cx + (rng() - 0.5) * 22,
        y: cy + (rng() - 0.5) * 5,
        z: cz + (rng() - 0.5) * 12,
        sx: 5 + rng() * 7,
        sy: 2.6 + rng() * 2.6,
        sz: 5 + rng() * 6,
      })
    }
  }
  // A few low, lazy clouds drifting over the ridge line.
  for (let i = 0; i < 7; i++) {
    const cx = (rng() - 0.5) * 200
    const cz = -70 - rng() * 90
    const cy = 34 + rng() * 16
    const count = 3 + Math.floor(rng() * 3)
    for (let j = 0; j < count; j++) {
      puffs.push({
        x: cx + (rng() - 0.5) * 18,
        y: cy + (rng() - 0.5) * 4,
        z: cz + (rng() - 0.5) * 10,
        sx: 4 + rng() * 5,
        sy: 2 + rng() * 2,
        sz: 4 + rng() * 5,
      })
    }
  }
  const mesh = new THREE.InstancedMesh(geometry, material, puffs.length)
  const dummy = new THREE.Object3D()
  puffs.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z)
    dummy.scale.set(p.sx, p.sy, p.sz)
    dummy.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh, centers: cloudCenters }
}

function makeTrees(root, rng, blocked) {
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.44, 3.4, 6)
  trunkGeo.translate(0, 1.7, 0)
  const leafGeo = new THREE.IcosahedronGeometry(1.25, 0)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })

  const trees = []
  let guard = 0
  while (trees.length < 220 && guard++ < 8000) {
    const x = (rng() - 0.5) * 190
    const z = (rng() - 0.5) * 190
    const h = heightAt(x, z)
    if (h < 1.2 || h > 28) continue
    if (slopeAt(x, z) > 0.58) continue
    if (Math.abs(z) < 13) continue
    if (blocked(x, z, 6.5)) continue
    if (Math.hypot(x - 8, z - 45) < 17) continue
    trees.push({ x, z, h, s: 0.85 + rng() * 0.75, rot: rng() * Math.PI * 2 })
  }
  // Hero trees framing the meadow from the sides.
  trees.push({ x: -17, z: 52, h: heightAt(-17, 52), s: 1.8, rot: 0.6 })
  trees.push({ x: 36, z: 50, h: heightAt(36, 50), s: 1.6, rot: 2.1 })

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true
  const leaves = []
  const palette = ['#4c9f3c', '#5caf48', '#6cbf55', '#7fce63', '#3f8c34'].map(c => new THREE.Color(c))
  const dummy = new THREE.Object3D()
  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.h, t.z)
    dummy.rotation.set(0, t.rot, 0)
    dummy.scale.setScalar(t.s)
    dummy.updateMatrix()
    trunkMesh.setMatrixAt(i, dummy.matrix)

    const clusters = 2 + Math.floor(rng() * 2)
    for (let c = 0; c < clusters; c++) {
      const angle = rng() * Math.PI * 2
      const radius = c === 0 ? 0 : 0.85 * t.s
      leaves.push({
        x: t.x + Math.cos(angle) * radius,
        y: t.h + (3.15 + rng() * 0.55 + (c === 0 ? 0.35 : 0)) * t.s,
        z: t.z + Math.sin(angle) * radius,
        s: (0.9 + rng() * 0.45) * t.s * (c === 0 ? 1.15 : 0.9),
        color: palette[Math.floor(rng() * palette.length)],
        rot: rng() * Math.PI,
      })
    }
  })
  trunkMesh.instanceMatrix.needsUpdate = true
  root.add(trunkMesh)

  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length)
  leafMesh.castShadow = true
  leafMesh.receiveShadow = true
  leaves.forEach((l, i) => {
    dummy.position.set(l.x, l.y, l.z)
    dummy.rotation.set(l.rot * 0.4, l.rot, l.rot * 0.2)
    dummy.scale.set(l.s * 1.15, l.s * 0.92, l.s * 1.15)
    dummy.updateMatrix()
    leafMesh.setMatrixAt(i, dummy.matrix)
    leafMesh.setColorAt(i, l.color)
  })
  leafMesh.instanceMatrix.needsUpdate = true
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
  root.add(leafMesh)

  return trees
}

function makePines(root, rng, blocked) {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 2.4, 5)
  trunkGeo.translate(0, 1.2, 0)
  const layers = []
  const cones = [
    [1.4, 2.0, 2.1],
    [1.1, 1.8, 3.1],
    [0.76, 1.6, 4.0],
  ]
  for (const [r, h, y] of cones) {
    const g = new THREE.ConeGeometry(r, h, 7)
    g.translate(0, y, 0)
    layers.push(g)
  }
  const foliageGeo = mergeGeometries(layers)
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4728', roughness: 1 })
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })
  const palette = ['#2f7a3a', '#3a8a44', '#479a4e', '#357f3c', '#4fa256'].map(c => new THREE.Color(c))

  const items = []
  let guard = 0
  while (items.length < 55 && guard++ < 3000) {
    const x = (rng() - 0.5) * 185
    const z = (rng() - 0.5) * 185
    const h = heightAt(x, z)
    if (h < 4 || h > 25) continue
    if (slopeAt(x, z) < 0.16) continue
    if (blocked(x, z, 5)) continue
    if (Math.hypot(x - 8, z - 45) < 20) continue
    items.push({ x, z, h, s: 0.95 + rng() * 0.65, rot: rng() * Math.PI })
  }

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, items.length)
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, items.length)
  trunks.castShadow = true
  foliage.castShadow = true
  foliage.receiveShadow = true
  const dummy = new THREE.Object3D()
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.h, it.z)
    dummy.rotation.set(0, it.rot, 0)
    dummy.scale.setScalar(it.s)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    foliage.setMatrixAt(i, dummy.matrix)
    foliage.setColorAt(i, palette[Math.floor(rng() * palette.length)])
  })
  trunks.instanceMatrix.needsUpdate = true
  foliage.instanceMatrix.needsUpdate = true
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true
  root.add(trunks, foliage)
}

function makeBushes(root, rng, blocked) {
  const geo = new THREE.IcosahedronGeometry(0.95, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const palette = ['#3c8a34', '#4d9c3c', '#5aab44', '#347c2f', '#65b64e'].map(c => new THREE.Color(c))
  const items = []
  let guard = 0
  while (items.length < 140 && guard++ < 2500) {
    const x = (rng() - 0.5) * 170
    const z = (rng() - 0.5) * 170
    const h = heightAt(x, z)
    if (h < 0.8 || h > 18) continue
    if (slopeAt(x, z) > 0.5) continue
    if (blocked(x, z, 2.6)) continue
    if (Math.hypot(x - 6, z - 48) < 7) continue
    items.push({ x, z, h, s: 0.42 + rng() * 0.62, rot: rng() * Math.PI })
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const dummy = new THREE.Object3D()
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.h + it.s * 0.45, it.z)
    dummy.rotation.set(it.rot * 0.3, it.rot, 0)
    dummy.scale.set(it.s * 1.25, it.s * 0.8, it.s * 1.25)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, palette[Math.floor(rng() * palette.length)])
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  root.add(mesh)
}

function makeRocks(root, rng, blocked) {
  const geo = new THREE.DodecahedronGeometry(0.85, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })
  const items = []
  let guard = 0
  while (items.length < 90 && guard++ < 1600) {
    const x = (rng() - 0.5) * 170
    const z = (rng() - 0.5) * 170
    const h = heightAt(x, z)
    const nearRiver = Math.abs(z) < 26
    if (h < -0.4 || h > 20) continue
    if (!nearRiver && rng() > 0.35) continue
    if (blocked(x, z, 1.2)) continue
    if (Math.hypot(x - 6, z - 48) < 5) continue
    items.push({ x, z, h, s: 0.5 + rng() * 1.1, rot: rng() * Math.PI })
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const dummy = new THREE.Object3D()
  const grey = new THREE.Color('#9d9a8c')
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.h + it.s * 0.25, it.z)
    dummy.rotation.set(rng() * 0.5, it.rot, rng() * 0.5)
    dummy.scale.set(it.s * 1.2, it.s * 0.8, it.s * 1.1)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, grey.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.08))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  root.add(mesh)
}

function makeGrassBladeTexture() {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const rand = mulberry32(4242)

  for (let i = 0; i < 11; i++) {
    const x = 14 + i * 10 + (rand() - 0.5) * 8
    const h = 58 + rand() * 62
    const lean = (rand() - 0.5) * 26
    const width = 3 + rand() * 2.6
    const hue = 96 + rand() * 22
    const light = 62 + rand() * 10
    ctx.strokeStyle = `hsl(${hue} 62% ${light}%)`
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, size)
    ctx.quadraticCurveTo(x + lean * 0.35, size - h * 0.6, x + lean, size - h)
    ctx.stroke()
  }
  // A few sunlit tips.
  for (let i = 0; i < 7; i++) {
    const x = 20 + rand() * 90
    const h = 38 + rand() * 40
    ctx.strokeStyle = `hsla(${88 + rand() * 20} 68% 62% / 0.75)`
    ctx.lineWidth = 1.6 + rand() * 1.4
    ctx.beginPath()
    ctx.moveTo(x, size)
    ctx.quadraticCurveTo(x, size - h * 0.55, x + (rand() - 0.5) * 14, size - h)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function makeGrass(root, rng, blocked) {
  const texture = makeGrassBladeTexture()
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1)
  geo.translate(0, 0.5, 0)
  const geoCross = geo.clone()
  geoCross.rotateY(Math.PI / 2)

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.32,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  })
  const palette = ['#dff7c4', '#d2f1b2', '#eafbd6', '#c9eba8', '#f2fce2'].map(c => new THREE.Color(c))
  const count = 9000
  const meshA = new THREE.InstancedMesh(geo, mat, count)
  const meshB = new THREE.InstancedMesh(geoCross, mat, count)
  meshA.receiveShadow = true
  meshB.receiveShadow = true
  const dummy = new THREE.Object3D()
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 8) {
    let x
    let z
    const roll = rng()
    if (roll < 0.55) {
      const angle = rng() * Math.PI * 2
      const radius = Math.sqrt(rng()) * 27
      x = 9 + Math.cos(angle) * radius
      z = 37 + Math.sin(angle) * radius
    } else if (roll < 0.85) {
      const angle = rng() * Math.PI * 2
      const radius = Math.sqrt(rng()) * 55
      x = 10 + Math.cos(angle) * radius
      z = 30 + Math.sin(angle) * radius
    } else {
      x = (rng() - 0.5) * 150
      z = (rng() - 0.5) * 150
    }
    const h = heightAt(x, z)
    if (h < 0.85 || h > 14) continue
    if (slopeAt(x, z) > 0.4) continue
    if (blocked(x, z, 1.3)) continue
    const w = 0.45 + rng() * 0.5
    const tall = rng() < 0.06
    const height = tall ? 0.6 + rng() * 0.28 : 0.24 + rng() * 0.28
    dummy.position.set(x, h - 0.04, z)
    dummy.rotation.set(0, rng() * Math.PI * 2, 0)
    dummy.scale.set(w, height, w)
    dummy.updateMatrix()
    meshA.setMatrixAt(placed, dummy.matrix)
    meshB.setMatrixAt(placed, dummy.matrix)
    const color = palette[Math.floor(rng() * palette.length)]
    meshA.setColorAt(placed, color)
    meshB.setColorAt(placed, color)
    placed++
  }
  meshA.count = meshB.count = placed
  meshA.instanceMatrix.needsUpdate = true
  meshB.instanceMatrix.needsUpdate = true
  if (meshA.instanceColor) meshA.instanceColor.needsUpdate = true
  if (meshB.instanceColor) meshB.instanceColor.needsUpdate = true
  root.add(meshA, meshB)
}

function makeFlowers(root, rng, blocked) {
  const stemGeo = new THREE.CylinderGeometry(0.028, 0.038, 0.42, 4)
  stemGeo.translate(0, 0.21, 0)
  const petals = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const g = new THREE.SphereGeometry(0.085, 5, 3)
    g.scale(1.25, 0.38, 0.72)
    g.translate(Math.cos(a) * 0.115, 0, Math.sin(a) * 0.115)
    petals.push(g)
  }
  const headGeo = mergeGeometries(petals)
  const centerGeo = new THREE.SphereGeometry(0.06, 5, 3)
  centerGeo.scale(1, 0.8, 1)
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4c8f38, roughness: 1 })
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, flatShading: true })
  const centerMat = new THREE.MeshStandardMaterial({
    color: '#ffd75e',
    emissive: new THREE.Color('#ffbe3d'),
    emissiveIntensity: 0.3,
    roughness: 0.7,
  })
  const palette = ['#ff8fb1', '#fff6df', '#ffd75e', '#c9a2ff', '#ff9f5e', '#ff6f91'].map(c => new THREE.Color(c))
  const count = 450
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count)
  const heads = new THREE.InstancedMesh(headGeo, headMat, count)
  const centers = new THREE.InstancedMesh(centerGeo, centerMat, count)
  const dummy = new THREE.Object3D()
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 20) {
    // Cluster flowers into cheerful patches instead of an even sprinkle.
    const cx = 9 + (rng() - 0.5) * 74
    const cz = 30 + (rng() - 0.5) * 62
    const x = cx + (rng() - 0.5) * 3.6
    const z = cz + (rng() - 0.5) * 3.6
    const h = heightAt(x, z)
    if (h < 1.4 || h > 12) continue
    if (slopeAt(x, z) > 0.36) continue
    if (blocked(x, z, 1.6)) continue
    const s = 0.55 + rng() * 0.3
    const lean = (rng() - 0.5) * 0.18
    dummy.position.set(x, h, z)
    dummy.rotation.set(lean, rng() * Math.PI * 2, lean * 0.6)
    dummy.scale.set(s, s, s)
    dummy.updateMatrix()
    stems.setMatrixAt(placed, dummy.matrix)

    dummy.position.set(x + lean * 0.25, h + 0.46 * s, z + lean * 0.25)
    dummy.rotation.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25)
    dummy.scale.set(s, s, s)
    dummy.updateMatrix()
    heads.setMatrixAt(placed, dummy.matrix)
    heads.setColorAt(placed, palette[Math.floor(rng() * palette.length)])

    dummy.position.set(x + lean * 0.25, h + 0.49 * s, z + lean * 0.25)
    dummy.scale.set(s, s, s)
    dummy.updateMatrix()
    centers.setMatrixAt(placed, dummy.matrix)
    placed++
  }
  stems.count = heads.count = centers.count = placed
  stems.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  centers.instanceMatrix.needsUpdate = true
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  root.add(stems, heads, centers)
}

function makeReeds(root, rng) {
  const geo = new THREE.BoxGeometry(0.05, 1, 0.05)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
  const palette = ['#8fae4e', '#a4bd5e', '#7e9c43'].map(c => new THREE.Color(c))
  const count = 320
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < 3000) {
    const x = (rng() - 0.5) * 170
    const z = 12 + rng() * 12
    const zz = rng() > 0.5 ? z : -z
    const h = heightAt(x, zz)
    if (h < -0.1 || h > 0.8) continue
    const s = 0.9 + rng() * 1.3
    dummy.position.set(x, h, zz)
    dummy.rotation.set((rng() - 0.5) * 0.15, rng() * Math.PI, (rng() - 0.5) * 0.15)
    dummy.scale.set(1, s, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(placed, dummy.matrix)
    mesh.setColorAt(placed, palette[Math.floor(rng() * palette.length)])
    placed++
  }
  mesh.count = placed
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  root.add(mesh)
}

function makeDirtTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c9a97c'
  ctx.fillRect(0, 0, 512, 512)
  const rand = mulberry32(88)
  for (let i = 0; i < 260; i++) {
    const r = 18 + rand() * 60
    ctx.fillStyle = `rgba(${120 + rand() * 50},${95 + rand() * 40},${60 + rand() * 35},${0.05 + rand() * 0.1})`
    ctx.beginPath()
    ctx.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 2600; i++) {
    const v = 90 + rand() * 90
    ctx.fillStyle = `rgba(${v},${v * 0.8},${v * 0.58},${0.1 + rand() * 0.22})`
    const s = 1 + rand() * 3
    ctx.fillRect(rand() * 512, rand() * 512, s, s)
  }
  for (let i = 0; i < 90; i++) {
    const r = 2 + rand() * 6
    const g = 150 + rand() * 70
    ctx.fillStyle = `rgba(${g},${g * 0.94},${g * 0.82},0.6)`
    ctx.beginPath()
    ctx.ellipse(rand() * 512, rand() * 512, r, r * 0.65, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function makePath(root, points, width, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])))
  const steps = 90
  const positions = []
  const colors = []
  const uvs = []
  const base = new THREE.Color('#f1e6d2')
  const left = []
  const right = []
  const sampleColors = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = curve.getPoint(t)
    const tangent = curve.getTangent(t)
    const nx = -tangent.z
    const nz = tangent.x
    const len = Math.hypot(nx, nz) || 1
    const half = width * (0.85 + 0.3 * Math.sin(t * 9.1))
    const lx = p.x + (nx / len) * half
    const lz = p.z + (nz / len) * half
    const rx = p.x - (nx / len) * half
    const rz = p.z - (nz / len) * half
    left.push(new THREE.Vector3(lx, heightAt(lx, lz) + 0.09, lz))
    right.push(new THREE.Vector3(rx, heightAt(rx, rz) + 0.09, rz))
    sampleColors.push(base.clone().offsetHSL(0, 0, (Math.sin(t * 13.7) + Math.sin(t * 5.3)) * 0.02))
  }
  const pushColor = (c) => colors.push(c.r, c.g, c.b)
  for (let i = 0; i < steps; i++) {
    const l0 = left[i]
    const r0 = right[i]
    const l1 = left[i + 1]
    const r1 = right[i + 1]
    const c0 = sampleColors[i]
    const c1 = sampleColors[i + 1]
    positions.push(l0.x, l0.y, l0.z, l1.x, l1.y, l1.z, r0.x, r0.y, r0.z)
    pushColor(c0); pushColor(c1); pushColor(c0)
    positions.push(r0.x, r0.y, r0.z, l1.x, l1.y, l1.z, r1.x, r1.y, r1.z)
    pushColor(c0); pushColor(c1); pushColor(c1)
    const v0 = (i / steps) * 22
    const v1 = ((i + 1) / steps) * 22
    uvs.push(0, v0, 0, v1, 1, v0)
    uvs.push(1, v0, 0, v1, 1, v1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

function makeHouse(root, rng, opts) {
  const { x, z, rot = 0, wallColor = '#f3e4c4', roofColor = '#a8493a', scale = 1, lamp = false } = opts
  const group = new THREE.Group()
  const baseY = heightAt(x, z)
  group.position.set(x, baseY, z)
  group.rotation.y = rot
  group.scale.setScalar(scale)

  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.92 })
  const wallMatDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(wallColor).multiplyScalar(0.86), roughness: 0.95 })
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, map: roofTileTexture(), roughness: 0.88 })
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#9a9689', roughness: 1 })
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6f4a2d', roughness: 0.95 })
  const trimMat = new THREE.MeshStandardMaterial({ color: '#f8f2e2', roughness: 0.9 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#a9d9e6',
    roughness: 0.15,
    metalness: 0.1,
    emissive: new THREE.Color('#ffcf94'),
    emissiveIntensity: 0.25,
  })

  const w = 7
  const d = 5.6
  const wallH = 3.3
  const floorY = 0.55
  const wallTop = floorY + wallH

  const foundation = box(w + 0.7, 2.4, d + 0.7, stoneMat)
  foundation.position.y = floorY - 1.2
  shadowed(foundation)
  group.add(foundation)

  const walls = box(w, wallH, d, wallMat)
  walls.position.y = floorY + wallH / 2
  shadowed(walls)
  group.add(walls)

  // Timber corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = box(0.22, wallH + 0.05, 0.22, woodMat)
      post.position.set(sx * (w / 2 - 0.02), floorY + wallH / 2, sz * (d / 2 - 0.02))
      group.add(post)
    }
  }

  // Roof: two pitched slabs plus triangular gable ends.
  const rise = 2.0
  const halfDepth = d / 2
  const angle = Math.atan2(rise, halfDepth)
  const slabLen = Math.hypot(halfDepth, rise) + 0.45
  for (const side of [-1, 1]) {
    const slab = box(w + 1.5, 0.24, slabLen, roofMat)
    slab.position.set(0, wallTop + rise / 2 - 0.03, side * halfDepth / 2)
    slab.rotation.x = side * angle
    shadowed(slab)
    group.add(slab)
  }
  const ridge = box(w + 1.6, 0.2, 0.5, roofMat)
  ridge.position.y = wallTop + rise + 0.06
  group.add(ridge)

  const gableShape = new THREE.Shape()
  gableShape.moveTo(-halfDepth, 0)
  gableShape.lineTo(halfDepth, 0)
  gableShape.lineTo(0, rise)
  gableShape.closePath()
  const gableGeo = new THREE.ShapeGeometry(gableShape)
  for (const side of [-1, 1]) {
    const gable = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.92, side: THREE.DoubleSide }))
    gable.rotation.y = side * Math.PI / 2
    gable.position.set(side * (w / 2 + 0.01), wallTop, 0)
    gable.castShadow = true
    group.add(gable)
  }

  // Chimney.
  const chimney = box(0.85, 3.0, 0.85, new THREE.MeshStandardMaterial({ color: '#8d5a44', roughness: 1 }))
  chimney.position.set(-w / 2 + 1.3, wallTop + 0.55, -d / 2 + 1.15)
  shadowed(chimney)
  group.add(chimney)
  const cap = box(1.05, 0.18, 1.05, stoneMat)
  cap.position.set(chimney.position.x, wallTop + 2.1, chimney.position.z)
  group.add(cap)

  // Door with frame and little porch.
  const door = box(1.15, 2.05, 0.16, woodMat)
  door.position.set(0, floorY + 1.02, d / 2 + 0.05)
  group.add(door)
  const doorTrim = box(1.4, 2.3, 0.1, trimMat)
  doorTrim.position.set(0, floorY + 1.05, d / 2 + 0.01)
  group.add(doorTrim)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: '#f4c95d', metalness: 0.8, roughness: 0.3 }))
  knob.position.set(0.36, floorY + 1.0, d / 2 + 0.16)
  group.add(knob)

  const porch = box(w + 0.9, 0.2, 1.5, woodMat)
  porch.position.set(0, floorY - 0.1, d / 2 + 0.75)
  shadowed(porch)
  group.add(porch)
  const step = box(2.2, 0.35, 0.7, stoneMat)
  step.position.set(0, floorY - 0.45, d / 2 + 1.65)
  group.add(step)

  // Windows.
  const addWindow = (px, py, pz, ry = 0) => {
    const win = new THREE.Group()
    win.position.set(px, py, pz)
    win.rotation.y = ry
    const pane = box(1.15, 1.0, 0.08, glassMat)
    win.add(pane)
    const frameV = box(0.09, 1.16, 0.1, trimMat)
    const frameH = box(1.3, 0.09, 0.1, trimMat)
    const l = frameV.clone(); l.position.x = -0.61; win.add(l)
    const r = frameV.clone(); r.position.x = 0.61; win.add(r)
    const t = frameH.clone(); t.position.y = 0.54; win.add(t)
    const b = frameH.clone(); b.position.y = -0.54; win.add(b)
    const mV = box(0.06, 1.0, 0.09, trimMat); win.add(mV)
    const mH = box(1.15, 0.06, 0.09, trimMat); win.add(mH)
    const boxFlower = box(1.35, 0.3, 0.35, woodMat)
    boxFlower.position.y = -0.72
    boxFlower.position.z = 0.22
    win.add(boxFlower)
    const blooms = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: '#ff8fb1', roughness: 0.9 }))
    blooms.position.set(0, -0.55, 0.24)
    blooms.scale.set(3.2, 0.7, 1)
    win.add(blooms)
    win.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    group.add(win)
  }
  addWindow(-2.0, floorY + 2.1, d / 2 + 0.05)
  addWindow(2.0, floorY + 2.1, d / 2 + 0.05)
  addWindow(w / 2 + 0.05, floorY + 2.1, 0, Math.PI / 2)
  addWindow(-w / 2 - 0.05, floorY + 2.1, 0.6, -Math.PI / 2)

  // Porch lantern.
  const lampPost = box(0.12, 2.4, 0.12, woodMat)
  lampPost.position.set(w / 2 + 0.75, floorY + 1.15, d / 2 + 1.0)
  group.add(lampPost)
  const lampBox = box(0.36, 0.46, 0.36, new THREE.MeshStandardMaterial({
    color: '#ffdf9e',
    emissive: new THREE.Color('#ffb45e'),
    emissiveIntensity: 1.4,
    roughness: 0.5,
  }))
  lampBox.position.set(lampPost.position.x, floorY + 2.35, lampPost.position.z)
  group.add(lampBox)
  if (lamp) {
    const light = new THREE.PointLight(0xffb768, 7, 13, 2)
    light.position.copy(lampBox.position)
    group.add(light)
  }

  root.add(group)
  return { group, x, z, radius: 6.4 * scale, floorY, baseY }
}

function makeFence(root, rng, x1, z1, x2, z2) {
  const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6239', roughness: 1 })
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.hypot(dx, dz)
  const count = Math.max(2, Math.round(length / 1.6))
  const angle = Math.atan2(dx, dz)
  for (let i = 0; i <= count; i++) {
    const t = i / count
    const px = x1 + dx * t
    const pz = z1 + dz * t
    const h = heightAt(px, pz)
    const post = box(0.16, 0.95, 0.16, woodMat)
    post.position.set(px, h + 0.45, pz)
    post.rotation.y = rng() * 0.1
    post.castShadow = true
    root.add(post)
    if (i < count) {
      const nx = x1 + dx * (t + 0.5 / count)
      const nz = z1 + dz * (t + 0.5 / count)
      const nh = heightAt(nx, nz)
      for (const yOff of [0.32, 0.68]) {
        const rail = box(0.09, 0.1, length / count + 0.1, woodMat)
        rail.position.set(nx, nh + yOff, nz)
        rail.rotation.y = angle
        rail.castShadow = true
        root.add(rail)
      }
    }
  }
}

function makeBridge(root, rng) {
  const x = BRIDGE.x
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.95 })
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x6d4a2b, roughness: 1 })
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xcaa56f, roughness: 1 })

  const step = 0.58
  const zs = []
  for (let z = -BRIDGE.rampEnd + 0.3; z <= BRIDGE.rampEnd - 0.3; z += step) zs.push(z)
  const planks = new THREE.InstancedMesh(BOX, woodMat, zs.length)
  planks.castShadow = true
  planks.receiveShadow = true
  const dummy = new THREE.Object3D()
  zs.forEach((z, i) => {
    dummy.position.set(x + (rng() - 0.5) * 0.06, bridgeDeckAt(x, z) - 0.1, z)
    dummy.rotation.set(0, (rng() - 0.5) * 0.02, 0)
    dummy.scale.set(4.9, 0.2, step * 0.88)
    dummy.updateMatrix()
    planks.setMatrixAt(i, dummy.matrix)
  })
  planks.instanceMatrix.needsUpdate = true
  root.add(planks)

  // Support beams under the deck.
  for (const side of [-1, 1]) {
    for (let z = -18; z <= 18; z += 6) {
      const beam = box(0.3, 0.35, 6.2, darkWood)
      beam.position.set(x + side * 2.1, bridgeDeckAt(x, z) - 0.35, z)
      beam.castShadow = true
      root.add(beam)
    }
  }

  // Trestles down into the river.
  for (const z of [-15, -9, -3, 3, 9, 15]) {
    const deck = bridgeDeckAt(x, z)
    const ground = Math.min(heightAt(x, z), WATER_LEVEL) - 0.25
    const top = deck - 0.45
    const legHeight = Math.max(0.6, top - ground)
    for (const side of [-1, 1]) {
      const leg = box(0.3, legHeight, 0.3, darkWood)
      leg.position.set(x + side * 2.1, ground + legHeight / 2, z)
      leg.rotation.z = side * 0.1
      leg.castShadow = true
      root.add(leg)
    }
    const cross = box(4.5, 0.2, 0.22, darkWood)
    cross.position.set(x, WATER_LEVEL + 0.35, z)
    root.add(cross)
  }

  // Railings follow the deck profile.
  const postGeo = new THREE.BoxGeometry(0.12, 1.05, 0.12)
  const railGeo = new THREE.BoxGeometry(0.09, 1, 0.09)
  const postZ = []
  for (let z = -BRIDGE.rampEnd + 0.3; z <= BRIDGE.rampEnd - 0.3; z += 2.4) postZ.push(z)
  const posts = new THREE.InstancedMesh(postGeo, darkWood, postZ.length * 2)
  posts.castShadow = true
  let pi = 0
  for (const z of postZ) {
    for (const side of [-1, 1]) {
      dummy.position.set(x + side * 2.35, bridgeDeckAt(x, z) + 0.42, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      posts.setMatrixAt(pi++, dummy.matrix)
    }
  }
  posts.instanceMatrix.needsUpdate = true
  root.add(posts)

  const railSegments = []
  for (let i = 0; i < postZ.length - 1; i++) {
    for (const side of [-1, 1]) {
      for (const heightOff of [0.55, 0.92]) {
        const z0 = postZ[i]
        const z1 = postZ[i + 1]
        const a = new THREE.Vector3(x + side * 2.35, bridgeDeckAt(x, z0) + heightOff, z0)
        const b = new THREE.Vector3(x + side * 2.35, bridgeDeckAt(x, z1) + heightOff, z1)
        railSegments.push({ a, b })
      }
    }
  }
  const rails = new THREE.InstancedMesh(railGeo, ropeMat, railSegments.length)
  rails.castShadow = true
  const up = new THREE.Vector3(0, 1, 0)
  railSegments.forEach((seg, i) => {
    const dir = new THREE.Vector3().subVectors(seg.b, seg.a)
    const len = dir.length()
    dummy.position.copy(seg.a).add(seg.b).multiplyScalar(0.5)
    dummy.quaternion.setFromUnitVectors(up, dir.clone().normalize())
    dummy.scale.set(1, len, 1)
    dummy.updateMatrix()
    rails.setMatrixAt(i, dummy.matrix)
  })
  rails.instanceMatrix.needsUpdate = true
  root.add(rails)

  // Lantern posts at both ends.
  for (const side of [-1, 1]) {
    const z = side * (BRIDGE.rampEnd - 0.6)
    const px = x + 2.9
    const baseH = heightAt(px, z)
    const post = box(0.18, 2.8, 0.18, darkWood)
    post.position.set(px, baseH + 1.4, z)
    post.castShadow = true
    root.add(post)
    const lamp = box(0.42, 0.5, 0.42, new THREE.MeshStandardMaterial({
      color: '#ffdf9e',
      emissive: new THREE.Color('#ffae54'),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    }))
    lamp.position.set(px, baseH + 2.9, z)
    root.add(lamp)
    if (side === 1) {
      const light = new THREE.PointLight(0xffb36a, 9, 16, 2)
      light.position.copy(lamp.position)
      root.add(light)
    }
  }

  return { posts, rails }
}

function makeWindmill(root, x, z) {
  const group = new THREE.Group()
  const baseY = heightAt(x, z)
  group.position.set(x, baseY, z)

  const stone = new THREE.MeshStandardMaterial({ color: '#d9cdb2', roughness: 1 })
  const wood = new THREE.MeshStandardMaterial({ color: '#7d5634', roughness: 1 })
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f5ecd8', roughness: 0.9 })

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.9, 9, 8), stone)
  tower.position.y = 4.5
  shadowed(tower)
  group.add(tower)

  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.45, 0.5, 8), wood)
  band.position.y = 5.6
  group.add(band)

  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.5, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#8d4a38', roughness: 0.9 }))
  cap.position.y = 9.9
  shadowed(cap)
  group.add(cap)

  const door = box(1.2, 2.1, 0.2, wood)
  door.position.set(0, 1.05, 2.72)
  group.add(door)
  const win = box(0.8, 0.8, 0.15, new THREE.MeshStandardMaterial({ color: '#ffe4ae', emissive: new THREE.Color('#ffb45e'), emissiveIntensity: 0.8 }))
  win.position.set(0, 6.2, 2.15)
  group.add(win)

  const hub = new THREE.Group()
  hub.position.set(0, 8.9, 2.5)
  group.add(hub)
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 8), wood)
  axle.rotation.x = Math.PI / 2
  hub.add(axle)

  const bladeGroup = new THREE.Group()
  bladeGroup.position.z = 0.4
  hub.add(bladeGroup)
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group()
    arm.rotation.z = i * Math.PI / 2
    const spar = box(0.28, 6.4, 0.16, wood)
    spar.position.y = 3.2
    arm.add(spar)
    for (let k = 0; k < 4; k++) {
      const slat = box(1.2, 0.85, 0.06, sailMat)
      slat.position.set(0.72, 2.0 + k * 1.25, 0)
      arm.add(slat)
      const slat2 = box(1.2, 0.85, 0.06, sailMat)
      slat2.position.set(-0.72, 2.0 + k * 1.25, 0)
      arm.add(slat2)
    }
    arm.traverse(o => { if (o.isMesh) o.castShadow = true })
    bladeGroup.add(arm)
  }
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), wood)
  hub.add(hubCap)

  root.add(group)
  return { group, bladeGroup, x, z, radius: 4.8 }
}

function makeSign(root, x, z, rot) {
  const h = heightAt(x, z)
  const postMat = new THREE.MeshStandardMaterial({ color: '#6f4a2d', roughness: 1 })
  const post1 = box(0.18, 2.7, 0.18, postMat)
  post1.position.set(x - 1.4, h + 1.35, z)
  const post2 = box(0.18, 2.7, 0.18, postMat)
  post2.position.set(x + 1.4, h + 1.35, z)
  root.add(post1, post2)

  const c = document.createElement('canvas')
  c.width = 512
  c.height = 224
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#7d5230'
  ctx.fillRect(0, 0, 512, 224)
  ctx.fillStyle = '#8d5f38'
  for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 38, 512, 2)
  ctx.strokeStyle = '#e8d3a8'
  ctx.lineWidth = 8
  ctx.strokeRect(12, 12, 488, 200)
  ctx.fillStyle = '#fff4d6'
  ctx.font = 'bold 74px Trebuchet MS, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('LUSH VALLEY', 256, 102)
  ctx.font = 'bold 36px Trebuchet MS, sans-serif'
  ctx.fillStyle = '#ffe08a'
  ctx.fillText('BRIDGE  →', 256, 164)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.58), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }))
  board.position.set(x, h + 2.25, z + 0.02)
  board.rotation.y = rot
  board.castShadow = true
  root.add(board)
  const back = box(3.8, 1.7, 0.09, postMat)
  back.position.set(x, h + 2.25, z - 0.03)
  back.rotation.y = rot
  root.add(back)
}

function makeCampfire(root, x, z) {
  const h = heightAt(x, z)
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8f8b7d', roughness: 1 })
  const logMat = new THREE.MeshStandardMaterial({ color: '#5e3f24', roughness: 1 })
  const group = new THREE.Group()
  group.position.set(x, h, z)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), stoneMat)
    stone.position.set(Math.cos(a) * 1.25, 0.15, Math.sin(a) * 1.25)
    stone.scale.set(1.2, 0.7, 1)
    stone.rotation.set(a, a * 2, 0)
    stone.castShadow = true
    group.add(stone)
  }
  for (let i = 0; i < 3; i++) {
    const log = box(0.28, 0.28, 1.8, logMat)
    log.position.y = 0.2
    log.rotation.y = (i / 3) * Math.PI
    log.rotation.x = 0.18
    log.castShadow = true
    group.add(log)
  }
  const flameMat = new THREE.MeshStandardMaterial({
    color: '#ff9a3d',
    emissive: new THREE.Color('#ff7b1e'),
    emissiveIntensity: 2.2,
    roughness: 0.6,
    transparent: true,
    opacity: 0.92,
  })
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 6), flameMat)
  flame.position.y = 0.8
  group.add(flame)
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 5), new THREE.MeshStandardMaterial({
    color: '#ffe08a',
    emissive: new THREE.Color('#ffd166'),
    emissiveIntensity: 3,
  }))
  inner.position.y = 0.62
  group.add(inner)
  const light = new THREE.PointLight(0xff9a45, 10, 15, 2)
  light.position.set(0, 1.3, 0)
  group.add(light)
  root.add(group)
  return { group, flame, inner, light }
}

function makeCoinTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.translate(128, 128)

  ctx.fillStyle = '#c98a12'
  ctx.beginPath()
  ctx.arc(0, 0, 112, 0, Math.PI * 2)
  ctx.fill()

  const grad = ctx.createRadialGradient(-38, -44, 8, 0, 0, 112)
  grad.addColorStop(0, '#fff9d6')
  grad.addColorStop(0.32, '#ffdd6a')
  grad.addColorStop(0.72, '#f4b51f')
  grad.addColorStop(1, '#cf8c10')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, 100, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#b5750a'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(0, 0, 78, 0, Math.PI * 2)
  ctx.stroke()

  // Chunky star.
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 46 : 20
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = '#fff3b4'
  ctx.fill()
  ctx.strokeStyle = '#d99a1e'
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(-44, -48, 28, 14, -0.7, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function makeCoins(root) {
  const coinTex = makeCoinTexture()

  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = glowCanvas.height = 128
  const gctx = glowCanvas.getContext('2d')
  const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,220,120,0.85)')
  grad.addColorStop(0.45, 'rgba(255,190,70,0.25)')
  grad.addColorStop(1, 'rgba(255,180,50,0)')
  gctx.fillStyle = grad
  gctx.fillRect(0, 0, 128, 128)
  const glowTex = new THREE.CanvasTexture(glowCanvas)
  glowTex.colorSpace = THREE.SRGBColorSpace

  const placements = [
    [12, 37], [4, 28], [-6, 22],
    [-6, 10], [-6, -6], [-6, -18],
    [-14, -28], [8, -34], [30, -44],
    [60, -58], [66, -50], [-50, 58],
  ]

  const coins = placements.map(([x, z], index) => {
    const group = new THREE.Group()
    const deck = bridgeDeckAt(x, z)
    const ground = deck === null ? heightAt(x, z) : deck
    const baseY = ground + 1.55
    group.position.set(x, baseY, z)

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.3,
    }))
    glow.scale.setScalar(2.4)
    group.add(glow)

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coinTex,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.05,
    }))
    sprite.scale.set(1.4, 1.4, 1)
    group.add(sprite)

    group.userData = { index, baseY, collected: false }
    root.add(group)
    return { group, sprite, baseY, collected: false, phase: index * 1.37, x, z }
  })

  return coins
}

export function createProps(scene) {
  const rng = mulberry32(1337)
  const root = new THREE.Group()
  scene.add(root)

  makeSky(scene)
  makeClouds(scene, rng)

  const pathDefs = [
    { points: [[7, 62], [8, 52], [10, 40], [9, 34], [6, 29], [2, 26], [-3, 22], [-6, 20]], width: 1.35 },
    { points: [[8, 33], [14, 35], [19, 36], [21, 37]], width: 1.1 },
    { points: [[4, 29], [-6, 33], [-15, 36], [-23, 39]], width: 1.1 },
    { points: [[-6, -21], [-12, -26], [-22, -29], [-33, -31]], width: 1.05 },
    { points: [[-6, -21], [2, -28], [10, -33], [22, -38]], width: 1.05 },
  ]
  const pathSamples = []
  for (const def of pathDefs) {
    const curve = new THREE.CatmullRomCurve3(def.points.map(p => new THREE.Vector3(p[0], 0, p[1])))
    for (let i = 0; i <= 34; i++) pathSamples.push(curve.getPoint(i / 34))
  }

  const houses = []
  houses.push(makeHouse(root, rng, { x: 20, z: 36, rot: -0.6, wallColor: '#f2e2c0', roofColor: '#a8493a', lamp: true, scale: 0.9 }))
  houses.push(makeHouse(root, rng, { x: -27, z: 40, rot: 0.5, wallColor: '#d8e6ea', roofColor: '#7a5a44' }))
  houses.push(makeHouse(root, rng, { x: 52, z: -52, rot: 2.2, wallColor: '#f3d9b1', roofColor: '#8f4a3f', scale: 0.95, lamp: true }))

  const windmill = makeWindmill(root, -58, 54)
  const campfire = makeCampfire(root, 16, 28.5)

  const colliders = houses.map(h => ({ x: h.x, z: h.z, r: h.radius }))
  colliders.push({ x: windmill.x, z: windmill.z, r: 4.6 })
  colliders.push({ x: 16, z: 28.5, r: 1.9 })

  const blocked = (x, z, pad = 0) => {
    for (const c of colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true
    }
    for (const p of pathSamples) {
      if (Math.hypot(x - p.x, z - p.z) < 1.55 + pad * 0.55) return true
    }
    return false
  }

  const pathMat = new THREE.MeshStandardMaterial({
    map: makeDirtTexture(),
    color: '#ffffff',
    roughness: 1,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  for (const def of pathDefs) makePath(root, def.points, def.width, pathMat)

  makeFence(root, rng, 15, 43, 29, 43)
  makeFence(root, rng, 29, 43, 29, 31)
  makeFence(root, rng, 16, 31, 16, 36)

  makeSign(root, 13, 26, 0.12)

  makeTrees(root, rng, blocked)
  makePines(root, rng, blocked)
  makeBushes(root, rng, blocked)
  makeRocks(root, rng, blocked)
  makeGrass(root, rng, blocked)
  makeFlowers(root, rng, blocked)
  makeReeds(root, rng)
  makeBridge(root, rng)

  const coins = makeCoins(root)

  return {
    root,
    coins,
    colliders,
    bridgeDeckAt,
    update(time, dt) {
      windmill.bladeGroup.rotation.z = time * 0.45
      const flicker = 0.85 + Math.sin(time * 9.3) * 0.08 + Math.sin(time * 17.1) * 0.05
      campfire.light.intensity = 9 * flicker
      campfire.flame.scale.set(1, flicker, 1)
      campfire.inner.scale.set(1, 0.85 + flicker * 0.2, 1)
      campfire.flame.rotation.y = time * 0.7
      for (const coin of coins) {
        if (coin.collected) continue
        coin.group.position.y = coin.baseY + Math.sin(time * 1.8 + coin.phase) * 0.16
        const spin = Math.abs(Math.cos(time * 2.1 + coin.phase))
        coin.sprite.scale.x = 1.4 * Math.max(0.14, spin)
      }
    },
  }
}
