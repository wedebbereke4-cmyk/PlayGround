import * as THREE from 'three'

export const WATER_LEVEL = 0
export const WORLD_SIZE = 420
const SEGMENTS = 220

const clamp = THREE.MathUtils.clamp
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Height field for the valley: a river down the middle, gentle banks,
// rolling meadow, and steep wooded walls that close the horizon.
export function heightAt(x, z) {
  const az = Math.abs(z)
  const bed = -2.45 * Math.exp(-(z * z) / (2 * 8.5 * 8.5))
  const wallZ = 21 * Math.pow(smoothstep(9, 168, az), 1.85)
  const wallX = 27 * Math.pow(smoothstep(155, 209, Math.abs(x)), 1.45)

  let hills = 1.75 * Math.sin(x * 0.052) * Math.cos(z * 0.061)
    + 0.9 * Math.sin(x * 0.117 + 2.1) * Math.sin(z * 0.143 + 0.7)
    + 0.4 * Math.sin(x * 0.27 + 4.2) * Math.cos(z * 0.23)
  hills *= 0.22 + 0.78 * smoothstep(11, 45, az)

  const knoll = 7.5 * Math.exp(-(((x - 55) ** 2) + ((z + 58) ** 2)) / 1500)
  const knoll2 = 5.5 * Math.exp(-(((x + 62) ** 2) + ((z - 55) ** 2)) / 1200)

  let h = bed + wallZ + wallX + hills + knoll + knoll2

  // A soft meadow shelf where the player and the cottages live.
  const meadow = Math.exp(-(((x - 10) ** 2) + ((z - 34) ** 2)) / 760)
  h = THREE.MathUtils.lerp(h, 2.15 + 0.2 * Math.sin(x * 0.12) * Math.cos(z * 0.1), meadow * 0.88)
  return h
}

export function normalAt(x, z, eps = 0.7) {
  const hL = heightAt(x - eps, z)
  const hR = heightAt(x + eps, z)
  const hD = heightAt(x, z - eps)
  const hU = heightAt(x, z + eps)
  return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize()
}

export function slopeAt(x, z) {
  return 1 - normalAt(x, z).y
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

function makeGrassTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f2f5ea'
  ctx.fillRect(0, 0, size, size)

  const rand = mulberry32(7)
  // Soft mottling so large grass areas never look like flat paint.
  for (let i = 0; i < 320; i++) {
    const r = 16 + rand() * 56
    ctx.fillStyle = `rgba(${110 + rand() * 45},${140 + rand() * 50},${90 + rand() * 40},${0.09 + rand() * 0.11})`
    ctx.beginPath()
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // Fine blade speckles give the ground some bite up close.
  for (let i = 0; i < 5200; i++) {
    const x = rand() * size
    const y = rand() * size
    const len = 2 + rand() * 6
    const shade = 90 + Math.floor(rand() * 110)
    ctx.strokeStyle = `rgba(${shade},${shade + 24},${shade - 10},${0.2 + rand() * 0.2})`
    ctx.lineWidth = 0.7 + rand() * 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 2, y - len)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(46, 46)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function buildTerrain() {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS)
  geometry.rotateX(-Math.PI / 2)

  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, heightAt(x, z))
  }
  geometry.computeVertexNormals()

  const normals = geometry.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const grassA = new THREE.Color('#5aa43e')
  const grassB = new THREE.Color('#82c75a')
  const grassC = new THREE.Color('#3f8035')
  const sand = new THREE.Color('#e3cf94')
  const rock = new THREE.Color('#8f8b78')
  const deep = new THREE.Color('#5d7d52')
  const tmp = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const slope = clamp(1 - normals.getY(i), 0, 1)

    const patch = 0.5 + 0.5 * Math.sin(x * 0.043 + 1.2) * Math.sin(z * 0.037 + 0.4)
    const broad = 0.5 + 0.5 * Math.sin(x * 0.014 + 2.6) * Math.cos(z * 0.012 + 1.1)
    const fleck = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17 + 2.2)
    tmp.copy(grassA)
      .lerp(grassB, patch * 0.7 + broad * 0.3)
      .lerp(grassC, 0.42 * fleck)
      .lerp(grassB, smoothstep(0.55, 0.9, broad) * 0.35)
    const shade = smoothstep(0.55, 0.95, 0.5 + 0.5 * Math.sin(x * 0.021 + 4.1) * Math.cos(z * 0.017 + 2.3))
    tmp.lerp(grassC, shade * 0.32)

    if (slope > 0.22) tmp.lerp(rock, smoothstep(0.22, 0.62, slope))
    if (y < 1.1) tmp.lerp(sand, smoothstep(1.1, 0.15, y))
    if (y < -0.15) tmp.lerp(deep, smoothstep(-0.15, -1.6, y) * 0.8)

    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.name = 'terrain'
  return mesh
}

function buildWater() {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1)
  geometry.rotateX(-Math.PI / 2)

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.55, 0.62, 0.42).normalize() },
        uShallow: { value: new THREE.Color('#63c9ba') },
        uDeep: { value: new THREE.Color('#125d6d') },
        uSunColor: { value: new THREE.Color('#fff2c8') },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSunColor;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float w1 = sin(vWorld.x * 0.55 + uTime * 0.9);
        float w2 = sin(vWorld.z * 0.8 - uTime * 1.15 + vWorld.x * 0.18);
        float w3 = sin((vWorld.x + vWorld.z) * 1.7 + uTime * 1.9);
        vec3 n = normalize(vec3(
          0.075 * w1 + 0.035 * w3,
          1.0,
          0.065 * w2 + 0.035 * w3
        ));
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
        vec3 color = mix(uDeep, uShallow, clamp(fresnel * 0.95 + 0.14, 0.0, 1.0));
        vec3 halfDir = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(n, halfDir), 0.0), 120.0) * 1.6;
        float sparkle = pow(max(dot(n, halfDir), 0.0), 700.0) * 2.4;
        color += uSunColor * (spec + sparkle);
        float crest = smoothstep(0.8, 0.99, w1 * 0.5 + w2 * 0.5);
        color += vec3(0.16, 0.24, 0.21) * crest;
        float alpha = mix(0.74, 0.94, fresnel);
        gl_FragColor = vec4(color, alpha);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = WATER_LEVEL
  mesh.renderOrder = 1
  mesh.name = 'water'
  return mesh
}

export function createWorld(scene) {
  const terrain = buildTerrain()
  scene.add(terrain)

  const water = buildWater()
  scene.add(water)

  const foam = buildFoam()
  scene.add(foam)

  return {
    terrain,
    water,
    update(time) {
      water.material.uniforms.uTime.value = time
      foam.material.opacity = 0.26 + Math.sin(time * 0.9) * 0.06
    },
  }
}

function buildFoam() {
  const positions = []
  const y = 0.045
  const step = 1.4
  for (const side of [-1, 1]) {
    for (let x = -102; x <= 102; x += step) {
      if (heightAt(x, side * 30) > 0.08) continue
      let lo = 6
      let hi = 34
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2
        if (heightAt(x, side * mid) > 0.05) hi = mid
        else lo = mid
      }
      const zs = side * (lo + hi) / 2
      const z0 = zs - 0.55
      const z1 = zs + 0.55
      const x1 = x + step
      positions.push(
        x, y, z0, x1, y, z0, x, y, z1,
        x1, y, z0, x1, y, z1, x, y, z1,
      )
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.MeshBasicMaterial({
    color: 0xeafff5,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 2
  return mesh
}
