export class AudioKit {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.birdTimer = null
  }

  start() {
    if (this.ctx) {
      this.ctx.resume?.()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.55
    this.master.connect(this.ctx.destination)
    this.startWind()
    this.scheduleBird()
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05)
    }
  }

  startWind() {
    const ctx = this.ctx
    const seconds = 3
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.985 + white * 0.015
      data[i] = last * 3.2
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gain = ctx.createGain()
    gain.gain.value = 0.09
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
  }

  scheduleBird() {
    if (this.birdTimer) clearTimeout(this.birdTimer)
    const delay = 3800 + Math.random() * 6500
    this.birdTimer = setTimeout(() => {
      if (!this.muted) this.chirp()
      this.scheduleBird()
    }, delay)
  }

  chirp() {
    if (!this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const notes = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < notes; i++) {
      const t = now + i * 0.11
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const base = 1900 + Math.random() * 900
      osc.frequency.setValueAtTime(base, t)
      osc.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.06)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.045, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
      osc.connect(gain).connect(this.master)
      osc.start(t)
      osc.stop(t + 0.12)
    }
  }

  tone(freq, start, duration, type = 'triangle', volume = 0.12) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  coin(index = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880]
    const base = scale[index % scale.length]
    this.tone(base * 2, 0, 0.22, 'sine', 0.11)
    this.tone(base * 3, 0.05, 0.3, 'triangle', 0.07)
    this.tone(base * 4, 0.11, 0.28, 'sine', 0.04)
  }

  jump() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(240, t)
    osc.frequency.exponentialRampToValueAtTime(430, t + 0.14)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.05, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  step() {
    this.tone(120 + Math.random() * 30, 0, 0.07, 'sine', 0.025)
  }

  complete() {
    const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    melody.forEach((f, i) => {
      this.tone(f, i * 0.11, 0.55, 'triangle', 0.1)
      this.tone(f * 2, i * 0.11, 0.4, 'sine', 0.035)
    })
  }
}
