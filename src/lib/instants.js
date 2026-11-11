import { getSupabaseClient } from './supabase.js'

/**
 * Service for QORVEXA Stories & Instants:
 * - Stories: 24-hour visual posts with gallery/camera upload, repeat viewing while active, segmented navigation.
 * - Instants: Camera-first spontaneous snaps with recipient-specific view-once authorization.
 */

// ==========================================
// 1. STORIES SERVICE
// ==========================================

export async function fetchActiveStories() {
  const client = getSupabaseClient()
  try {
    const { data, error } = await client.rpc('get_active_stories_inbox')
    if (!error && Array.isArray(data)) return data
  } catch (_) {}

  // Fallback direct table query
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('instant_recipients')
    .select(`
      id,
      instant_id,
      is_viewed,
      viewed_at,
      instants!inner (
        id,
        sender_id,
        image_path,
        caption,
        audience_type,
        created_at,
        expires_at,
        profiles:sender_id (id, username, display_name, avatar_url)
      )
    `)
    .gt('instants.expires_at', now)

  if (error) {
    console.warn('[stories] fallback query warning:', error.message)
    return []
  }

  return (data || [])
    .filter((row) => row.instants && (row.instants.is_story === true || row.instants.image_path?.includes('/story_')))
    .map((row) => ({
      id: row.instants.id,
      sender_id: row.instants.sender_id,
      audience_type: row.instants.audience_type,
      caption: row.instants.caption,
      created_at: row.instants.created_at,
      expires_at: row.instants.expires_at,
      is_viewed: row.is_viewed,
      viewed_at: row.viewed_at,
      is_story: true,
      sender: row.instants.profiles || {
        id: row.instants.sender_id,
        username: 'Member',
        display_name: 'Member',
        avatar_url: null,
      },
    }))
}

export async function fetchMyActiveStories(userId) {
  const client = getSupabaseClient()
  try {
    const { data, error } = await client.rpc('get_my_active_stories')
    if (!error && Array.isArray(data)) return data
    if (error) console.warn('[stories] get_my_active_stories RPC warning:', error.message)
  } catch (_) {}

  if (!userId) return []
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('instants')
    .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at')
    .eq('sender_id', userId)
    .gt('expires_at', now)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[stories] fallback own query warning:', error.message)
    return []
  }

  return (data || [])
    .filter((item) => item.is_story === true || item.image_path?.includes('/story_'))
    .map((item) => ({ ...item, is_own: true, is_story: true }))
}

