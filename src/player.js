import * as THREE from 'three'
import { heightAt, WATER_LEVEL } from './terrain.js'

const clamp = THREE.MathUtils.clamp

function makeFaceTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f3c53f'
  ctx.fillRect(0, 0, 256, 256)

  // Classic blocky smile.
  ctx.fillStyle = '#2b2117'
  ctx.beginPath()
  ctx.ellipse(88, 112, 13, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(168, 112, 13, 18, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#2b2117'
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(128, 150, 44, 0.18 * Math.PI, 0.82 * Math.PI)
  ctx.stroke()

  // Cheek blush.
  ctx.fillStyle = 'rgba(235,120,85,0.28)'
  ctx.beginPath()
  ctx.ellipse(58, 158, 18, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(198, 158, 18, 11, 0, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeNameTag(text) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.font = 'bold 62px Trebuchet MS, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 12
  ctx.strokeStyle = 'rgba(20,38,24,0.75)'
  ctx.strokeText(text, 256, 68)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 256, 68)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  }))
  sprite.scale.set(2.8, 0.7, 1)
  return sprite
}

function buildAvatar() {
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: '#f3c53f', roughness: 0.75 })
  const shirt = new THREE.MeshStandardMaterial({ color: '#35a85a', roughness: 0.8 })
  const shirtDark = new THREE.MeshStandardMaterial({ color: '#2a8a49', roughness: 0.85 })
  const pants = new THREE.MeshStandardMaterial({ color: '#3c4a78', roughness: 0.85 })
  const shoe = new THREE.MeshStandardMaterial({ color: '#34343f', roughness: 0.7 })
  const white = new THREE.MeshStandardMaterial({ color: '#f6f3e6', roughness: 0.7 })

  const boxMesh = (w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  // Torso.
  const torso = boxMesh(1.5, 1.55, 0.78, shirt)
  torso.position.y = 2.29
  group.add(torso)
  const belt = boxMesh(1.52, 0.18, 0.8, shirtDark)
  belt.position.y = 1.56
  group.add(belt)
  const badge = boxMesh(0.34, 0.34, 0.03, white)
  badge.position.set(0, 2.55, 0.4)
  group.add(badge)
  const badgeDot = boxMesh(0.14, 0.14, 0.02, shirt)
  badgeDot.position.set(0, 2.55, 0.42)
  group.add(badgeDot)

  // Head.
  const faceMat = new THREE.MeshStandardMaterial({ map: makeFaceTexture(), roughness: 0.72 })
  const headGeo = new THREE.BoxGeometry(1.08, 1.04, 1.04)
  const head = new THREE.Mesh(headGeo, [skin, skin, skin, skin, faceMat, skin])
  head.position.y = 3.58
  head.castShadow = true
  head.receiveShadow = true
  group.add(head)

  // Arms with shoulder pivots.
  const armL = new THREE.Group()
  armL.position.set(-0.97, 2.95, 0)
  const armLMesh = boxMesh(0.42, 1.5, 0.44, skin)
  armLMesh.position.y = -0.75
  armL.add(armLMesh)
  const sleeveL = boxMesh(0.46, 0.34, 0.48, shirtDark)
  sleeveL.position.y = -0.12
  armL.add(sleeveL)
  group.add(armL)

  const armR = armL.clone()
  armR.position.x = 0.97
  group.add(armR)

  // Legs with hip pivots.
  const legL = new THREE.Group()
  legL.position.set(-0.38, 1.5, 0)
  const legLMesh = boxMesh(0.52, 1.4, 0.56, pants)
  legLMesh.position.y = -0.72
  legL.add(legLMesh)
  const shoeL = boxMesh(0.56, 0.22, 0.68, shoe)
  shoeL.position.set(0, -1.42, 0.04)
  legL.add(shoeL)
  group.add(legL)

  const legR = legL.clone()
  legR.position.x = 0.38
  group.add(legR)

  const tag = makeNameTag('Explorer')
  tag.position.y = 4.75
  group.add(tag)

  group.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })

  return { group, armL, armR, legL, legR, head, torso, tag }
}

