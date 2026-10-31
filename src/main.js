import * as THREE from 'three'
import { CONFIG } from './config.js'
import { createWorld } from './world.js'
import { createHorse } from './horse.js'
import { Player } from './player.js'
import { UI } from './ui.js'
import { AudioKit } from './audio.js'

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
const coarse = window.matchMedia('(pointer: coarse)').matches
renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.6 : 1.8))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.02

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 720)

const state = {
  mode: 'loading',
  coat: 0,
  mane: 0,
  name: 'Comet',
  apples: 0,
  total: CONFIG.totalApples,
  questDone: false,
  lucky: false,
  elapsed: 0,
  muted: false
}

let world
let horse
let player
let ui
const audio = new AudioKit()
const keys = { forward: false, back: false, left: false, right: false, gallop: false, jump: false }
const joystick = { x: 0, y: 0 }
let touchGallop = false
let touchJump = false
let touchJumpTimer = 0
let elapsed = 0
let lastFrame = performance.now()
let menuTime = 0
let introTime = 0
let pendingStart = false

document.getElementById('play-btn').addEventListener('click', () => {
  if (!ui) pendingStart = true
})

const effectAdapter = {
  burst(position, color, count, options) {
    world.spawnParticles(position, color, count, options)
  }
}

function sanitizedName(value) {
  const clean = value.replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 12)
  return clean || 'Comet'
}

async function boot() {
  try {
    await Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise(resolve => setTimeout(resolve, 1400))
    ])
  } catch {
    // Fonts are cosmetic; continue with system fallbacks.
  }

  world = createWorld(scene)
  horse = createHorse(CONFIG.coats[state.coat], CONFIG.manes[state.mane].color)
  scene.add(horse.group)
  player = new Player(horse, world)

  ui = new UI({
    coats: CONFIG.coats,
    manes: CONFIG.manes,
    handlers: {
      onPlay: startGame,
      onCoat: index => {
        state.coat = index
        horse.setCoat(CONFIG.coats[index])
        audio.click()
      },
      onMane: index => {
        state.mane = index
        horse.setMane(CONFIG.manes[index].color)
        audio.click()
      },
      onName: value => {
        state.name = sanitizedName(value)
        ui.setName(state.name)
      },
      onPause: togglePause,
      onResume: resumeGame,
      onRestart: restartRide,
      onQuit: quitToTitle,
      onSound: toggleSound,
      onDialogClose: closeDialog,
      onContinue: continueExploring,
      onJoystick: (x, y) => {
        joystick.x = x
        joystick.y = y
      },
      onGallop: value => {
        touchGallop = value
      },
      onJump: () => {
        touchJump = true
        touchJumpTimer = 0.12
      }
    }
  })

  ui.setName(state.name)
  ui.setCoat(state.coat, false)
  ui.setMane(state.mane, false)
  ui.updateApples(0, state.total)

  window.__horseValley = { THREE, scene, camera, renderer, world, player, horse, ui, state, audio }

  positionMenuCamera(true)
  state.mode = 'menu'
  lastFrame = performance.now()
  requestAnimationFrame(frame)
  ui.hideLoading()
  if (pendingStart) startGame()
}

function startGame() {
  if (state.mode !== 'menu') return
  state.mode = 'playing'
  state.elapsed = 0
  introTime = 0
  audio.init()
  audio.click()
  player.cameraYaw = player.yaw + Math.PI
  player.cameraPitch = 0.27
  player.cameraInitialized = false
  ui.showGame()
  ui.setName(state.name)
  ui.updateStamina(player.stamina)
  ui.toast('Giddy up! Find all 12 Golden Apples.', 'star')
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused'
    clearKeys()
    joystick.x = 0
    joystick.y = 0
    touchGallop = false
    audio.click()
    ui.hidePrompt()
    ui.showPause()
  } else if (state.mode === 'paused') {
    resumeGame()
  }
}

function resumeGame() {
  if (state.mode !== 'paused') return
  ui.hidePause()
  state.mode = 'playing'
  audio.click()
  player.cameraInitialized = false
}

function restartRide() {
  world.resetApples()
  state.apples = 0
  state.questDone = false
  state.lucky = false
  state.elapsed = 0
  horse.setLucky(false)
  player.reset()
  player.boost = 1
  ui.updateApples(0, state.total)
  ui.resetQuest()
  ui.hidePause()
  ui.hideComplete()
  ui.hideDialog()
  ui.hidePrompt()
  ui.updateStamina(player.stamina)
  clearKeys()
  joystick.x = 0
  joystick.y = 0
  touchGallop = false
  state.mode = 'playing'
  player.cameraInitialized = false
  audio.click()
  ui.toast('Fresh trail — 12 Golden Apples are waiting.', 'star')
}

