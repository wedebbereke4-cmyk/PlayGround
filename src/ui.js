const APPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5.2c-1-1.4-3.2-1.9-4.7-.8C4.6 6.2 4.4 11 6.7 15c1.3 2.3 3 3.7 4.4 3.8.4 0 .7-.2.9-.6.2.4.5.6.9.6 1.4-.1 3.1-1.5 4.4-3.8 2.3-4 2.1-8.8-.6-10.6-1.5-1.1-3.7-.6-4.7.8z" fill="currentColor"/><path d="M12 5.6c0-1.7.9-3 2.6-3.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'
const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.5 5.4 5.9.7-4.4 4 1.2 5.9L12 16.3l-5.2 2.9 1.2-5.9-4.4-4 5.9-.7z" fill="currentColor"/></svg>'

function hex(value) {
  return `#${value.toString(16).padStart(6, '0')}`
}

function lighten(value, amount) {
  const r = Math.min(255, ((value >> 16) & 255) + amount)
  const g = Math.min(255, ((value >> 8) & 255) + amount)
  const b = Math.min(255, (value & 255) + amount)
  return `rgb(${r}, ${g}, ${b})`
}

export class UI {
  constructor({ coats, manes, handlers }) {
    this.coats = coats
    this.manes = manes
    this.handlers = handlers
    this.coatIndex = 0
    this.maneIndex = 0
    this.appleTotal = 12
    this.lastMinimap = 0
    this.toasts = []
    this.muted = false

    this.el = {
      start: document.getElementById('start-screen'),
      hud: document.getElementById('hud'),
      loading: document.getElementById('loading'),
      play: document.getElementById('play-btn'),
      name: document.getElementById('horse-name'),
      nameChip: document.getElementById('horse-name-chip'),
      hudName: document.getElementById('hud-name'),
      pauseName: document.getElementById('pause-name'),
      coatSwatches: document.getElementById('coat-swatches'),
      maneSwatches: document.getElementById('mane-swatches'),
      pauseCoatSwatches: document.getElementById('pause-coat-swatches'),
      pauseManeSwatches: document.getElementById('pause-mane-swatches'),
      coatName: document.getElementById('coat-name'),
      maneName: document.getElementById('mane-name'),
      pauseCoatName: document.getElementById('pause-coat-name'),
      pauseManeName: document.getElementById('pause-mane-name'),
      appleCount: document.getElementById('apple-count'),
      applePill: document.querySelector('.apple-pill'),
      questFill: document.getElementById('quest-fill'),
      questTitle: document.getElementById('quest-title'),
      questDesc: document.getElementById('quest-desc'),
      stamina: document.querySelector('.stamina'),
      staminaFill: document.getElementById('stamina-fill'),
      prompt: document.getElementById('interact-prompt'),
      promptText: document.getElementById('interact-text'),
      toastStack: document.getElementById('toast-stack'),
      dialog: document.getElementById('dialog'),
      dialogAvatar: document.getElementById('dialog-avatar'),
      dialogName: document.getElementById('dialog-name'),
      dialogRole: document.getElementById('dialog-role'),
      dialogText: document.getElementById('dialog-text'),
      dialogNext: document.getElementById('dialog-next'),
      pause: document.getElementById('pause-menu'),
      complete: document.getElementById('complete'),
      statTime: document.getElementById('stat-time'),
      continueBtn: document.getElementById('continue-btn'),
      resume: document.getElementById('resume-btn'),
      restart: document.getElementById('restart-btn'),
      quit: document.getElementById('quit-btn'),
      sound: document.getElementById('sound-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      minimap: document.getElementById('minimap'),
      mobile: document.getElementById('mobile-controls'),
      joystick: document.getElementById('joystick'),
      stick: document.getElementById('stick'),
      gallop: document.getElementById('gallop-btn'),
      jump: document.getElementById('jump-btn'),
      avatar: document.getElementById('avatar-dot')
    }

    this.minimapContext = this.el.minimap.getContext('2d')
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 860px)').matches
    if (this.isTouch) document.body.classList.add('touch')
    this.bindStart()
    this.bindHud()
    this.bindDialogs()
    this.bindMobile()
    this.renderSwatches()
    this.setCoat(0, false)
    this.setMane(0, false)
    this.bindResponsive()
  }

