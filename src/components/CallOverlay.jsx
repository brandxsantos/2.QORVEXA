import { useEffect, useRef } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import { useCall } from '../context/useCall.js'
import './CallOverlay.css'

function CallOverlay() {
  const { user } = useAuth()
  const {
    call,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    callError,
    clearCallError,
    acceptCall,
    declineCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCall()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream || null
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream || null
    }
  }, [remoteStream])

  if (!call && !callError) return null

  if (!call) {
    return (
      <div className="q-call-error" role="alert">
        <span>{callError}</span>
        <span className="q-call-error-label">Call unavailable</span>
        <button
          type="button"
          className="q-call-error-dismiss"
          onClick={clearCallError}
          aria-label="Dismiss call error"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  const incoming =
    call.status === 'ringing' && call.callee_id === user?.id

  const outgoing = call.status === 'ringing' && !incoming
  const videoCall = call.call_type === 'video'
  const active = call.status === 'accepted'

  const callTitle = incoming
    ? `Incoming ${videoCall ? 'video' : 'voice'} call`
    : outgoing
      ? `Calling...`
      : videoCall
        ? 'Video call'
        : 'Voice call'

  return (
    <section
      className={`q-call-overlay ${videoCall && active ? 'q-call-video-mode' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={callTitle}
    >
      <div className="q-call-window">
        <header className="q-call-header">
          <div className="q-call-brand">
            <span className="q-call-brand-dot" />
            QORVEXA CALL
          </div>
          <button
            type="button"
            className="q-call-close"
            onClick={incoming ? declineCall : outgoing ? cancelCall : endCall}
            aria-label="Close call"
          >
            <X size={19} />
          </button>
        </header>

        {videoCall && active ? (
          <div className="q-call-video-stage">
            <video
              ref={remoteVideoRef}
              className="q-call-remote-video"
              autoPlay
              muted
              playsInline
            />
            {!remoteStream && (
              <div className="q-call-video-waiting">
                <Video size={34} />
                <span>Waiting for the other person...</span>
              </div>
            )}
            <video
              ref={localVideoRef}
              className="q-call-local-video"
              autoPlay
              muted
              playsInline
            />
          </div>
        ) : (
          <div className="q-call-main">
            <div className="q-call-avatar">
              {videoCall ? <Video size={35} /> : <Phone size={35} />}
            </div>
            <h2>{callTitle}</h2>
            <p className="q-call-description">
              {incoming
                ? 'Someone is trying to reach you.'
                : outgoing
                  ? 'Waiting for the other person to answer.'
                  : 'Your call is connected.'}
            </p>
            {active && (
              <div className="q-call-connection-status">
                <span className="q-call-pulse" />
                Connected
              </div>
            )}
            {videoCall && active && (
              <video
                ref={localVideoRef}
                className="q-call-local-preview"
                autoPlay
                muted
                playsInline
              />
            )}
          </div>
        )}

        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
        />

        {callError && (
          <div className="q-call-inline-error" role="alert">
            <span>{callError}</span>
            <button
              type="button"
              className="q-call-error-dismiss"
              onClick={clearCallError}
              aria-label="Dismiss call error"
            >
              <X size={15} />
            </button>
          </div>
        )}

        <footer className="q-call-controls">
          {incoming ? (
            <>
              <button
                type="button"
                className="q-call-control q-call-decline"
                onClick={declineCall}
                aria-label="Decline call"
              >
                <PhoneOff size={21} />
                <span>Decline</span>
              </button>
              <button
                type="button"
                className="q-call-control q-call-accept"
                onClick={acceptCall}
                aria-label="Accept call"
              >
                <Phone size={21} />
                <span>Accept</span>
              </button>
            </>
          ) : outgoing ? (
            <button
              type="button"
              className="q-call-control q-call-decline"
              onClick={cancelCall}
            >
              <PhoneOff size={21} />
              <span>Cancel call</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`q-call-control ${muted ? 'q-call-control-active' : ''}`}
                onClick={toggleMute}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {muted ? <MicOff size={21} /> : <Mic size={21} />}
                <span>{muted ? 'Unmute' : 'Mute'}</span>
              </button>

              {videoCall && (
                <button
                  type="button"
                  className={`q-call-control ${cameraOff ? 'q-call-control-active' : ''}`}
                  onClick={toggleCamera}
                  aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {cameraOff ? <VideoOff size={21} /> : <Video size={21} />}
                  <span>{cameraOff ? 'Camera on' : 'Camera off'}</span>
                </button>
              )}

              <button
                type="button"
                className="q-call-control q-call-decline"
                onClick={endCall}
                aria-label="End call"
              >
                <PhoneOff size={21} />
                <span>End call</span>
              </button>
            </>
          )}
        </footer>
      </div>
    </section>
  )
}

export default CallOverlay
