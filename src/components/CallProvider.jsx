import { useCallback, useEffect, useRef, useState } from 'react'
import CallContext from '../context/callContext.js'
import { useAuth } from '../context/useAuth.js'
import {
  authorizeRealtimeSession,
  getSupabaseClient,
} from '../lib/supabase.js'
import {
  primeCallAudio,
  startCallTone,
  stopCallTone,
  playCallEndSound,
} from '../lib/callSounds.js'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
]

export function CallProvider({ children }) {
  const { user } = useAuth()
  const [call, setCall] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [callError, setCallError] = useState('')

  const clientRef = useRef(null)
  const channelRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const pendingIceRef = useRef([])
  const offerStartedRef = useRef(false)
  const connectedCallIdRef = useRef(null)
  const callRef = useRef(null)
  const startCallInProgressRef = useRef(false)
  const acceptCallInProgressRef = useRef(false)
  const respondInProgressRef = useRef(false)
  const endedSoundCallIdRef = useRef(null)

  const playCallEndOnce = useCallback(callId => {
    if (!callId || endedSoundCallIdRef.current === callId) return

    endedSoundCallIdRef.current = callId
    void playCallEndSound()
  }, [])

  useEffect(() => {
    callRef.current = call
  }, [call])

  useEffect(() => {
    const unlock = () => {
      void primeCallAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!call || call.status !== 'ringing') {
      stopCallTone()
      return undefined
    }

    const tone = call.caller_id === user?.id ? 'outgoing' : 'incoming'
    void startCallTone(tone)

    return () => stopCallTone()
  }, [call?.id, call?.status, call?.caller_id, user?.id])

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    remoteStreamRef.current?.getTracks().forEach(track => track.stop())

    localStreamRef.current = null
    remoteStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
  }, [])

  const closeConnection = useCallback(async () => {
    if (channelRef.current) {
      const channel = channelRef.current
      channelRef.current = null
      await clientRef.current?.removeChannel(channel)
    }

    peerRef.current?.close()
    peerRef.current = null
    connectedCallIdRef.current = null
    pendingIceRef.current = []
    offerStartedRef.current = false
    stopMedia()
  }, [stopMedia])

  const finishRemoteCall = useCallback(async terminalCall => {
    if (terminalCall?.status === 'ended') {
      playCallEndOnce(terminalCall.id)
    }

    await closeConnection()
    setCall(null)
    callRef.current = null
  }, [closeConnection, playCallEndOnce])

  const sendSignal = useCallback(async (event, payload) => {
    const channel = channelRef.current
    if (!channel) return

    const result = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { event, ...payload },
    })

    if (result !== 'ok') {
      console.warn('Call signaling delivery:', result)
    }
  }, [])

  const flushPendingIce = useCallback(async () => {
    const peer = peerRef.current
    if (!peer?.remoteDescription) return

    const pending = pendingIceRef.current.splice(0)

    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(candidate)
      } catch (error) {
        console.warn('Unable to apply queued ICE candidate:', error)
      }
    }
  }, [])

  const connectSignal = useCallback(async (session, isCaller) => {
    if (!session?.id || connectedCallIdRef.current === session.id) return

    const client = clientRef.current
    if (!client) return

    connectedCallIdRef.current = session.id
    pendingIceRef.current = []

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerRef.current = peer

    const outgoingStream = localStreamRef.current

    outgoingStream?.getTracks().forEach(track => {
      console.info('[QORVEXA WebRTC] Local track added:', {
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
      })
      peer.addTrack(track, outgoingStream)
    })

    peer.ontrack = event => {
      console.info('[QORVEXA WebRTC] Remote track received:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        readyState: event.track.readyState,
        streams: event.streams?.length || 0,
      })

      const stream = event.streams?.[0]
      if (stream) {
        remoteStreamRef.current = stream
        setRemoteStream(stream)
      }
    }

    peer.onicecandidate = event => {
      if (event.candidate) {
        sendSignal('ice', {
          candidate: event.candidate.toJSON(),
        })
      }
    }

    peer.oniceconnectionstatechange = () => {
      console.info('[QORVEXA WebRTC] ICE state:', peer.iceConnectionState)
    }

    peer.onicegatheringstatechange = () => {
      console.info('[QORVEXA WebRTC] ICE gathering:', peer.iceGatheringState)
    }

    peer.onconnectionstatechange = () => {
      console.info('[QORVEXA WebRTC] Peer connection state:', peer.connectionState)

      if (peer.connectionState === 'failed') {
        setCallError('The connection was interrupted. Please end the call and try again.')
      }
    }

    peer.onicecandidateerror = event => {
      console.warn('[QORVEXA WebRTC] ICE candidate error:', {
        url: event.url,
        code: event.errorCode,
        text: event.errorText,
      })
    }

    let channel = null

    try {
      await authorizeRealtimeSession(client)

      channel = client.channel(`call:${session.id}`, {
        config: { private: true },
      })

      channelRef.current = channel

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }) => {
          if (!payload || peerRef.current !== peer) return

          try {
            if (payload.event === 'ready') {
              if (isCaller && payload.role === 'callee' && !offerStartedRef.current) {
                offerStartedRef.current = true
                const offer = await peer.createOffer()
                await peer.setLocalDescription(offer)
                await sendSignal('offer', { description: peer.localDescription })
              }

              if (!isCaller && payload.role === 'caller') {
                await sendSignal('ready', { role: 'callee' })
              }
            }

            if (payload.event === 'offer' && !isCaller) {
              await peer.setRemoteDescription(payload.description)
              await flushPendingIce()

              const answer = await peer.createAnswer()
              await peer.setLocalDescription(answer)
              await sendSignal('answer', { description: peer.localDescription })
            }

            if (payload.event === 'answer' && isCaller) {
              await peer.setRemoteDescription(payload.description)
              await flushPendingIce()
            }

            if (payload.event === 'ice' && payload.candidate) {
              if (peer.remoteDescription) {
                await peer.addIceCandidate(payload.candidate)
              } else {
                pendingIceRef.current.push(payload.candidate)
              }
            }
          } catch (error) {
            console.error('Call signaling error:', error)
            setCallError(error.message || 'Call connection failed.')
          }
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            sendSignal('ready', {
              role: isCaller ? 'caller' : 'callee',
            })
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const message = 'Unable to establish a secure call signaling connection.'
            void closeConnection().finally(() => setCallError(message))
          }
        })
    } catch (error) {
      connectedCallIdRef.current = null

      if (channelRef.current === channel) {
        channelRef.current = null
      }

      if (channel) {
        void client.removeChannel(channel)
      }

      peer.close()
      if (peerRef.current === peer) {
        peerRef.current = null
      }

      setCallError(error.message || 'Unable to connect the call.')
    }
  }, [flushPendingIce, sendSignal, closeConnection])

  const requestMedia = useCallback(async callType => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support microphone or camera access.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    })

    localStreamRef.current = stream
    setLocalStream(stream)
    setMuted(false)
    setCameraOff(false)

    return stream
  }, [])

  const startCall = useCallback(async (conversationId, callType = 'audio') => {
    if (!user || !conversationId || callRef.current || startCallInProgressRef.current) return

    void primeCallAudio()
    startCallInProgressRef.current = true
    setCallError('')

    try {
      await requestMedia(callType)

      const client = clientRef.current || getSupabaseClient()
      clientRef.current = client

      const { data, error } = await client.rpc('start_call', {
        target_conversation_id: conversationId,
        target_call_type: callType,
      })

      if (error) throw error

      const callId = typeof data === 'string' ? data : data?.id
      if (!callId) throw new Error('The call could not be created.')

      const session = {
        id: callId,
        conversation_id: conversationId,
        caller_id: user.id,
        callee_id: null,
        call_type: callType,
        status: 'ringing',
      }

      setCall(session)
      callRef.current = session
    } catch (error) {
      await closeConnection()
      setCallError(error.message || 'Unable to start the call.')
      throw error
    } finally {
      startCallInProgressRef.current = false
    }
  }, [user, requestMedia, closeConnection])

  const acceptCall = useCallback(async () => {
    const session = callRef.current
    if (!session || session.status !== 'ringing' || session.callee_id !== user?.id || acceptCallInProgressRef.current) return

    acceptCallInProgressRef.current = true
    setCallError('')

    try {
      const client = clientRef.current || getSupabaseClient()
      clientRef.current = client

      await requestMedia(session.call_type)

      const { error } = await client.rpc('respond_to_call', {
        target_call_id: session.id,
        target_action: 'accept',
      })

      if (error) throw error

      const { data: refreshedCall, error: refreshError } =
        await client
          .from('call_sessions')
          .select('status')
          .eq('id', session.id)
          .single()

      if (refreshError) throw refreshError

      if (refreshedCall.status !== 'accepted') {
        const updatedCall = { ...session, status: refreshedCall.status }
        setCall(updatedCall)
        callRef.current = updatedCall
        await closeConnection()
        return
      }

      const accepted = { ...session, status: 'accepted' }
      setCall(accepted)
      callRef.current = accepted

      await connectSignal(accepted, false)
    } catch (error) {
      let recoveredStatus = null

      try {
        const { data: latestCall, error: statusError } = await client
          .from('call_sessions')
          .select('status')
          .eq('id', session.id)
          .single()

        if (statusError) throw statusError
        recoveredStatus = latestCall?.status || null
      } catch (recoveryError) {
        console.warn('Unable to recover call status:', recoveryError)
      }

      if (recoveredStatus === 'accepted') {
        const accepted = { ...session, status: 'accepted' }
        setCall(accepted)
        callRef.current = accepted
        setCallError('')
        await connectSignal(accepted, false)
      } else if (['declined', 'cancelled', 'ended', 'expired'].includes(recoveredStatus)) {
        await closeConnection()
        setCall(null)
        callRef.current = null
      } else {
        await closeConnection()
        setCallError(
          recoveredStatus === 'ringing'
            ? 'Your response could not be confirmed. Please try accepting again.'
            : error.message || 'Unable to accept the call.'
        )
      }
    } finally {
      acceptCallInProgressRef.current = false
    }
  }, [user, requestMedia, connectSignal, closeConnection])

  const respond = useCallback(async action => {
    const session = callRef.current
    if (!session || respondInProgressRef.current) return

    respondInProgressRef.current = true

    try {
      const client = clientRef.current || getSupabaseClient()
      clientRef.current = client

      const { error } = await client.rpc('respond_to_call', {
        target_call_id: session.id,
        target_action: action,
      })

      if (error) throw error

      if (action === 'end') {
        playCallEndOnce(session.id)
      }

      if (action === 'decline' || action === 'cancel' || action === 'end') {
        await closeConnection()
        setCall(null)
        callRef.current = null
      }
    } catch (error) {
      setCallError(error.message || 'Unable to update the call.')
    } finally {
      respondInProgressRef.current = false
    }
  }, [closeConnection])

  useEffect(() => {
    if (
      !call ||
      call.status !== 'ringing' ||
      call.caller_id !== user?.id
    ) return undefined

    const ringingCallId = call.id

    const timeoutId = window.setTimeout(() => {
      if (callRef.current?.id === ringingCallId && callRef.current.status === 'ringing') {
        respond('cancel')
      }
    }, 60000)

    return () => window.clearTimeout(timeoutId)
  }, [call, user, respond])

  const toggleMute = useCallback(() => {
    const next = !muted
    localStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !next
    })
    setMuted(next)
  }, [muted])

  const toggleCamera = useCallback(() => {
    const next = !cameraOff
    localStreamRef.current?.getVideoTracks().forEach(track => {
      track.enabled = !next
    })
    setCameraOff(next)
  }, [cameraOff])

  useEffect(() => {
    if (!user) return undefined

    let active = true
    let channel

    const setup = async () => {
      try {
        const client = getSupabaseClient()
        clientRef.current = client
        await authorizeRealtimeSession(client)
        if (!active) return

        channel = client
          .channel(`user-calls:${user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'call_sessions',
            filter: `callee_id=eq.${user.id}`,
          }, payload => {
            const row = payload.new
            if (!row?.id || !active) return

            if (payload.eventType === 'INSERT' && row.status === 'ringing') {
              setCall(current => {
                if (current) return current
                callRef.current = row
                return row
              })
            } else if (callRef.current?.id === row.id) {
              if (['declined', 'cancelled', 'ended', 'expired'].includes(row.status)) {
                finishRemoteCall(row)
              } else {
                setCall(row)
                callRef.current = row
              }
            }
          })
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_sessions',
            filter: `caller_id=eq.${user.id}`,
          }, payload => {
            const row = payload.new
            if (!row?.id || !active) return

            if (callRef.current?.id === row.id) {
              setCall(row)
              callRef.current = row

              if (row.status === 'accepted') {
                connectSignal(row, true)
              }

              if (['declined', 'cancelled', 'ended', 'expired'].includes(row.status)) {
                finishRemoteCall()
              }
            }
          })
          .subscribe()
      } catch (error) {
        if (active) {
          console.error('Call listener setup failed:', error)
          setCallError(error.message || 'Unable to listen for incoming calls.')
        }
      }
    }

    setup()

    return () => {
      active = false
      if (channel) getSupabaseClient().removeChannel(channel)
    }
  }, [user, connectSignal, closeConnection, finishRemoteCall])

  useEffect(() => {
    if (!user) {
      closeConnection()
      setCall(null)
      callRef.current = null
    }
  }, [user, closeConnection])

  useEffect(() => {
    return () => {
      const channel = channelRef.current
      channelRef.current = null

      if (channel) {
        void clientRef.current?.removeChannel(channel)
      }

      peerRef.current?.close()
      peerRef.current = null
      connectedCallIdRef.current = null
      pendingIceRef.current = []

      localStreamRef.current?.getTracks().forEach(track => track.stop())
      remoteStreamRef.current?.getTracks().forEach(track => track.stop())

      localStreamRef.current = null
      remoteStreamRef.current = null
    }
  }, [])

  const value = {
    call,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    callError,
    clearCallError: () => setCallError(''),
    startCall,
    acceptCall,
    declineCall: () => respond('decline'),
    cancelCall: () => respond('cancel'),
    endCall: () => respond('end'),
    toggleMute,
    toggleCamera,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  )
}