function quitToTitle() {
  world.resetApples()
  state.apples = 0
  state.questDone = false
  state.lucky = false
  state.elapsed = 0
  horse.setLucky(false)
  player.reset()
  player.boost = 1
  ui.updateApples(0, state.total)
  ui.resetQuest()
  ui.hidePause()
  ui.hideComplete()
  ui.hideDialog()
  ui.hidePrompt()
  ui.updateStamina(player.stamina)
  ui.showTitle()
  clearKeys()
  joystick.x = 0
  joystick.y = 0
  touchGallop = false
  state.mode = 'menu'
  menuTime = 0
  positionMenuCamera(true)
  audio.click()
}

function toggleSound() {
  state.muted = !state.muted
  audio.setMuted(state.muted)
  ui.setMuted(state.muted)
  if (!state.muted) audio.click()
}

function clearKeys() {
  keys.forward = false
  keys.back = false
  keys.left = false
  keys.right = false
  keys.gallop = false
  keys.jump = false
}

function inputSnapshot() {
  let forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0) + joystick.y
  let strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joystick.x
  const length = Math.hypot(forward, strafe)
  if (length > 1) {
    forward /= length
    strafe /= length
  }
  return {
    forward,
    strafe,
    gallop: keys.gallop || touchGallop,
    jump: keys.jump || touchJump,
    onJump: () => audio.jump(),
    onLand: () => audio.land(),
    onHoof: (speed, water) => audio.hoof(speed, water)
  }
}

function nearestNpc() {
  return state.mode === 'playing' ? player.nearNpc() : null
}

function interact() {
  if (state.mode !== 'playing') return
  const npc = nearestNpc()
  if (!npc) return
  state.mode = 'dialog'
  audio.click()
  clearKeys()
  touchGallop = false
  joystick.x = 0
  joystick.y = 0
  ui.hidePrompt()

  let text = ''
  let button = 'Let\'s ride!'
  if (npc.key === 'june') {
    if (state.questDone) {
      text = `The whole valley is talking about your ride, ${state.name}! That golden coat of yours is shining brighter than my lantern. Keep the lucky horseshoe — you earned every step of it.`
      button = 'Thanks, June!'
    } else if (state.apples === 0) {
      text = 'Well howdy, rider! The autumn wind scattered my twelve Golden Apples all over the valley. I spotted a few by the paddock, beneath the old oak, near the lakeside dock, and out by the windmill. Bring them all back and my lucky horseshoe is yours!'
      button = 'On it!'
    } else {
      const left = world.apples.filter(apple => !apple.collected).map(apple => apple.label)
      const hints = [...new Set(left)].slice(0, 4).join(', ')
      text = `You've found ${state.apples} of my twelve Golden Apples — splendid work! The rest should be around ${hints}. Follow the dirt trail and keep an eye out for that golden glow.`
      button = 'Will do!'
    }
  } else {
    if (state.questDone) {
      text = `Twelve out of twelve! June hasn't stopped smiling. If you want one more view, climb the east ridge at golden hour — the whole valley turns to honey from up there.`
      button = 'Nice tip!'
    } else {
      text = `Welcome to the valley, ${state.name}. I've been charting the trail all morning. My advice? Check the orchard east of the barn, the north shore of the lake, and the high meadow on the east ridge. Oh — and the old oak usually hides one in its roots.`
      button = 'Thanks, Milo!'
    }
  }

  ui.openDialog({
    name: npc.name,
    role: npc.role,
    initial: npc.name.split(' ').pop().charAt(0),
    text,
    button
  })
}

function closeDialog() {
  if (state.mode !== 'dialog') return
  ui.hideDialog()
  state.mode = 'playing'
  player.cameraInitialized = false
  audio.click()
}

function continueExploring() {
  if (state.mode !== 'complete') return
  ui.hideComplete()
  state.mode = 'playing'
  player.cameraInitialized = false
  audio.click()
}

function checkApples() {
  const px = player.position.x
  const pz = player.position.z
  const py = player.position.y + 1.45
  for (const apple of world.apples) {
    if (apple.collected) continue
    const distance = Math.hypot(px - apple.group.position.x, pz - apple.group.position.z)
    const vertical = Math.abs(py - apple.group.position.y)
    if (distance < 2.45 && vertical < 2.8) {
      if (world.collectApple(apple, effectAdapter, audio)) {
        state.apples += 1
        ui.updateApples(state.apples, state.total)
        ui.toast(`${apple.label} · ${state.apples} / ${state.total}`)
        if (state.apples >= state.total) finishQuest()
      }
      break
    }
  }
}

