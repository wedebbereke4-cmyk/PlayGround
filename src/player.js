import * as THREE from 'three'
import { height } from './terrain.js'
import { clamp } from './terrain.js'

const WALK_SPEED = 5.6
const GALLOP_SPEED = 10.4
const GRAVITY = 19

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function angleLerp(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

export class Player {
  constructor(horse, world) {
    this.horse = horse
    this.world = world
    this.position = new THREE.Vector3(world.spawn.x, 0, world.spawn.z)
    this.position.y = world.getHeight(this.position.x, this.position.z)
    this.yaw = world.spawn.yaw
    this.speed = 0
    this.velocityY = 0
    this.grounded = true
    this.stamina = 100
    this.maxStamina = 100
    this.staminaDelay = 0
    this.boost = 1
    this.cameraYaw = this.yaw + Math.PI
    this.cameraPitch = 0.28
    this.cameraDistance = 8.4
    this.cameraTarget = new THREE.Vector3()
    this.moveDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    this.footTimer = 0
    this.splashTimer = 0
    this.inWater = false
    this.jumpLatch = false
    this.cameraInitialized = false
    this.turnTilt = 0
    this.horse.group.position.copy(this.position)
    this.horse.group.rotation.y = this.yaw
    this.cameraTarget.set(this.position.x, this.position.y + 1.9, this.position.z)
  }

  reset() {
    this.position.set(this.world.spawn.x, 0, this.world.spawn.z)
    this.position.y = this.world.getHeight(this.position.x, this.position.z)
    this.yaw = this.world.spawn.yaw
    this.speed = 0
    this.velocityY = 0
    this.grounded = true
    this.stamina = 100
    this.boost = 1
    this.moveDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    this.cameraYaw = this.yaw + Math.PI
    this.cameraPitch = 0.28
    this.cameraDistance = 8.4
    this.horse.group.position.copy(this.position)
    this.horse.group.rotation.y = this.yaw
    this.horse.group.rotation.z = 0
    this.cameraInitialized = false
    this.cameraTarget.set(this.position.x, this.position.y + 1.9, this.position.z)
  }

  nearNpc() {
    let closest = null
    let closestDistance = 4.2
    for (const npc of this.world.npcs) {
      const d = Math.hypot(this.position.x - npc.x, this.position.z - npc.z)
      if (d < closestDistance) {
        closest = npc
        closestDistance = d
      }
    }
    return closest
  }

  update(dt, input) {
    const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw))
    const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw))
    const move = new THREE.Vector3()
    move.addScaledVector(forward, input.forward)
    move.addScaledVector(right, input.strafe)
    const magnitude = Math.min(1, move.length())
    if (magnitude > 0.02) {
      move.normalize()
      this.moveDir.copy(move)
    }

    const wantsGallop = input.gallop && this.stamina > 1 && magnitude > 0.05
    const baseTarget = (wantsGallop ? GALLOP_SPEED : WALK_SPEED) * this.boost * magnitude
    const waterDamp = this.inWater ? 0.55 : 1
    const targetSpeed = baseTarget * waterDamp
    const acceleration = targetSpeed > this.speed ? 7.5 : 9.5
    this.speed = damp(this.speed, targetSpeed, acceleration, dt)

    if (wantsGallop && this.grounded) {
      this.stamina = Math.max(0, this.stamina - 19 * dt)
      this.staminaDelay = 0.6
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt)
      if (this.staminaDelay === 0) this.stamina = Math.min(this.maxStamina, this.stamina + 15 * dt)
    }

    if (magnitude > 0.05) {
      const desiredYaw = Math.atan2(this.moveDir.x, this.moveDir.z)
      const previous = this.yaw
      this.yaw = angleLerp(this.yaw, desiredYaw, 11, dt)
      let delta = this.yaw - previous
      delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
      this.turnTilt = damp(this.turnTilt, clamp(-delta * 5, -0.16, 0.16), 8, dt)
    } else {
      this.turnTilt = damp(this.turnTilt, 0, 6, dt)
    }

    this.position.x += this.moveDir.x * this.speed * dt
    this.position.z += this.moveDir.z * this.speed * dt

    for (const collider of this.world.colliders) {
      const dx = this.position.x - collider.x
      const dz = this.position.z - collider.z
      const distance = Math.hypot(dx, dz)
      const minimum = collider.r + 0.75
      if (distance < minimum && distance > 0.0001) {
        const push = (minimum - distance) / distance
        this.position.x += dx * push
        this.position.z += dz * push
      }
    }

    const radius = Math.hypot(this.position.x, this.position.z)
    if (radius > 108) {
      this.position.x *= 108 / radius
      this.position.z *= 108 / radius
    }

    const ground = this.world.getHeight(this.position.x, this.position.z)
    const lakeDistance = Math.hypot(this.position.x - (-46), this.position.z - 44)
    this.inWater = ground < this.world.waterLevel - 0.12 && lakeDistance < 26
    const floor = this.inWater ? Math.max(ground, this.world.waterLevel - 0.42) : ground

    if (input.jump && !this.jumpLatch && this.grounded && !this.inWater) {
      this.velocityY = 6.6
      this.grounded = false
      this.jumpLatch = true
      if (input.onJump) input.onJump()
    }
    this.jumpLatch = input.jump

    if (!this.grounded) {
      this.velocityY -= GRAVITY * dt
      this.position.y += this.velocityY * dt
      if (this.position.y <= floor) {
        this.position.y = floor
        if (this.velocityY < -5 && input.onLand) input.onLand()
        this.velocityY = 0
        this.grounded = true
      }
    } else {
      this.position.y = damp(this.position.y, floor, 18, dt)
    }

    this.horse.group.position.copy(this.position)
    this.horse.group.rotation.y = this.yaw
    this.horse.group.rotation.z = damp(this.horse.group.rotation.z, this.turnTilt, 8, dt)

    this.horse.animate(dt, { speed: this.speed, grounded: this.grounded })

    if (this.speed > 0.5 && this.grounded) {
      this.footTimer -= dt
      if (this.footTimer <= 0) {
        this.footTimer = this.speed > 7 ? 0.17 : 0.32
        if (input.onHoof) input.onHoof(this.speed, this.inWater)
        if (!this.inWater) {
          const backX = this.position.x - Math.sin(this.yaw) * 0.5
          const backZ = this.position.z - Math.cos(this.yaw) * 0.5
          this.world.spawnParticles(
            new THREE.Vector3(backX, ground + 0.08, backZ),
            this.speed > 7 ? 0xcdb98f : 0xbfae85,
            this.speed > 7 ? 4 : 2,
            { spread: 0.35, up: 0.8, size: 8, life: 0.45, gravity: 1.8 }
          )
        } else {
          this.world.spawnParticles(
            new THREE.Vector3(this.position.x, this.world.waterLevel + 0.1, this.position.z),
            0xd7f2f4,
            this.speed > 7 ? 6 : 3,
            { spread: 0.8, up: 1.6, size: 7, life: 0.55, gravity: 6 }
          )
        }
      }
    } else {
      this.footTimer = 0
    }
  }

  updateCamera(camera, dt) {
    const target = new THREE.Vector3(
      this.position.x + this.moveDir.x * 0.35,
      this.position.y + 1.95,
      this.position.z + this.moveDir.z * 0.35
    )
    if (!this.cameraInitialized) {
      this.cameraTarget.copy(target)
      this.cameraInitialized = true
    } else {
      this.cameraTarget.lerp(target, 1 - Math.exp(-dt * 10))
    }

    const cosPitch = Math.cos(this.cameraPitch)
    const offset = new THREE.Vector3(
      Math.sin(this.cameraYaw) * cosPitch,
      Math.sin(this.cameraPitch),
      Math.cos(this.cameraYaw) * cosPitch
    ).multiplyScalar(this.cameraDistance)
    const desired = this.cameraTarget.clone().add(offset)
    const terrainAtCamera = this.world.getHeight(desired.x, desired.z)
    desired.y = Math.max(desired.y, terrainAtCamera + 1.15)

    // Pull the camera in when a ridge would block the view.
    const steps = 7
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      const sampleX = THREE.MathUtils.lerp(this.cameraTarget.x, desired.x, t)
      const sampleZ = THREE.MathUtils.lerp(this.cameraTarget.z, desired.z, t)
      const sampleY = THREE.MathUtils.lerp(this.cameraTarget.y, desired.y, t)
      const ground = this.world.getHeight(sampleX, sampleZ)
      if (sampleY < ground + 0.7) {
        const safeT = Math.max(0.18, t - 0.12)
        desired.x = THREE.MathUtils.lerp(this.cameraTarget.x, desired.x, safeT)
        desired.y = THREE.MathUtils.lerp(this.cameraTarget.y, desired.y, safeT)
        desired.z = THREE.MathUtils.lerp(this.cameraTarget.z, desired.z, safeT)
        break
      }
    }

    camera.position.lerp(desired, 1 - Math.exp(-dt * 7.5))
    camera.lookAt(this.cameraTarget)
    camera.rotation.z += this.turnTilt * 0.08
  }
}
