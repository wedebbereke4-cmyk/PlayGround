import * as THREE from 'three'
import './styles.css'
import { createWorld, heightAt } from './terrain.js'
import { createProps } from './props.js'
import { Player } from './player.js'
import { AudioKit } from './audio.js'

const canvas = document.getElementById('game')
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0xdfe6cd, 0.0042)

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1400)

const sunDir = new THREE.Vector3(-0.38, 0.56, -0.58).normalize()
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4b7a3c, 1.4)
scene.add(hemi)

const sun = new THREE.DirectionalLight(0xffe2b0, 2.9)
sun.position.copy(sunDir).multiplyScalar(120)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -85
sun.shadow.camera.right = 85
sun.shadow.camera.top = 85
sun.shadow.camera.bottom = -85
sun.shadow.camera.near = 1
sun.shadow.camera.far = 320
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.045
scene.add(sun)
scene.add(sun.target)

// Cool fill from the camera side keeps shadowed faces from going muddy.
const fill = new THREE.DirectionalLight(0xbfdcff, 0.7)
fill.position.set(45, 35, 95)
scene.add(fill)

const world = createWorld(scene)
const props = createProps(scene)
props.colliders.push({ x: 16, z: 30, r: 1.9 })

const player = new Player({
  scene,
  camera,
  canvas,
  colliders: props.colliders,
  bridgeDeckAt: props.bridgeDeckAt,
})

const audio = new AudioKit()
player.onJump = () => audio.jump()
player.onStep = () => audio.step()

// ---------------------------------------------------------------- particles

function createSparkles() {
  const max = 420
  const positions = new Float32Array(max * 3)
  const colors = new Float32Array(max * 3)
  const velocities = new Float32Array(max * 3)
  const life = new Float32Array(max)
  const maxLife = new Float32Array(max)
  const baseColor = new Float32Array(max * 3)
  for (let i = 0; i < max; i++) positions[i * 3 + 1] = -999

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({
    size: 0.26,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  let cursor = 0
  const gold = [new THREE.Color('#ffe9a8'), new THREE.Color('#ffc94a'), new THREE.Color('#fff6d8')]

  function spawn(position, amount = 26, spread = 1, upward = 4.5) {
    for (let n = 0; n < amount; n++) {
      const i = cursor % max
      cursor++
      positions[i * 3] = position.x + (Math.random() - 0.5) * spread
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * spread
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * spread
      const theta = Math.random() * Math.PI * 2
      const speed = 1.2 + Math.random() * 3.6
      velocities[i * 3] = Math.cos(theta) * speed
      velocities[i * 3 + 1] = 1 + Math.random() * upward
      velocities[i * 3 + 2] = Math.sin(theta) * speed
      const c = gold[Math.floor(Math.random() * gold.length)]
      baseColor[i * 3] = c.r
      baseColor[i * 3 + 1] = c.g
      baseColor[i * 3 + 2] = c.b
      maxLife[i] = 0.7 + Math.random() * 0.8
      life[i] = maxLife[i]
    }
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue
      life[i] -= dt
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -999
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0
        continue
      }
      velocities[i * 3 + 1] -= 8.5 * dt
      positions[i * 3] += velocities[i * 3] * dt
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
      const fade = Math.min(1, life[i] / (maxLife[i] * 0.6))
      colors[i * 3] = baseColor[i * 3] * fade
      colors[i * 3 + 1] = baseColor[i * 3 + 1] * fade
      colors[i * 3 + 2] = baseColor[i * 3 + 2] * fade
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  return { spawn, update }
}

function createPollen() {
  const count = 140
  const positions = new Float32Array(count * 3)
  const seeds = []
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 110 + 4
    const z = (Math.random() - 0.5) * 100 + 12
    const ground = heightAt(x, z)
    const y = ground + 0.8 + Math.random() * 4.5
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    seeds.push({
      x, y, z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.55,
      radius: 0.5 + Math.random() * 1.8,
    })
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    size: 0.16,
    color: 0xfff1ac,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  return {
    update(time) {
      const pos = geometry.attributes.position
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i]
        const t = time * s.speed + s.phase
        pos.setXYZ(
          i,
          s.x + Math.sin(t) * s.radius,
          s.y + Math.sin(t * 1.7) * 0.55,
          s.z + Math.cos(t * 0.8) * s.radius,
        )
      }
      pos.needsUpdate = true
    },
  }
}

const sparkles = createSparkles()
const pollen = createPollen()

// ---------------------------------------------------------------------- UI

const title = document.getElementById('title')
const playButton = document.getElementById('play')
const hud = document.getElementById('hud')
const coinCountEl = document.getElementById('coinCount')
const coinTotalEl = document.getElementById('coinTotal')
const toast = document.getElementById('toast')
const complete = document.getElementById('complete')
const soundButton = document.getElementById('sound')
const hint = document.getElementById('hint')
const touchUi = document.getElementById('touch')

