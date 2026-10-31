export class AudioKit {
  constructor() {
    this.ctx = null
    this.master = null
    this.windGain = null
    this.muted = false
    this.birdTimer = 3
    this.started = false
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.55
    this.master.connect(this.ctx.destination)
    this.startAmbience()
    this.started = true
  }

  startAmbience() {
    if (!this.ctx) return
    const length = this.ctx.sampleRate * 2
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.6
    const gain = this.ctx.createGain()
    gain.gain.value = 0.055
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
    this.windGain = gain
    this.windSource = source
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05)
    }
  }

  noiseBurst(duration = 0.12, volume = 0.18, frequency = 900) {
    if (!this.ctx) return
    const length = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 0.9
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
  }

  tone(frequency, duration = 0.15, { type = 'sine', volume = 0.16, delay = 0, slide = 0, attack = 0.008 } = {}) {
    if (!this.ctx) return
    const start = this.ctx.currentTime + delay
    const oscillator = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slide), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(this.master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
  }

  hoof(speed, water = false) {
    if (!this.ctx) return
    const heavy = speed > 7
    if (water) {
      this.noiseBurst(0.18, heavy ? 0.14 : 0.08, 1400)
      return
    }
    this.tone(heavy ? 72 : 88, 0.1, { type: 'sine', volume: heavy ? 0.2 : 0.12, slide: 42 })
    this.noiseBurst(0.06, heavy ? 0.08 : 0.05, 700)
  }

  jump() {
    this.tone(210, 0.18, { type: 'triangle', volume: 0.09, slide: 440 })
  }

  land() {
    this.tone(90, 0.16, { type: 'sine', volume: 0.16, slide: 45 })
    this.noiseBurst(0.1, 0.08, 500)
  }

  collect() {
    if (!this.ctx) return
    const notes = [880, 1108.73, 1318.51, 1760]
    notes.forEach((note, index) => {
      this.tone(note, 0.24, { type: 'triangle', volume: 0.12, delay: index * 0.055 })
    })
    this.noiseBurst(0.12, 0.03, 2600)
  }

  quest() {
    if (!this.ctx) return
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
    notes.forEach((note, index) => {
      this.tone(note, 0.5, { type: 'triangle', volume: 0.14, delay: index * 0.11 })
      this.tone(note / 2, 0.5, { type: 'sine', volume: 0.07, delay: index * 0.11 })
    })
    this.tone(2093, 1.1, { type: 'sine', volume: 0.06, delay: 0.7 })
  }

  click() {
    this.tone(520, 0.07, { type: 'triangle', volume: 0.1 })
    this.tone(780, 0.06, { type: 'sine', volume: 0.06, delay: 0.03 })
  }

  blip() {
    this.tone(640 + Math.random() * 160, 0.06, { type: 'triangle', volume: 0.05 })
  }

  chirp() {
    if (!this.ctx) return
    const base = 1800 + Math.random() * 900
    const notes = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < notes; i += 1) {
      this.tone(base + Math.random() * 500, 0.09, {
        type: 'sine',
        volume: 0.025,
        delay: i * 0.11,
        slide: base * (0.8 + Math.random() * 0.5)
      })
    }
  }

  update(dt) {
    if (!this.ctx || this.muted) return
    this.birdTimer -= dt
    if (this.birdTimer < 0) {
      this.birdTimer = 4 + Math.random() * 7
      if (this.started) this.chirp()
    }
  }
}
