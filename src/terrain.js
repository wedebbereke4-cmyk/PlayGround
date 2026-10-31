import * as THREE from 'three'
import { CONFIG } from './config.js'

const W = CONFIG.world

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

export function noise2(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
}

function fbm(x, z) {
  let total = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < 4; i += 1) {
    total += noise2(x * frequency, z * frequency) * amplitude
    frequency *= 2.03
    amplitude *= 0.5
  }
  return total
}

export function lakeDepth(x, z) {
  const d = Math.hypot(x - W.lake.x, z - W.lake.z)
  if (d > W.lake.shore) return 0
  const t = 1 - smoothstep(W.lake.radius * 0.42, W.lake.shore, d)
  return -4.1 * Math.pow(Math.max(0, t), 1.3)
}

export function height(x, z) {
  const r = Math.hypot(x, z)
  let h = 1.0 * Math.sin(x * 0.045 + 0.5) * Math.cos(z * 0.05 - 0.8)
  h += 0.55 * Math.sin(x * 0.09 + 1.7) * Math.sin(z * 0.08 + 0.6)
  h += 0.9 * (fbm(x * 0.06, z * 0.06) - 0.5)
  h += Math.pow(smoothstep(68, 128, r), 1.5) * (20 + 11 * fbm(x * 0.017 + 3, z * 0.017 - 2))
  h += lakeDepth(x, z)
  return h
}

export function pathCurve() {
  const points = CONFIG.path.map(([x, z]) => new THREE.Vector3(x, 0, z))
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
}

const trail = pathCurve().getPoints(420)
export const pathSamples = trail.map(point => [point.x, point.z])

export function pathDistance(x, z) {
  let best = Infinity
  for (let i = 0; i < trail.length; i += 1) {
    const dx = x - trail[i].x
    const dz = z - trail[i].z
    const d = dx * dx + dz * dz
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

export function isUnderwater(x, z) {
  return height(x, z) < W.waterLevel + 0.05
}

export function terrainColor(x, z, h, target) {
  const variation = fbm(x * 0.11 + 12, z * 0.11 - 8)
  const grass = new THREE.Color().setHSL(0.24 + variation * 0.035, 0.42 + variation * 0.14, 0.36 + variation * 0.1)
  const dry = new THREE.Color(0x9cb85c)
  const sand = new THREE.Color(0xdec994)
  const rock = new THREE.Color(0x939088)
  const lakeDist = Math.hypot(x - W.lake.x, z - W.lake.z)

  let color = grass.clone().lerp(dry, smoothstep(0.52, 0.72, variation) * 0.7)

  if (lakeDist < W.lake.shore + 1.5 && h < 0.9) {
    color.lerp(sand, 1 - smoothstep(W.lake.shore * 0.62, W.lake.shore + 1.5, lakeDist))
  }
  if (h > 9) color.lerp(rock, smoothstep(9, 18, h) * 0.9)

  const grad = Math.abs(height(x + 1.4, z) - h) + Math.abs(height(x, z + 1.4) - h)
  if (grad > 1.1) color.lerp(rock, smoothstep(1.1, 2.4, grad) * 0.8)

  if (h < W.waterLevel - 0.15) color.lerp(new THREE.Color(0x5f7d58), 0.5)

  target.copy(color)
}

export function createTerrain(scene) {
  const size = W.size
  const segments = 150
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const y = height(x, z)
    position.setY(i, y)
    terrainColor(x, z, y, color)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    flatShading: false
  })
  const terrain = new THREE.Mesh(geometry, material)
  terrain.receiveShadow = true
  terrain.castShadow = false
  scene.add(terrain)

  const path = buildPathRibbon(trail)
  scene.add(path)

  return { terrain, path, trail }
}

function buildPathRibbon(points) {
  const width = 3.4
  const positions = []
  const colors = []
  const indices = []
  const centerColor = new THREE.Color(0xd2ab74)
  const edgeColor = new THREE.Color(0xb98c55)
  const rows = points.length

  for (let i = 0; i < rows; i += 1) {
    const point = points[i]
    const next = points[(i + 1) % rows]
    const prev = points[(i - 1 + rows) % rows]
    const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x)
    for (let c = -1; c <= 1; c += 1) {
      const x = point.x + side.x * width * 0.5 * c
      const z = point.z + side.z * width * 0.5 * c
      const y = height(x, z) + 0.22 + (c === 0 ? 0.012 : 0)
      positions.push(x, y, z)
      const mixed = centerColor.clone().lerp(edgeColor, Math.abs(c))
      const v = noise2(x * 0.7, z * 0.7)
      mixed.offsetHSL(0, 0, (v - 0.5) * 0.07)
      colors.push(mixed.r, mixed.g, mixed.b)
    }
  }
  for (let i = 0; i < rows; i += 1) {
    const current = i * 3
    const next = ((i + 1) % rows) * 3
    for (let c = 0; c < 2; c += 1) {
      indices.push(current + c, next + c, current + c + 1)
      indices.push(current + c + 1, next + c, next + c + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.renderOrder = 1
  return mesh
}

export function createMinimap() {
  const size = 512
  const sampleSize = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sampleSize
  sampleCanvas.height = sampleSize
  const sampleCtx = sampleCanvas.getContext('2d')
  const image = sampleCtx.createImageData(sampleSize, sampleSize)
  const color = new THREE.Color()
  const extent = W.radius + 12
  for (let py = 0; py < sampleSize; py += 1) {
    for (let px = 0; px < sampleSize; px += 1) {
      const x = (px / sampleSize - 0.5) * extent * 2
      const z = (py / sampleSize - 0.5) * extent * 2
      const h = height(x, z)
      if (h < W.waterLevel) {
        const depth = smoothstep(W.waterLevel, W.waterLevel - 3, h)
        color.setHSL(0.55, 0.5, 0.48 - depth * 0.16)
      } else {
        const variation = noise2(x * 0.08 + 12, z * 0.08 - 8)
        const rim = smoothstep(7, 16, h)
        color.setHSL(0.25 + variation * 0.03, 0.4, 0.38 + variation * 0.09)
        color.lerp(new THREE.Color(0x8f8a7c), rim * 0.65)
        const lakeDistance = Math.hypot(x - W.lake.x, z - W.lake.z)
        if (lakeDistance < W.lake.shore && h < 1.1) color.lerp(new THREE.Color(0xd8c18a), 0.55)
      }
      const i = (py * sampleSize + px) * 4
      image.data[i] = color.r * 255
      image.data[i + 1] = color.g * 255
      image.data[i + 2] = color.b * 255
      image.data[i + 3] = 255
    }
  }
  sampleCtx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(sampleCanvas, 0, 0, size, size)

  ctx.save()
  ctx.translate(size / 2, size / 2)
  const scale = size / (extent * 2)
  ctx.strokeStyle = 'rgba(196, 148, 88, 0.95)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  trail.forEach((point, index) => {
    const px = point.x * scale
    const pz = point.z * scale
    if (index === 0) ctx.moveTo(px, pz)
    else ctx.lineTo(px, pz)
  })
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  return canvas
}