export async function createStory({ imageBlob, caption = '', audienceType = 'friends', userId }) {
  if (!imageBlob) throw new Error('Story image is required.')
  if (!userId) throw new Error('User authentication required.')

  const client = getSupabaseClient()
  const imagePath = `${userId}/story_${crypto.randomUUID()}.jpg`

  // 1. Upload to private storage
  const { error: uploadError } = await client.storage
    .from('qorvexa-instants')
    .upload(imagePath, imageBlob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 2. Authoritative RPC
  try {
    const { data, error: rpcError } = await client.rpc('create_story', {
      p_image_path: imagePath,
      p_caption: caption.trim() || null,
      p_audience_type: audienceType,
    })
    if (!rpcError && data) return data
    if (rpcError) console.warn('[stories] create_story RPC returned error, attempting fallback insert:', rpcError.message)
  } catch (rpcEx) {
    console.warn('[stories] create_story RPC exception:', rpcEx)
  }

  // 3. Resilient Fallback Direct Insert (handles with or without is_story in schema cache)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const basePayload = {
    sender_id: userId,
    image_path: imagePath,
    caption: caption.trim() || null,
    audience_type: audienceType,
    expires_at: expiresAt,
  }

  let storyRow = null

  // Attempt insert with is_story: true
  const { data: rowWithStory, error: insertError } = await client
    .from('instants')
    .insert({ ...basePayload, is_story: true })
    .select('id, expires_at')
    .single()

  if (insertError) {
    // If is_story is missing from schema cache, fall back to base insert
    if (
      insertError.code === '42703' ||
      insertError.code === 'PGRST204' ||
      insertError.message?.includes('is_story') ||
      insertError.message?.includes('schema cache')
    ) {
      const { data: baseRow, error: baseErr } = await client
        .from('instants')
        .insert(basePayload)
        .select('id, expires_at')
        .single()

      if (baseErr) {
        await client.storage.from('qorvexa-instants').remove([imagePath]).catch(() => {})
        throw baseErr
      }
      storyRow = baseRow
    } else {
      await client.storage.from('qorvexa-instants').remove([imagePath]).catch(() => {})
      throw insertError
    }
  } else {
    storyRow = rowWithStory
  }

  // Populate recipients for fallback
  try {
    if (audienceType === 'close_friends') {
      const { data: closeFriends } = await client
        .from('close_friends')
        .select('friend_id')
        .eq('user_id', userId)

      if (closeFriends?.length) {
        const recipients = closeFriends.map((cf) => ({
          instant_id: storyRow.id,
          recipient_id: cf.friend_id,
        }))
        await client.from('instant_recipients').insert(recipients).catch(() => {})
      }
    } else {
      const { data: friendships } = await client
        .from('friendships')
        .select('user_low, user_high')
        .or(`user_low.eq.${userId},user_high.eq.${userId}`)

      if (friendships?.length) {
        const recipients = friendships.map((f) => ({
          instant_id: storyRow.id,
          recipient_id: f.user_low === userId ? f.user_high : f.user_low,
        }))
        await client.from('instant_recipients').insert(recipients).catch(() => {})
      }
    }
  } catch (recipErr) {
    console.warn('[stories] Fallback recipient population warning:', recipErr)
  }

  return {
    story_id: storyRow.id,
    expires_at: storyRow.expires_at,
  }
}

// ==========================================
// 2. INSTANTS SERVICE (Camera-First & View-Once)
// ==========================================

export async function fetchActiveInstants() {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('get_active_instants_inbox')
  if (error) throw error
  return data || []
}

export async function fetchMyActiveInstants(userId) {
  const client = getSupabaseClient()
  try {
    const { data, error } = await client.rpc('get_my_active_instants')
    if (!error && Array.isArray(data)) {
      return (data || []).filter((item) => item.is_story !== true && !item.image_path?.includes('/story_'))
    }
  } catch (_) {}

  if (!userId) return []
  const { data, error } = await client
    .from('instants')
    .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at')
    .eq('sender_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[instants] Failed to fetch own active instants:', error.message)
    return []
  }

  return (data || [])
    .filter((item) => item.is_story !== true && !item.image_path?.includes('/story_'))
    .map((item) => ({ ...item, is_own: true, is_story: false }))
}

export async function fetchSentInstants() {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('get_sent_instants_archive')
  if (error) throw error
  return data || []
}

