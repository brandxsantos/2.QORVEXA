/**
 * Formats a call session into a human-readable inbox preview string.
 * Strictly adheres to QORVEXA call outcome rules and matches the QORVEXA Messenger Android app.
 */
export function formatCallPreview(call, currentUserId) {
  if (!call) return ''
  const isVideo = call.call_type === 'video'
  const isCaller = call.caller_id === currentUserId
  const icon = isVideo ? '📹' : '📞'
  const callName = isVideo ? 'video call' : 'voice call'

  switch (call.status) {
    case 'ended': {
      let durationStr = ''
      if (call.accepted_at && call.ended_at) {
        const secs = Math.max(
          0,
          Math.floor((new Date(call.ended_at).getTime() - new Date(call.accepted_at).getTime()) / 1000)
        )
        const hours = Math.floor(secs / 3600)
        const mins = Math.floor((secs % 3600) / 60)
        const remSecs = secs % 60
        if (hours > 0) {
          durationStr = `${hours} hr ${mins} min`
        } else if (mins > 0) {
          durationStr = `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
        } else if (remSecs > 0) {
          durationStr = `${remSecs} ${remSecs === 1 ? 'second' : 'seconds'}`
        }
      }
      return `${icon} ${isVideo ? 'Video call' : 'Voice call'}${durationStr ? ` · ${durationStr}` : ''}`
    }
    case 'declined':
      return `${icon} Declined ${callName}`
    case 'cancelled':
      return isCaller ? `${icon} Cancelled ${callName}` : `${icon} Missed ${callName}`
    case 'expired':
      return isCaller ? `${icon} Unanswered ${callName}` : `${icon} Missed ${callName}`
    case 'accepted':
      return `${icon} ${isVideo ? 'Video' : 'Voice'} call in progress`
    case 'ringing':
      return isCaller ? `${icon} Calling…` : `${icon} Incoming ${callName}`
    default:
      return `${icon} ${isVideo ? 'Video call' : 'Voice call'}`
  }
}

/**
 * Merges conversations with their latest message and call session details.
 * Compares timestamps so whichever event (message or call receipt) happened latest
 * becomes the conversation's preview and determines its position at the top of the inbox list.
 */
export function applyCallReceiptsToConversations(conversations, summariesById, calls, currentUserId, profileById = null) {
  const latestCallByConvId = {}
  for (const call of (calls || [])) {
    if (!call?.conversation_id) continue
    if (!latestCallByConvId[call.conversation_id]) {
      latestCallByConvId[call.conversation_id] = call
    }
  }

  const result = conversations.map((conversation) => {
    const peerId = conversation.user_low === currentUserId
      ? conversation.user_high
      : conversation.user_low
    const peer = profileById ? (profileById[peerId] || conversation.peer) : conversation.peer
    const summary = summariesById?.[conversation.id]
    const latestCall = latestCallByConvId[conversation.id]

    // Message details from get_conversation_summaries
    const messageCreatedAt = summary?.last_message_created_at
    const messageTime = messageCreatedAt ? new Date(messageCreatedAt).getTime() : 0

    // Call details from call_sessions
    const callTimestamp = latestCall
      ? (latestCall.ended_at || latestCall.accepted_at || latestCall.created_at)
      : null
    const callTime = callTimestamp ? new Date(callTimestamp).getTime() : 0

    let lastMessage = null
    let latestActivityAt = conversation.updated_at || conversation.created_at

    if (latestCall && callTime > messageTime) {
      // The newest activity is a call event
      latestActivityAt = callTimestamp
      lastMessage = {
        id: `call-${latestCall.id}`,
        callSessionId: latestCall.id,
        content: formatCallPreview(latestCall, currentUserId),
        sender_id: latestCall.caller_id,
        created_at: callTimestamp,
        isCall: true,
        callType: latestCall.call_type,
        callStatus: latestCall.status,
        isMissed: ['expired', 'declined'].includes(latestCall.status) && latestCall.callee_id === currentUserId,
      }
    } else if (summary?.last_message_id) {
      // The newest activity is an ordinary text message
      latestActivityAt = summary.last_message_created_at
      lastMessage = {
        id: summary.last_message_id,
        content: summary.last_message_content,
        sender_id: summary.last_message_sender_id,
        created_at: summary.last_message_created_at,
        isCall: false,
      }
    }

    let unreadCount = Number(summary?.unread_count || 0)
    const lastReadAt = conversation.user_low === currentUserId
      ? conversation.user_low_last_read_at
      : conversation.user_high_last_read_at
    const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0
    if (
      latestCall &&
      latestCall.status === 'expired' &&
      latestCall.callee_id === currentUserId &&
      callTime > lastReadTime
    ) {
      if (unreadCount === 0) unreadCount = 1
    }

    return {
      ...conversation,
      peer,
      lastMessage,
      unreadCount,
      latestActivityAt,
    }
  })

  // Sort conversations strictly by latestActivityAt descending
  result.sort((a, b) => {
    const timeA = a.latestActivityAt
      ? new Date(a.latestActivityAt).getTime()
      : (new Date(a?.updated_at || a?.created_at || 0).getTime())
    const timeB = b.latestActivityAt
      ? new Date(b.latestActivityAt).getTime()
      : (new Date(b?.updated_at || b?.created_at || 0).getTime())
    return timeB - timeA
  })

  return result
}
