import * as THREE from 'three'

const HOOF = 0x4a3728
const SADDLE = 0x8a562b
const BLANKET = 0xc9533f
const EYE = 0x1d1a18

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function standard(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
}

export function createHorse(coat, mane) {
  const root = new THREE.Group()
  const bodyGroup = new THREE.Group()
  root.add(bodyGroup)

  const coatMat = standard(coat.body, 0.78)
  const shadeMat = standard(coat.shade, 0.82)
  const maneMat = standard(mane, 0.92)
  const hoofMat = standard(HOOF, 0.7)
  const muzzleMat = standard(new THREE.Color(coat.shade).multiplyScalar(0.8), 0.85)
  const eyeMat = standard(EYE, 0.35)
  const saddleMat = standard(SADDLE, 0.72)
  const blanketMat = standard(BLANKET, 0.88)
  const starMat = standard(0xfaf3df, 0.9)

  const body = box(0.9, 0.86, 1.92, coatMat, 0, 1.62, 0)
  bodyGroup.add(body)
  bodyGroup.add(box(0.94, 0.76, 0.62, shadeMat, 0, 1.55, 0.62))
  bodyGroup.add(box(0.96, 0.82, 0.74, coatMat, 0, 1.68, -0.66))

  // Neck + head -------------------------------------------------------------
  const neckGroup = new THREE.Group()
  neckGroup.position.set(0, 1.86, 0.64)
  neckGroup.rotation.x = 0.62
  bodyGroup.add(neckGroup)
  neckGroup.add(box(0.5, 0.92, 0.56, coatMat, 0, 0.46, 0))
  neckGroup.add(box(0.56, 0.5, 0.62, coatMat, 0, 0.12, 0.02))

  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.88, 0.08)
  headGroup.rotation.x = -0.42
  neckGroup.add(headGroup)
  headGroup.add(box(0.5, 0.48, 0.9, coatMat, 0, 0.06, 0.28))
  headGroup.add(box(0.42, 0.34, 0.32, muzzleMat, 0, -0.04, 0.78))
  headGroup.add(box(0.44, 0.1, 0.12, shadeMat, 0, -0.18, 0.9))
  headGroup.add(box(0.07, 0.08, 0.06, eyeMat, 0.255, 0.12, 0.44))
  headGroup.add(box(0.07, 0.08, 0.06, eyeMat, -0.255, 0.12, 0.44))
  headGroup.add(box(0.3, 0.18, 0.05, starMat, 0, 0.27, 0.67))

  const earL = box(0.14, 0.32, 0.13, coatMat, 0.17, 0.42, -0.02)
  earL.rotation.z = 0.16
  const earR = box(0.14, 0.32, 0.13, coatMat, -0.17, 0.42, -0.02)
  earR.rotation.z = -0.16
  headGroup.add(earL, earR)
  headGroup.add(box(0.11, 0.2, 0.11, shadeMat, 0, 0.37, 0.1))

  // Mane and forelock -------------------------------------------------------
  const maneParts = []
  for (let i = 0; i < 4; i += 1) {
    const piece = box(0.18, 0.3 - i * 0.02, 0.26, maneMat, 0, 0.16 + i * 0.21, -0.32)
    piece.rotation.x = -0.12
    neckGroup.add(piece)
    maneParts.push(piece)
  }
  const forelock = box(0.26, 0.22, 0.2, maneMat, 0, 0.34, 0.17)
  forelock.rotation.x = 0.2
  headGroup.add(forelock)

  // Tail --------------------------------------------------------------------
  const tailGroup = new THREE.Group()
  tailGroup.position.set(0, 1.98, -0.98)
  tailGroup.rotation.x = 0.55
  bodyGroup.add(tailGroup)
  const tailParts = []
  for (let i = 0; i < 4; i += 1) {
    const piece = box(0.2 - i * 0.025, 0.44, 0.22 - i * 0.02, maneMat, 0, -0.18 - i * 0.32, 0)
    piece.rotation.x = -0.16 - i * 0.04
    tailGroup.add(piece)
    tailParts.push(piece)
  }

  // Saddle ------------------------------------------------------------------
  const saddleGroup = new THREE.Group()
  saddleGroup.position.set(0, 2.08, -0.12)
  bodyGroup.add(saddleGroup)
  saddleGroup.add(box(1.16, 0.09, 1.08, blanketMat, 0, 0.02, 0))
  saddleGroup.add(box(0.92, 0.22, 0.82, saddleMat, 0, 0.14, 0))
  saddleGroup.add(box(0.16, 0.2, 0.16, saddleMat, 0, 0.3, 0.34))
  saddleGroup.add(box(0.28, 0.3, 0.13, saddleMat, 0, 0.32, -0.38))
  for (const side of [-1, 1]) {
    saddleGroup.add(box(0.07, 0.56, 0.06, standard(0x5c3a1c, 0.8), side * 0.5, -0.16, -0.06))
    saddleGroup.add(box(0.16, 0.2, 0.12, standard(0xcdb47a, 0.5), side * 0.5, -0.46, -0.06))
  }

  const lucky = new THREE.Group()
  lucky.position.set(0.5, 1.98, -0.3)
  lucky.visible = false
  const horseshoe = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.035, 6, 14, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xffc63d, emissive: 0xa86a00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 })
  )
  horseshoe.rotation.z = Math.PI
  lucky.add(horseshoe)
  bodyGroup.add(lucky)

  // Legs --------------------------------------------------------------------
  const legs = []
  const legPositions = [
    { x: 0.31, z: 0.62, phase: 0 },
    { x: -0.31, z: 0.62, phase: Math.PI * 0.94 },
    { x: 0.32, z: -0.68, phase: Math.PI },
    { x: -0.32, z: -0.68, phase: Math.PI * 1.06 }
  ]
  for (const spec of legPositions) {
    const pivot = new THREE.Group()
    pivot.position.set(spec.x, 1.24, spec.z)
    root.add(pivot)
    pivot.add(box(0.32, 0.58, 0.36, coatMat, 0, -0.29, 0))
    const knee = new THREE.Group()
    knee.position.set(0, -0.58, 0)
    pivot.add(knee)
    knee.add(box(0.23, 0.5, 0.26, shadeMat, 0, -0.25, 0))
    knee.add(box(0.28, 0.14, 0.34, hoofMat, 0, -0.57, 0.02))
    legs.push({ pivot, knee, phase: spec.phase, front: spec.z > 0 })
  }

  // Animator ----------------------------------------------------------------
  let gaitPhase = 0
  let clock = 0
  let earTimer = 2 + Math.random() * 3
  let earTwitch = 0

  function animate(dt, state = {}) {
    const speed = state.speed ?? 0
    const grounded = state.grounded !== false
    clock += dt
    const moving = speed > 0.12
    const gait = THREE.MathUtils.clamp(speed / 8.6, 0, 1)
    if (moving) gaitPhase += dt * (3.4 + speed * 1.45)

    const bounce = moving ? Math.sin(gaitPhase * 2) : Math.sin(clock * 1.7)
    bodyGroup.position.y = grounded ? bounce * (moving ? 0.07 * (0.35 + gait) : 0.012) : 0.06
    bodyGroup.rotation.x = (moving && grounded ? Math.cos(gaitPhase * 2) * 0.045 * (0.4 + gait) : 0) + (grounded ? 0 : -0.16)
    bodyGroup.rotation.z = moving ? Math.sin(gaitPhase) * 0.02 * gait : 0

    legs.forEach(leg => {
      if (!grounded) {
        leg.pivot.rotation.x = leg.front ? -0.55 : 0.52
        leg.knee.rotation.x = leg.front ? 0.85 : 0.5
        return
      }
      const swing = moving ? Math.sin(gaitPhase + leg.phase) * (0.22 + gait * 0.62) : 0
      leg.pivot.rotation.x = swing
      leg.knee.rotation.x = moving ? Math.max(0, -Math.sin(gaitPhase + leg.phase)) * (0.2 + gait * 0.85) : 0
    })

    headGroup.rotation.x = -0.42 + (moving ? Math.sin(gaitPhase * 2 + 0.5) * 0.06 * gait : Math.sin(clock * 1.2) * 0.025)
    headGroup.rotation.z = moving ? Math.sin(gaitPhase) * 0.02 : 0
    neckGroup.rotation.x = 0.62 + (moving ? Math.sin(gaitPhase * 2) * 0.035 * gait : 0)

    tailGroup.rotation.z = Math.sin(clock * 2.1 + 0.5) * 0.18 + (moving ? Math.sin(gaitPhase) * 0.12 * gait : 0)
    tailGroup.rotation.x = 0.55 + (moving ? 0.14 * gait + Math.sin(gaitPhase * 2) * 0.05 : Math.sin(clock * 1.4) * 0.04)
    tailParts.forEach((part, index) => {
      part.rotation.z = Math.sin(clock * 2.1 - index * 0.5) * 0.08
    })

    maneParts.forEach((part, index) => {
      part.rotation.x = -0.1 + (moving ? Math.sin(gaitPhase * 2 - index * 0.4) * 0.06 * gait : 0)
    })

    earTimer -= dt
    if (earTimer < 0) {
      earTwitch = 0.4
      earTimer = 3 + Math.random() * 5
    }
    earTwitch = Math.max(0, earTwitch - dt)
    earL.rotation.z = 0.16 + Math.sin(earTwitch * 26) * 0.14
    earR.rotation.z = -0.16 - Math.sin(earTwitch * 22) * 0.1
  }

  function setCoat(nextCoat) {
    coatMat.color.setHex(nextCoat.body)
    shadeMat.color.setHex(nextCoat.shade)
    muzzleMat.color.setHex(new THREE.Color(nextCoat.shade).multiplyScalar(0.8).getHex())
  }

  function setMane(color) {
    maneMat.color.setHex(color)
  }

  function setLucky(value) {
    lucky.visible = value
  }

  return {
    group: root,
    parts: { bodyGroup, neckGroup, headGroup, tailGroup, legs, maneParts },
    animate,
    setCoat,
    setMane,
    setLucky
  }
}