export class Player {
  constructor({ scene, camera, canvas, colliders, bridgeDeckAt }) {
    this.camera = camera
    this.canvas = canvas
    this.colliders = colliders
    this.bridgeDeckAt = bridgeDeckAt
    this.enabled = false

    this.spawn = new THREE.Vector3(8, heightAt(8, 45), 45)
    this.position = this.spawn.clone()
    this.velocity = new THREE.Vector3()
    this.grounded = true
    this.keys = new Set()
    this.touchMove = new THREE.Vector2()
    this.jumpQueued = false
    this.sprinting = false
    this.facing = Math.PI
    this.walkPhase = 0
    this.moving = false

    this.yaw = 0
    this.pitch = 0.05
    this.distance = 12.5
    this.cameraTarget = new THREE.Vector3()
    this.cameraInitialized = false

    const avatar = buildAvatar()
    this.avatar = avatar
    this.model = avatar.group
    this.model.position.copy(this.position)
    this.model.rotation.y = this.facing
    scene.add(this.model)

    this.onJump = null
    this.onStep = null
    this.stepTimer = 0

    this.raycaster = new THREE.Raycaster()
    this.bindEvents()
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      this.keys.add(e.code)
      if (e.code === 'Space' && this.enabled && !e.repeat) this.jumpQueued = true
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprinting = true
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprinting = false
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.sprinting = false
    })

    let dragId = null
    let lastX = 0
    let lastY = 0
    const canvas = this.canvas
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      dragId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      canvas.classList.add('dragging')
    })
    canvas.addEventListener('pointermove', (e) => {
      if (dragId !== e.pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      this.yaw -= dx * 0.0045
      this.pitch = clamp(this.pitch + dy * 0.0032, -0.12, 1.0)
    })
    const endDrag = (e) => {
      if (dragId !== e.pointerId) return
      dragId = null
      canvas.classList.remove('dragging')
      try { canvas.releasePointerCapture(e.pointerId) } catch {}
    }
    canvas.addEventListener('pointerup', endDrag)
    canvas.addEventListener('pointercancel', endDrag)
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return
      e.preventDefault()
      this.distance = clamp(this.distance + e.deltaY * 0.012, 4.5, 18)
    }, { passive: false })
  }

  setTouchMove(x, y) {
    this.touchMove.set(x, y)
  }

  requestJump() {
    if (this.enabled) this.jumpQueued = true
  }

  groundAt(x, z) {
    const terrain = heightAt(x, z)
    const deck = this.bridgeDeckAt(x, z)
    return deck === null ? terrain : Math.max(terrain, deck)
  }

  update(dt, time) {
    const keys = this.keys
    const started = this.enabled

    let forwardInput = 0
    let strafeInput = 0
    if (started) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) forwardInput += 1
      if (keys.has('KeyS') || keys.has('ArrowDown')) forwardInput -= 1
      if (keys.has('KeyD') || keys.has('ArrowRight')) strafeInput += 1
      if (keys.has('KeyA') || keys.has('ArrowLeft')) strafeInput -= 1
      forwardInput = clamp(forwardInput + this.touchMove.y, -1, 1)
      strafeInput = clamp(strafeInput + this.touchMove.x, -1, 1)
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(-forward.z, 0, forward.x)
    const wish = new THREE.Vector3()
      .addScaledVector(forward, forwardInput)
      .addScaledVector(right, strafeInput)
    if (wish.lengthSq() > 1) wish.normalize()

    const groundBefore = this.groundAt(this.position.x, this.position.z)
    const wading = groundBefore < WATER_LEVEL + 0.25
    const baseSpeed = this.sprinting ? 10.2 : 6.4
    const speed = baseSpeed * (wading ? 0.62 : 1)
    const desiredX = wish.x * speed
    const desiredZ = wish.z * speed
    const accel = this.grounded ? 13 : 3.6
    const blend = 1 - Math.exp(-accel * dt)
    this.velocity.x += (desiredX - this.velocity.x) * blend
    this.velocity.z += (desiredZ - this.velocity.z) * blend

    if (this.jumpQueued && this.grounded) {
      this.velocity.y = 12.2
      this.grounded = false
      this.onJump?.()
    }
    this.jumpQueued = false

    const nx = this.position.x + this.velocity.x * dt
    const nz = this.position.z + this.velocity.z * dt

    const passable = (x, z) => {
      if (Math.abs(x) > 100 || Math.abs(z) > 100) return false
      const deck = this.bridgeDeckAt(x, z)
      if (deck !== null) return true
      return heightAt(x, z) > WATER_LEVEL - 0.7
    }

    if (passable(nx, nz)) {
      this.position.x = nx
      this.position.z = nz
    } else if (passable(nx, this.position.z)) {
      this.position.x = nx
      this.velocity.z *= 0.2
    } else if (passable(this.position.x, nz)) {
      this.position.z = nz
      this.velocity.x *= 0.2
    } else {
      this.velocity.x *= 0.1
      this.velocity.z *= 0.1
    }

    for (const collider of this.colliders) {
      const dx = this.position.x - collider.x
      const dz = this.position.z - collider.z
      const dist = Math.hypot(dx, dz)
      if (dist < collider.r && dist > 0.0001) {
        const push = collider.r - dist
        this.position.x += (dx / dist) * push
        this.position.z += (dz / dist) * push
      }
    }

    const ground = this.groundAt(this.position.x, this.position.z)
    this.velocity.y -= 34 * dt
    this.position.y += this.velocity.y * dt
    if (this.position.y <= ground) {
      this.position.y = ground
      this.velocity.y = 0
      this.grounded = true
    } else {
      this.grounded = false
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    this.moving = horizontalSpeed > 0.6
    if (this.moving) {
      const targetFacing = Math.atan2(this.velocity.x, this.velocity.z)
      let diff = targetFacing - this.facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.facing += diff * (1 - Math.exp(-14 * dt))
      this.walkPhase += dt * (6 + horizontalSpeed * 0.55)
      this.stepTimer -= dt
      if (this.grounded && this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 0.26 : 0.4
        this.onStep?.()
      }
    } else {
      this.walkPhase += dt * 1.2
      this.stepTimer = 0
    }

    const { armL, armR, legL, legR, head, tag } = this.avatar
    if (!this.grounded) {
      armL.rotation.x = -0.9
      armR.rotation.x = -0.9
      legL.rotation.x = 0.35
      legR.rotation.x = -0.25
    } else if (this.moving) {
      const swing = Math.sin(this.walkPhase) * clamp(horizontalSpeed / 7, 0.4, 1.25)
      legL.rotation.x = swing * 0.75
      legR.rotation.x = -swing * 0.75
      armL.rotation.x = -swing * 0.65
      armR.rotation.x = swing * 0.65
    } else {
      const idle = Math.sin(time * 1.6) * 0.05
      legL.rotation.x += (0 - legL.rotation.x) * 0.12
      legR.rotation.x += (0 - legR.rotation.x) * 0.12
      armL.rotation.x += (idle - armL.rotation.x) * 0.1
      armR.rotation.x += (-idle - armR.rotation.x) * 0.1
    }
    if (head) head.rotation.z = Math.sin(time * 1.1) * 0.015
    if (tag) tag.position.y = 4.75 + Math.sin(time * 2.2) * 0.03

    this.model.position.copy(this.position)
    this.model.rotation.y = this.facing

    // Camera: slow cinematic orbit before play, free orbit after.
    if (!started) {
      this.yaw += dt * 0.055
      this.pitch = 0.05
    }
    const target = new THREE.Vector3(
      this.position.x,
      this.position.y + 2.65,
      this.position.z,
    )
    const firstFrame = !this.cameraInitialized
    if (firstFrame) {
      this.cameraTarget.copy(target)
      this.cameraInitialized = true
    } else {
      this.cameraTarget.lerp(target, 1 - Math.exp(-12 * dt))
    }

    const cosPitch = Math.cos(this.pitch)
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ).multiplyScalar(this.distance)

    const desired = this.cameraTarget.clone().add(offset)
    const minY = heightAt(desired.x, desired.z) + 1.15
    if (desired.y < minY) desired.y = minY
    if (firstFrame) this.camera.position.copy(desired)
    else this.camera.position.lerp(desired, 1 - Math.exp(-9 * dt))
    this.camera.lookAt(this.cameraTarget)
  }
}