  bindResponsive() {
    const query = window.matchMedia('(max-width: 860px)')
    const update = () => {
      this.isTouch = query.matches || window.matchMedia('(pointer: coarse)').matches
      document.body.classList.toggle('touch', this.isTouch)
      if (!this.el.mobile.classList.contains('hidden')) {
        this.el.mobile.classList.toggle('hidden', !this.isTouch)
      }
    }
    query.addEventListener('change', update)
  }

  bindStart() {
    this.el.play.addEventListener('click', () => this.handlers.onPlay())
    this.el.name.addEventListener('input', () => {
      const value = this.el.name.value.slice(0, 12)
      this.setName(value)
      this.handlers.onName?.(value)
    })
    this.el.name.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.el.play.click()
    })
  }

  bindHud() {
    this.el.sound.addEventListener('click', () => this.handlers.onSound())
    this.el.pauseBtn.addEventListener('click', () => this.handlers.onPause())
  }

  bindDialogs() {
    this.el.dialogNext.addEventListener('click', () => this.handlers.onDialogClose())
    this.el.continueBtn.addEventListener('click', () => this.handlers.onContinue())
    this.el.resume.addEventListener('click', () => this.handlers.onResume())
    this.el.restart.addEventListener('click', () => this.handlers.onRestart())
    this.el.quit.addEventListener('click', () => this.handlers.onQuit())
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!this.el.dialog.classList.contains('hidden')) this.handlers.onDialogClose()
        else if (!this.el.complete.classList.contains('hidden')) this.handlers.onContinue()
        else if (!this.el.pause.classList.contains('hidden')) this.handlers.onResume()
        else this.handlers.onPause()
      }
    })
  }

  bindMobile() {
    let pointerId = null
    const moveStick = event => {
      const rect = this.el.joystick.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      let dx = event.clientX - centerX
      let dy = event.clientY - centerY
      const max = rect.width * 0.32
      const length = Math.hypot(dx, dy)
      if (length > max) {
        dx = (dx / length) * max
        dy = (dy / length) * max
      }
      this.el.stick.style.transform = `translate(${dx}px, ${dy}px)`
      this.handlers.onJoystick(dx / max, -dy / max)
    }
    const release = () => {
      pointerId = null
      this.el.stick.style.transform = 'translate(0, 0)'
      this.handlers.onJoystick(0, 0)
    }
    this.el.joystick.addEventListener('pointerdown', event => {
      pointerId = event.pointerId
      this.el.joystick.setPointerCapture(pointerId)
      moveStick(event)
      event.preventDefault()
    })
    this.el.joystick.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return
      moveStick(event)
      event.preventDefault()
    })
    this.el.joystick.addEventListener('pointerup', release)
    this.el.joystick.addEventListener('pointercancel', release)
    this.el.joystick.addEventListener('pointerleave', event => {
      if (pointerId !== null && event.pointerId === pointerId && !this.el.joystick.hasPointerCapture(pointerId)) release()
    })

    const gallopOn = event => {
      this.handlers.onGallop(true)
      event.preventDefault()
    }
    const gallopOff = event => {
      this.handlers.onGallop(false)
      event?.preventDefault?.()
    }
    this.el.gallop.addEventListener('pointerdown', gallopOn)
    this.el.gallop.addEventListener('pointerup', gallopOff)
    this.el.gallop.addEventListener('pointercancel', gallopOff)
    this.el.gallop.addEventListener('pointerleave', gallopOff)
    this.el.jump.addEventListener('pointerdown', event => {
      this.handlers.onJump()
      event.preventDefault()
    })
  }

  renderSwatches() {
    const create = (item, type, index, target) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'swatch'
      button.dataset.index = String(index)
      button.dataset.type = type
      button.setAttribute('aria-label', item.name)
      button.title = item.name
      button.style.background = type === 'coat'
        ? `linear-gradient(140deg, ${lighten(item.body, 26)} 0%, ${hex(item.body)} 52%, ${hex(item.shade)} 100%)`
        : `linear-gradient(140deg, ${lighten(item.color, 26)} 0%, ${hex(item.color)} 70%)`
      button.addEventListener('click', () => {
        if (type === 'coat') this.setCoat(index, true)
        else this.setMane(index, true)
      })
      target.appendChild(button)
    }
    this.coats.forEach((item, index) => create(item, 'coat', index, this.el.coatSwatches))
    this.manes.forEach((item, index) => create(item, 'mane', index, this.el.maneSwatches))
    this.coats.forEach((item, index) => create(item, 'coat', index, this.el.pauseCoatSwatches))
    this.manes.forEach((item, index) => create(item, 'mane', index, this.el.pauseManeSwatches))
  }

  setCoat(index, notify = true) {
    this.coatIndex = index
    const coat = this.coats[index]
    for (const container of [this.el.coatSwatches, this.el.pauseCoatSwatches]) {
      container.querySelectorAll('.swatch').forEach(button => {
        button.classList.toggle('selected', Number(button.dataset.index) === index)
      })
    }
    this.el.coatName.textContent = coat.name
    this.el.pauseCoatName.textContent = coat.name
    this.el.avatar.style.background = `radial-gradient(circle at 35% 30%, ${lighten(coat.body, 40)}, ${hex(coat.body)} 55%, ${hex(coat.shade)})`
    if (notify) this.handlers.onCoat?.(index)
  }

  setMane(index, notify = true) {
    this.maneIndex = index
    const mane = this.manes[index]
    for (const container of [this.el.maneSwatches, this.el.pauseManeSwatches]) {
      container.querySelectorAll('.swatch').forEach(button => {
        button.classList.toggle('selected', Number(button.dataset.index) === index)
      })
    }
    this.el.maneName.textContent = mane.name
    this.el.pauseManeName.textContent = mane.name
    if (notify) this.handlers.onMane?.(index)
  }

  setName(value) {
    const clean = value.trim() || 'Comet'
    this.el.nameChip.textContent = clean
    this.el.hudName.textContent = clean
    this.el.pauseName.textContent = clean
  }

  setMuted(muted) {
    this.muted = muted
    this.el.sound.classList.toggle('muted', muted)
    this.el.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
    this.el.sound.title = muted ? 'Unmute sound' : 'Mute sound'
  }

  hideLoading() {
    this.el.loading.classList.add('leaving')
    window.setTimeout(() => this.el.loading.classList.add('hidden'), 600)
  }

  showGame() {
    this.el.start.classList.add('leaving')
    window.setTimeout(() => this.el.start.classList.add('hidden'), 520)
    this.el.hud.classList.remove('hidden')
    if (this.isTouch) this.el.mobile.classList.remove('hidden')
  }

  showTitle() {
    this.el.start.classList.remove('hidden', 'leaving')
    this.el.hud.classList.add('hidden')
    this.el.mobile.classList.add('hidden')
    this.el.pause.classList.add('hidden')
    this.el.dialog.classList.add('hidden')
    this.el.complete.classList.add('hidden')
    this.hidePrompt()
  }

  updateApples(count, total = 12) {
    this.el.appleCount.textContent = String(count)
    this.el.questFill.style.width = `${Math.min(100, (count / total) * 100)}%`
  }

  completeQuest() {
    this.el.questTitle.textContent = 'Valley Hero'
    this.el.questDesc.textContent = "June's lucky horseshoe is yours. Keep exploring!"
    this.el.questFill.style.width = '100%'
  }

  resetQuest() {
    this.el.questTitle.textContent = "June's Harvest"
    this.el.questDesc.textContent = 'Find 12 Golden Apples scattered across the valley.'
    this.el.questFill.style.width = '0%'
  }

  updateStamina(value) {
    this.el.staminaFill.style.transform = `scaleX(${Math.max(0.001, value / 100)})`
    this.el.stamina.classList.toggle('empty', value < 8)
  }

  showPrompt(text) {
    this.el.promptText.textContent = text
    this.el.prompt.classList.remove('hidden')
  }

  hidePrompt() {
    this.el.prompt.classList.add('hidden')
  }

  toast(text, icon = 'apple') {
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.innerHTML = `<span class="toast-icon">${icon === 'star' ? STAR_SVG : APPLE_SVG}</span><span>${text}</span>`
    this.el.toastStack.appendChild(toast)
    this.toasts.push(toast)
    while (this.toasts.length > 3) {
      const first = this.toasts.shift()
      first.remove()
    }
    window.setTimeout(() => {
      toast.classList.add('out')
      window.setTimeout(() => {
        toast.remove()
        this.toasts = this.toasts.filter(item => item !== toast)
      }, 420)
    }, 2400)
  }

  openDialog({ name, role, initial, text, button = "Let's ride!" }) {
    this.el.dialogName.textContent = name
    this.el.dialogRole.textContent = role
    this.el.dialogAvatar.textContent = initial
    this.el.dialogText.textContent = text
    this.el.dialogNext.textContent = button
    this.el.dialog.classList.remove('hidden')
  }

  closeDialog() {
    this.el.dialog.classList.add('hidden')
  }

  showPause() {
    this.el.pause.classList.remove('hidden')
  }

  hidePause() {
    this.el.pause.classList.add('hidden')
  }

  showComplete({ time }) {
    this.el.statTime.textContent = time
    this.el.complete.classList.remove('hidden')
  }

  hideComplete() {
    this.el.complete.classList.add('hidden')
  }

  formatTime(seconds) {
    const total = Math.floor(seconds)
    const minutes = Math.floor(total / 60)
    const rest = total % 60
    return `${minutes}:${String(rest).padStart(2, '0')}`
  }

  updateMinimap(player, world, now) {
    if (now - this.lastMinimap < 80) return
    this.lastMinimap = now
    const ctx = this.minimapContext
    const size = this.el.minimap.width
    const extent = 128
    const toPx = value => (value / extent * 0.5 + 0.5) * size
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(world.minimap, 0, 0, size, size)

    const px = toPx(player.position.x)
    const pz = toPx(player.position.z)

    world.npcs.forEach(npc => {
      const x = toPx(npc.x)
      const z = toPx(npc.z)
      ctx.beginPath()
      ctx.arc(x, z, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#6a84d8'
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#fff8e8'
      ctx.stroke()
    })

    world.apples.forEach(apple => {
      if (apple.collected) return
      const x = toPx(apple.group.position.x)
      const z = toPx(apple.group.position.z)
      const pulse = 1 + Math.sin(now / 280 + apple.index) * 0.18
      ctx.beginPath()
      ctx.arc(x, z, 5.4 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = '#ffc83d'
      ctx.fill()
      ctx.lineWidth = 2.2
      ctx.strokeStyle = '#6b3d10'
      ctx.stroke()
    })

    ctx.save()
    ctx.translate(px, pz)
    ctx.rotate(Math.PI - player.yaw)
    ctx.beginPath()
    ctx.moveTo(0, -13)
    ctx.lineTo(9, 10)
    ctx.lineTo(0, 5)
    ctx.lineTo(-9, 10)
    ctx.closePath()
    ctx.fillStyle = '#fffdf4'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#6b3e26'
    ctx.stroke()
    ctx.restore()

    ctx.beginPath()
    ctx.arc(px, pz, 16, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 244, 200, 0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}
