let audioContext = null
let repeatTimer = null
let generation = 0
const activeNotes = new Set()
const endedNotes = new Set()

function getAudioContext() {
  if (typeof window === 'undefined') return null

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  if (!audioContext) audioContext = new AudioContextClass()
  return audioContext
}

export async function primeCallAudio() {
  try {
    const context = getAudioContext()
    if (context?.state === 'suspended') await context.resume()
  } catch (error) {
    console.warn('QORVEXA audio could not be unlocked:', error)
  }
}

function playNote(context, frequency, offset, duration, volume, waveform, collection = activeNotes) {
  const startAt = context.currentTime + offset
  const endAt = startAt + duration

  const createVoice = (pitch, level, type) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(pitch, startAt)

    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(level, startAt + 0.018)
    gain.gain.setValueAtTime(level, startAt + duration * 0.35)
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

    oscillator.connect(gain)
    gain.connect(context.destination)

    const note = { oscillator, gain }
    collection.add(note)

    oscillator.onended = () => {
      collection.delete(note)
      oscillator.disconnect()
      gain.disconnect()
    }

    oscillator.start(startAt)
    oscillator.stop(endAt + 0.02)
  }

  createVoice(frequency, volume, waveform)
  createVoice(frequency * 2, volume * 0.20, 'sine')
}

const SOUNDS = {
  outgoing: {
    repeat: 2100,
    notes: [
      [659.25, 0, 0.22, 0.075, 'triangle'],
      [783.99, 0.24, 0.28, 0.075, 'triangle'],
      [659.25, 0.72, 0.22, 0.075, 'triangle'],
      [783.99, 0.96, 0.36, 0.075, 'triangle'],
    ],
  },
  incoming: {
    repeat: 2400,
    notes: [
      [880.00, 0, 0.28, 0.085, 'triangle'],
      [1174.66, 0.24, 0.32, 0.085, 'sine'],
      [987.77, 0.62, 0.28, 0.085, 'triangle'],
      [1318.51, 0.88, 0.48, 0.085, 'sine'],
      [1174.66, 1.48, 0.25, 0.075, 'triangle'],
    ],
  },
  ended: {
    notes: [
      [987.77, 0, 0.16, 0.075, 'sine'],
      [783.99, 0.13, 0.20, 0.075, 'triangle'],
      [523.25, 0.30, 0.42, 0.075, 'sine'],
    ],
  },
}

export function stopCallTone() {
  generation += 1

  if (repeatTimer !== null) {
    window.clearTimeout(repeatTimer)
    repeatTimer = null
  }

  const context = audioContext
  if (!context) return

  for (const note of activeNotes) {
    try {
      const now = context.currentTime
      note.gain.gain.cancelScheduledValues(now)
      note.gain.gain.setValueAtTime(
        Math.max(note.gain.gain.value, 0.0001),
        now,
      )
      note.gain.gain.linearRampToValueAtTime(0.0001, now + 0.04)
      note.oscillator.stop(now + 0.05)
    } catch {
      // The note may already have stopped naturally.
    }
  }
}

export async function startCallTone(type) {
  stopCallTone()

  const sound = SOUNDS[type]
  const context = getAudioContext()
  if (!sound || !context) return

  const currentGeneration = generation

  try {
    if (context.state === 'suspended') await context.resume()
  } catch (error) {
    console.warn('QORVEXA call tone could not start:', error)
    return
  }

  if (currentGeneration !== generation) return

  const playPattern = () => {
    if (currentGeneration !== generation) return

    sound.notes.forEach(([frequency, offset, duration, volume, waveform]) => {
      playNote(context, frequency, offset, duration, volume, waveform)
    })

    repeatTimer = window.setTimeout(playPattern, sound.repeat)
  }

  playPattern()
}

export async function playCallEndSound() {
  stopCallTone()

  const context = getAudioContext()
  if (!context) return

  try {
    if (context.state === 'suspended') await context.resume()
    SOUNDS.ended.notes.forEach(([frequency, offset, duration, volume, waveform]) => {
      playNote(context, frequency, offset, duration, volume, waveform, endedNotes)
    })
  } catch (error) {
    console.warn('QORVEXA call-ended sound could not play:', error)
  }
}