export async function sendInstant({ imageBlob, caption = '', audienceType = 'friends', userId }) {
  if (!imageBlob) throw new Error('Photo capture is required.')
  if (!userId) throw new Error('User authentication required.')

  const client = getSupabaseClient()
  const imagePath = `${userId}/${crypto.randomUUID()}.jpg`

  // 1. Upload to private storage
  const { error: uploadError } = await client.storage
    .from('qorvexa-instants')
    .upload(imagePath, imageBlob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 2. Authoritative RPC creation & recipient distribution
  const { data, error: rpcError } = await client.rpc('create_instant', {
    p_image_path: imagePath,
    p_caption: caption.trim() || null,
    p_audience_type: audienceType,
  })

  if (rpcError) {
    await client.storage.from('qorvexa-instants').remove([imagePath]).catch(() => {})
    throw rpcError
  }

  return data
}

// ==========================================
// 3. COMMON VIEW & INTERACTION SERVICES
// ==========================================

export async function consumeAndViewInstant(instantId, isOwn = false, ownProfile = null) {
  const client = getSupabaseClient()

  // If known to be own story/instant
  if (isOwn) {
    try {
      const { data, error } = await client.rpc('consume_and_view_instant', { p_instant_id: instantId })
      if (!error && data) {
        if (data.image_path) {
          const { data: signedData } = await client.storage
            .from('qorvexa-instants')
            .createSignedUrl(data.image_path, 120)
          if (signedData?.signedUrl) data.signedUrl = signedData.signedUrl
        }
        return data
      }
    } catch (_) {}

    // Fallback direct load for sender
    const { data: instant, error } = await client
      .from('instants')
      .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at')
      .eq('id', instantId)
      .single()

    if (error) throw error

    let signedUrl = ''
    if (instant.image_path) {
      const { data: signedData } = await client.storage
        .from('qorvexa-instants')
        .createSignedUrl(instant.image_path, 120)
      signedUrl = signedData?.signedUrl || ''
    }

    return {
      ...instant,
      signedUrl,
      is_own: true,
      sender: {
        id: ownProfile?.id || instant.sender_id,
        username: ownProfile?.username || 'You',
        display_name: ownProfile?.display_name || 'You',
        avatar_url: ownProfile?.avatar_url || null,
      },
    }
  }

  // Atomic backend claim
  const { data, error } = await client.rpc('consume_and_view_instant', { p_instant_id: instantId })
  if (error) throw error

  // Generate short-lived (120s) signed URL for private image
  if (data?.image_path) {
    const { data: signedData, error: signError } = await client.storage
      .from('qorvexa-instants')
      .createSignedUrl(data.image_path, 120)
    if (!signError && signedData?.signedUrl) {
      data.signedUrl = signedData.signedUrl
    }
  }

  return data
}

export async function reactToInstant(instantId, reaction) {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('set_instant_reaction', {
    p_instant_id: instantId,
    p_reaction: reaction || null,
  })
  if (error) throw error
  return data
}

export async function fetchCloseFriends() {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('get_close_friends')
  if (error) throw error
  return data || []
}

export async function toggleCloseFriend(friendId, isCloseFriend) {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('set_close_friend', {
    p_friend_id: friendId,
    p_is_close_friend: isCloseFriend,
  })
  if (error) throw error
  return data
}

export const setCloseFriend = toggleCloseFriend

// ==========================================
// 4. STORY REPLIES & STORY VIEWER INTEGRATION
// ==========================================

export async function sendStoryReply({ storyId, storyOwnerId, content = '', reaction = null, storySnapshot = null }) {
  if (!storyId) throw new Error('Story ID is required.')
  const client = getSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Authentication required.')

  const cleanContent = (content || '').trim() || reaction
  if (!cleanContent) throw new Error('Reply content or reaction is required.')

  // 1. Try authoritative RPC
  try {
    const { data, error } = await client.rpc('send_story_reply', {
      p_story_id: storyId,
      p_content: content ? content.trim() : null,
      p_reaction: reaction ? reaction.trim() : null,
    })
    if (!error && data?.success) return data
    if (error && !error.message?.includes('function') && !error.message?.includes('not found') && !error.message?.includes('does not exist')) {
      throw error
    }
  } catch (rpcErr) {
    if (!rpcErr.message?.includes('function') && !rpcErr.message?.includes('not found') && !rpcErr.message?.includes('does not exist')) {
      throw rpcErr
    }
  }

  // 2. Fallback: retrieve or create conversation and insert directly
  if (!storyOwnerId) {
    const { data: storyRow } = await client
      .from('instants')
      .select('sender_id, image_path, caption, expires_at')
      .eq('id', storyId)
      .maybeSingle()
    if (storyRow) {
      storyOwnerId = storyRow.sender_id
      if (!storySnapshot) {
        storySnapshot = {
          story_id: storyId,
          image_path: storyRow.image_path,
          caption: storyRow.caption,
          sender_id: storyRow.sender_id,
          expires_at: storyRow.expires_at,
          reaction: reaction || null,
        }
      }
    }
  }

  if (!storyOwnerId) throw new Error('Story owner not found.')
  if (storyOwnerId === user.id) throw new Error('Cannot reply to your own story.')

  // Find or create conversation
  let conversationId = null
  const { data: convRpcId, error: convErr } = await client.rpc('start_direct_conversation', {
    target_user_id: storyOwnerId,
  })
  if (!convErr && convRpcId) {
    conversationId = convRpcId
  } else {
    const low = user.id < storyOwnerId ? user.id : storyOwnerId
    const high = user.id < storyOwnerId ? storyOwnerId : user.id
    const { data: existingConv } = await client
      .from('conversations')
      .select('id')
      .eq('user_low', low)
      .eq('user_high', high)
      .maybeSingle()
    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: newConvErr } = await client
        .from('conversations')
        .insert({ user_low: low, user_high: high })
        .select('id')
        .single()
      if (newConvErr) throw newConvErr
      conversationId = newConv.id
    }
  }

  const meta = storySnapshot || {
    story_id: storyId,
    reaction: reaction || null,
  }

  let insertedMsg = null
  const fullPayload = {
    conversation_id: conversationId,
    sender_id: user.id,
    content: cleanContent,
    message_type: 'story_reply',
    story_id: storyId,
    story_metadata: meta,
  }

  const { data: fullMsg, error: msgErr } = await client
    .from('messages')
    .insert(fullPayload)
    .select('id, conversation_id, sender_id, content, created_at')
    .single()

  if (msgErr) {
    // If schema cache does not have story reply columns, fallback to standard message
    if (
      msgErr.code === '42703' ||
      msgErr.code === 'PGRST204' ||
      msgErr.message?.includes('schema cache') ||
      msgErr.message?.includes('story_id') ||
      msgErr.message?.includes('message_type')
    ) {
      const { data: baseMsg, error: baseErr } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: cleanContent,
        })
        .select('id, conversation_id, sender_id, content, created_at')
        .single()
      if (baseErr) throw baseErr
      insertedMsg = baseMsg
    } else {
      throw msgErr
    }
  } else {
    insertedMsg = fullMsg
  }

  await client
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .catch(() => {})

  return {
    success: true,
    message_id: insertedMsg.id,
    conversation_id: conversationId,
    story_id: storyId,
  }
}