function finishQuest() {
  state.questDone = true
  state.lucky = true
  state.elapsed = Math.max(state.elapsed, 1)
  horse.setLucky(true)
  player.boost = 1.12
  audio.quest()
  ui.completeQuest()
  ui.hidePrompt()
  ui.toast('Lucky Horseshoe equipped · +12% gallop', 'star')
  for (let i = 0; i < 4; i += 1) {
    world.spawnParticles(
      new THREE.Vector3(player.position.x, player.position.y + 1.6 + i * 0.35, player.position.z),
      [0xffd166, 0xf78fb3, 0x9fd8ff, 0xfff4d8][i],
      26,
      { spread: 3.6, up: 5.4, size: 12, life: 1.5, gravity: 3.6 }
    )
  }
  state.mode = 'complete'
  window.setTimeout(() => {
    if (state.mode === 'complete') ui.showComplete({ time: ui.formatTime(state.elapsed) })
  }, 950)
}

function positionMenuCamera(immediate = false) {
  const target = new THREE.Vector3(
    player.position.x,
    player.position.y + 1.55,
    player.position.z
  )
  const angle = 0.66
  const radius = 7.1
  const desired = new THREE.Vector3(
    target.x + Math.sin(angle) * radius,
    target.y + 2.55,
    target.z + Math.cos(angle) * radius
  )
  if (immediate) {
    camera.position.copy(desired)
    player.cameraTarget.copy(target)
    camera.lookAt(target)
  }
  return { target, desired, angle, radius }
}

function updateMenuCamera(dt) {
  menuTime += dt
  const target = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z)
  const angle = 0.72 + Math.sin(menuTime * 0.12) * 0.28
  const radius = 7.1 + Math.sin(menuTime * 0.19) * 0.22
  const desired = new THREE.Vector3(
    target.x + Math.sin(angle) * radius,
    target.y + 2.45,
    target.z + Math.cos(angle) * radius
  )
  const ground = world.getHeight(desired.x, desired.z)
  desired.y = Math.max(desired.y, ground + 1.5)
  camera.position.lerp(desired, 1 - Math.exp(-dt * 2.5))
  camera.lookAt(target)
  horse.animate(dt, { speed: 0, grounded: true })
}

function handleKey(event, down) {
  const code = event.code
  let used = true
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      keys.forward = down
      break
    case 'KeyS':
    case 'ArrowDown':
      keys.back = down
      break
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = down
      break
    case 'KeyD':
    case 'ArrowRight':
      keys.right = down
      break
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.gallop = down
      break
    case 'Space':
      keys.jump = down
      break
    case 'KeyE':
      if (down && !event.repeat) interact()
      used = false
      break
    case 'KeyM':
      if (down && !event.repeat) toggleSound()
      used = false
      break
    default:
      used = false
  }
  if (used) event.preventDefault()
}

window.addEventListener('keydown', event => handleKey(event, true))
window.addEventListener('keyup', event => handleKey(event, false))
window.addEventListener('blur', () => {
  clearKeys()
  touchGallop = false
  touchJump = false
})

let dragging = false
let lastPointerX = 0
let lastPointerY = 0

canvas.addEventListener('pointerdown', event => {
  if (state.mode !== 'playing') return
  dragging = true
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  canvas.setPointerCapture?.(event.pointerId)
  event.preventDefault()
})
canvas.addEventListener('pointermove', event => {
  if (!dragging || state.mode !== 'playing') return
  const dx = event.clientX - lastPointerX
  const dy = event.clientY - lastPointerY
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  player.cameraYaw -= dx * 0.006
  player.cameraPitch = THREE.MathUtils.clamp(player.cameraPitch + dy * 0.0045, 0.04, 1.15)
})
function endDrag() {
  dragging = false
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('wheel', event => {
  if (state.mode !== 'playing') return
  event.preventDefault()
  player.cameraDistance = THREE.MathUtils.clamp(player.cameraDistance + event.deltaY * 0.006, 4.6, 14)
}, { passive: false })

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.6 : 1.8))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') togglePause()
})

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
  lastFrame = now
  elapsed += dt

  if (touchJump) {
    touchJumpTimer -= dt
    if (touchJumpTimer <= 0) touchJump = false
  }
  if (touchJump && !keys.jump) {
    // The jump is consumed by the player's latch; clear it shortly after.
  }

  world.update(dt, elapsed)
  audio.update(dt)

  if (state.mode === 'menu') {
    updateMenuCamera(dt)
  } else if (state.mode === 'playing') {
    state.elapsed += dt
    player.update(dt, inputSnapshot())
    player.updateCamera(camera, dt)
    checkApples()
    const npc = player.nearNpc()
    if (npc) ui.showPrompt(`Talk to ${npc.name}`)
    else ui.hidePrompt()
    ui.updateStamina(player.stamina)
    ui.updateMinimap(player, world, now)
  } else {
    horse.animate(dt, { speed: 0, grounded: true })
  }

  if (state.mode === 'dialog' || state.mode === 'paused' || state.mode === 'complete') {
    ui.hidePrompt()
    ui.updateMinimap(player, world, now)
  }

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

try {
  await boot()
} catch (error) {
  console.error(error)
  const text = document.getElementById('loading-text')
  if (text) text.textContent = 'The valley could not load. Please refresh.'
}
