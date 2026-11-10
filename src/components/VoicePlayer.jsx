import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, AlertCircle } from 'lucide-react'

// Pre-generated waveform heights for authentic voice memo appearance
const WAVEFORM_BARS = [
  35, 60, 45, 80, 55, 95, 70, 40, 85, 65,
  100, 75, 50, 90, 60, 40, 70, 85, 55, 95,
  80, 65, 45, 75, 50, 85, 60, 40
]

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function VoicePlayer({ src, isOwn = false }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      if ((!duration || isNaN(duration) || duration === Infinity) && audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = () => {
      setHasError(true)
      setIsPlaying(false)
    }

    const handleGlobalPause = (e) => {
      if (e.detail !== audio) {
        audio.pause()
        setIsPlaying(false)
      }
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    window.addEventListener('qorvexa-audio-play', handleGlobalPause)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      window.removeEventListener('qorvexa-audio-play', handleGlobalPause)
    }
  }, [duration])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      window.dispatchEvent(new CustomEvent('qorvexa-audio-play', { detail: audio }))
      audio.play().then(() => {
        setIsPlaying(true)
      }).catch((err) => {
        console.warn('[VoicePlayer] Playback error:', err)
        setHasError(true)
      })
    }
  }

  const handleSeek = (index) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const ratio = (index + 0.5) / WAVEFORM_BARS.length
    const targetTime = ratio * duration
    audio.currentTime = targetTime
    setCurrentTime(targetTime)
  }

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1
    setSpeed(nextSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  if (hasError) {
    return (
      <div className={`qv-voice-player-error${isOwn ? ' is-own' : ''}`}>
        <AlertCircle size={16} />
        <span>Audio unavailable</span>
      </div>
    )
  }

  return (
    <div className={`qv-voice-player${isOwn ? ' is-own' : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        className="qv-voice-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>

      {/* Waveform Bar Track */}
      <div className="qv-voice-waveform-container">
        <div className="qv-voice-waveform" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          {WAVEFORM_BARS.map((height, idx) => {
            const barPercent = (idx / WAVEFORM_BARS.length) * 100
            const isPlayed = barPercent <= progressPercent
            return (
              <button
                key={idx}
                type="button"
                className={`qv-voice-bar${isPlayed ? ' is-played' : ''}`}
                style={{ height: `${height}%` }}
                onClick={() => handleSeek(idx)}
                aria-label={`Seek to ${Math.round(barPercent)}%`}
              />
            )
          })}
        </div>

        {/* Timers & Speed toggle */}
        <div className="qv-voice-meta-row">
          <span className="qv-voice-time">
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : (duration > 0 ? formatTime(duration) : '0:00')}
          </span>
          <button
            type="button"
            className="qv-voice-speed-pill"
            onClick={cycleSpeed}
            title="Change playback speed"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  )
}