export async function getStoryForViewer(storyId) {
  if (!storyId) return { available: false, reason: 'not_found' }
  const client = getSupabaseClient()

  // 1. Try authoritative RPC
  try {
    const { data, error } = await client.rpc('get_story_for_viewer', {
      p_story_id: storyId,
    })
    if (!error && data) return data
  } catch (_) {}

  // 2. Fallback direct table query
  const { data: story, error } = await client
    .from('instants')
    .select(`
      id,
      sender_id,
      image_path,
      caption,
      audience_type,
      created_at,
      expires_at,
      profiles:sender_id (id, username, display_name, avatar_url)
    `)
    .eq('id', storyId)
    .maybeSingle()

  if (error || !story) return { available: false, reason: 'not_found' }
  if (new Date(story.expires_at) <= new Date()) return { available: false, reason: 'expired' }

  return {
    available: true,
    story: {
      ...story,
      is_story: true,
      sender: story.profiles,
    },
  }
}

export async function fetchStoryViewers(storyId) {
  if (!storyId) return []
  const client = getSupabaseClient()
  try {
    const { data, error } = await client
      .from('instant_recipients')
      .select(`
        recipient_id,
        viewed_at,
        profiles:recipient_id (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('instant_id', storyId)
      .eq('is_viewed', true)
      .order('viewed_at', { ascending: false })

    if (error) {
      console.warn('[stories] Error fetching story viewers:', error.message)
      return []
    }

    return (data || []).map((row) => ({
      id: row.profiles?.id || row.recipient_id,
      username: row.profiles?.username || 'member',
      display_name: row.profiles?.display_name || row.profiles?.username || 'Member',
      avatar_url: row.profiles?.avatar_url,
      viewed_at: row.viewed_at,
    }))
  } catch (err) {
    console.warn('[stories] fetchStoryViewers exception:', err)
    return []
  }
}

