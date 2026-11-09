export async function loadMessageInteractions(client, messages = []) {
  const messageIds = [...new Set(messages.map((message) => message.id).filter(Boolean))]
  const replyIds = [...new Set(
    messages.map((message) => message.reply_to_message_id).filter(Boolean),
  )]

  if (!messageIds.length) {
    return {
      replyMessagesById: {},
      reactionsByMessageId: {},
    }
  }

  const [repliesResult, reactionsResult] = await Promise.all([
    replyIds.length
      ? client.from('messages')
          .select('id, conversation_id, sender_id, content, created_at')
          .in('id', replyIds)
      : Promise.resolve({ data: [], error: null }),

    client.from('message_reactions')
      .select('id, message_id, user_id, reaction_type, created_at')
      .in('message_id', messageIds),
  ])

  if (repliesResult.error) throw repliesResult.error
  if (reactionsResult.error) throw reactionsResult.error

  const reactions = reactionsResult.data || []
  const reactorIds = [...new Set(reactions.map((reaction) => reaction.user_id))]

  const profilesResult = reactorIds.length
    ? await client.from('profiles')
        .select('id, username, display_name')
        .in('id', reactorIds)
    : { data: [], error: null }

  if (profilesResult.error) throw profilesResult.error

  const profilesById = Object.fromEntries(
    (profilesResult.data || []).map((profile) => [profile.id, profile]),
  )

  const reactionsByMessageId = {}

  for (const reaction of reactions) {
    const profile = profilesById[reaction.user_id]

    const enrichedReaction = {
      ...reaction,
      reactor_name: profile?.display_name || profile?.username || 'QORVEXA member',
    }

    if (!reactionsByMessageId[reaction.message_id]) {
      reactionsByMessageId[reaction.message_id] = []
    }

    reactionsByMessageId[reaction.message_id].push(enrichedReaction)
  }

  return {
    replyMessagesById: Object.fromEntries(
      (repliesResult.data || []).map((message) => [message.id, message]),
    ),
    reactionsByMessageId,
  }
}

export async function toggleMessageReaction(client, messageId, userId, reactionType) {
  const { data: existing, error: lookupError } = await client
    .from('message_reactions')
    .select('id, reaction_type')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing?.reaction_type === reactionType) {
    const { error } = await client
      .from('message_reactions')
      .delete()
      .eq('id', existing.id)

    if (error) throw error
    return null
  }

  if (existing) {
    const { data, error } = await client
      .from('message_reactions')
      .update({ reaction_type: reactionType })
      .eq('id', existing.id)
      .select('id, message_id, user_id, reaction_type, created_at')
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await client
    .from('message_reactions')
    .insert({
      message_id: messageId,
      user_id: userId,
      reaction_type: reactionType,
    })
    .select('id, message_id, user_id, reaction_type, created_at')
    .single()

  if (error) throw error
  return data
}
