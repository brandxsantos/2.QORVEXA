/**
 * QORVEXA Message Delivery & Read Status Utilities
 */

export function conversationPeerReadAt(conversation, userId) {
  if (!conversation) return null
  return conversation.user_low === userId
    ? conversation.user_high_last_read_at
    : conversation.user_low_last_read_at
}

export function conversationPeerDeliveredAt(conversation, userId) {
  if (!conversation) return null
  return conversation.user_low === userId
    ? conversation.user_high_last_delivered_at
    : conversation.user_low_last_delivered_at
}

export function findLastSeenMessageId(messages = [], currentUserId, peerReadAt) {
  if (!peerReadAt || !messages.length) return null
  const readTimestamp = new Date(peerReadAt).getTime()

  // Iterate backwards to find the latest message sent by current user that is <= peerReadAt
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.sender_id === currentUserId && !msg.timelineType) {
      const msgTime = new Date(msg.created_at).getTime()
      if (readTimestamp >= msgTime) {
        return msg.id
      }
    }
  }
  return null
}

export async function markConversationDelivered(client, conversationId) {
  if (!client || !conversationId) return
  try {
    await client.rpc('mark_conversation_delivered', {
      target_conversation_id: conversationId,
    })
  } catch (err) {
    console.warn('[messageDelivery] Non-fatal mark delivered error:', err.message)
  }
}

export async function markConversationsDelivered(client, conversationIds = []) {
  if (!client || !conversationIds.length) return
  try {
    await client.rpc('mark_conversations_delivered', {
      target_conversation_ids: conversationIds,
    })
  } catch (err) {
    console.warn('[messageDelivery] Non-fatal mark delivered batch error:', err.message)
  }
}