const totalCoins = props.coins.length
coinTotalEl.textContent = String(totalCoins)
let collected = 0
let running = false
let toastTimer = 0

const messages = ['Shiny!', 'Ka-ching!', 'Found one!', 'Nice find!', 'Cha-ching!']

function showToast(text) {
  toast.textContent = text
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600)
}

function refreshHud() {
  coinCountEl.textContent = String(collected)
  coinCountEl.classList.remove('pop')
  void coinCountEl.offsetWidth
  coinCountEl.classList.add('pop')
}

function collectCoin(coin) {
  if (coin.collected) return
  coin.collected = true
  coin.group.visible = false
  collected++
  refreshHud()
  audio.coin(collected)
  sparkles.spawn(coin.group.position, 30, 1.1, 5)
  showToast(`${messages[collected % messages.length]}  ${collected}/${totalCoins}`)

  if (collected === totalCoins) {
    setTimeout(() => {
      complete.classList.add('show')
      audio.complete()
      sparkles.spawn(new THREE.Vector3(player.position.x, player.position.y + 4, player.position.z), 80, 3.4, 7)
    }, 450)
  }
}

function startGame() {
  if (running) return
  running = true
  player.enabled = true
  title.classList.add('hidden')
  hud.classList.add('visible')
  audio.start()
  setTimeout(() => hint.classList.add('dim'), 12000)
  document.body.classList.add('playing')
}

playButton.addEventListener('click', startGame)
window.addEventListener('keydown', (e) => {
  if (!running && (e.code === 'Enter' || e.code === 'Space')) startGame()
})

document.getElementById('resume').addEventListener('click', () => {
  complete.classList.remove('show')
})

let muted = false
soundButton.addEventListener('click', () => {
  muted = !muted
  audio.setMuted(muted)
  soundButton.textContent = muted ? '🔇' : '🔊'
  soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
  soundButton.classList.toggle('off', muted)
})

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
if (isTouch) {
  document.body.classList.add('touch')
  hint.innerHTML = '<b>Drag</b> to look · <b>Stick</b> to move · <b>Jump</b> to hop'
}

// Touch joystick.
const stick = document.getElementById('stick')
const knob = document.getElementById('knob')
const jumpButton = document.getElementById('jump')
let stickId = null
let stickCenter = { x: 0, y: 0 }

function updateStick(e) {
  const dx = e.clientX - stickCenter.x
  const dy = e.clientY - stickCenter.y
  const max = 46
  const dist = Math.hypot(dx, dy)
  const clamped = Math.min(dist, max)
  const angle = Math.atan2(dy, dx)
  const kx = Math.cos(angle) * clamped
  const ky = Math.sin(angle) * clamped
  knob.style.transform = `translate(${kx}px, ${ky}px)`
  player.setTouchMove(
    (kx / max),
    (-ky / max),
  )
}

stick.addEventListener('pointerdown', (e) => {
  if (!running) return
  e.preventDefault()
  stickId = e.pointerId
  const rect = stick.getBoundingClientRect()
  stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  stick.setPointerCapture(e.pointerId)
  stick.classList.add('active')
  updateStick(e)
})
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return
  e.preventDefault()
  updateStick(e)
})
const releaseStick = (e) => {
  if (e.pointerId !== stickId) return
  stickId = null
  knob.style.transform = 'translate(0,0)'
  player.setTouchMove(0, 0)
  stick.classList.remove('active')
}
stick.addEventListener('pointerup', releaseStick)
stick.addEventListener('pointercancel', releaseStick)

jumpButton.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  player.requestJump()
})

// ---------------------------------------------------------------- main loop

const clock = new THREE.Clock()
let elapsed = 0

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05)
  elapsed += dt

  player.update(dt, elapsed)
  world.update(elapsed)
  props.update(elapsed, dt)
  sparkles.update(dt)
  pollen.update(elapsed)

  if (running) {
    for (const coin of props.coins) {
      if (coin.collected) continue
      const dx = player.position.x - coin.x
      const dz = player.position.z - coin.z
      const dy = (player.position.y + 2.1) - coin.group.position.y
      if (Math.abs(dx) < 2.1 && Math.abs(dz) < 2.1 && Math.abs(dy) < 2.9) {
        collectCoin(coin)
      }
    }
  }

  // Keep the shadow frustum around the player so distant hills stay cheap.
  sun.position.set(player.position.x + sunDir.x * 110, sunDir.y * 110, player.position.z + sunDir.z * 110)
  sun.target.position.set(player.position.x, 0, player.position.z)
  sun.target.updateMatrixWorld()

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.compile(scene, camera)
requestAnimationFrame(animate)

// Small debug hook so the playground can be scripted and inspected.
window.__valley = { player, props, world, scene, camera, collectCoin }
