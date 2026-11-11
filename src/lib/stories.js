import { getSupabaseClient } from './supabase.js'

/**
 * ============================================================================
 * QORVEXA STORIES ENGINE (Service Layer)
 * Complete, modern social stories system:
 * - 24-hour visual posts with camera capture, gallery upload, and text stories
 * - Story Studio: multi-slide composer, typography styles, canvas draw, stickers
 * - Stories Lounge: editorial layout, active rings, story insights, archive
 * - Immersive Viewer: segmented progress, press-to-pause, reactions & replies
 * - Realtime synchronization across Web and Android Messenger
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. Stories Retrieval & Discovery
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// 2. Story Archive & Insights
// ----------------------------------------------------------------------------

export async function fetchStoryArchive(userId) {
  if (!userId) return []
  const client = getSupabaseClient()

  try {
    const { data, error } = await client
      .from('instants')
      .select(`
        id,
        sender_id,
        image_path,
        caption,
        audience_type,
        created_at,
        expires_at,
        instant_recipients (
          id,
          recipient_id,
          is_viewed,
          viewed_at,
          profiles:recipient_id (id, username, display_name, avatar_url)
        )
      `)
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[stories] fetchStoryArchive error:', error.message)
      return []
    }

    const now = new Date()
    return (data || [])
      .filter((item) => item.is_story === true || item.image_path?.includes('/story_'))
      .map((item) => {
        const recipients = item.instant_recipients || []
        const viewers = recipients.filter((r) => r.is_viewed)
        const isExpired = new Date(item.expires_at) <= now

        return {
          id: item.id,
          sender_id: item.sender_id,
          image_path: item.image_path,
          caption: item.caption,
          audience_type: item.audience_type,
          created_at: item.created_at,
          expires_at: item.expires_at,
          is_expired: isExpired,
          is_story: true,
          view_count: viewers.length,
          recipients_count: recipients.length,
          viewers: viewers.map((v) => ({
            id: v.profiles?.id || v.recipient_id,
            username: v.profiles?.username || 'member',
            display_name: v.profiles?.display_name || v.profiles?.username || 'Member',
            avatar_url: v.profiles?.avatar_url,
            viewed_at: v.viewed_at,
          })),
        }
      })
  } catch (err) {
    console.warn('[stories] fetchStoryArchive exception:', err)
    return []
  }
}

export async function deleteStory(storyId, userId) {
  if (!storyId || !userId) throw new Error('Missing story ID or user ID.')
  const client = getSupabaseClient()

  // 1. Delete associated recipients
  await client
    .from('instant_recipients')
    .delete()
    .eq('instant_id', storyId)
    .catch(() => {})

  // 2. Delete story record
  const { error } = await client
    .from('instants')
    .delete()
    .eq('id', storyId)
    .eq('sender_id', userId)

  if (error) {
    throw new Error(`Failed to delete story: ${error.message}`)
  }

  return { success: true }
}

export async function repostStoryFromArchive({ imagePath, caption, audienceType = 'friends', userId }) {
  if (!imagePath || !userId) throw new Error('Missing image path or user ID.')
  const client = getSupabaseClient()

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const payload = {
    sender_id: userId,
    image_path: imagePath,
    caption: caption || null,
    audience_type: audienceType,
    expires_at: expiresAt,
    is_story: true,
  }

  let { data: storyRow, error: insertError } = await client
    .from('instants')
    .insert(payload)
    .select('id, expires_at')
    .single()

  if (insertError) {
    // Retry without is_story in case schema cache is pending
    const fallbackPayload = {
      sender_id: userId,
      image_path: imagePath,
      caption: caption || null,
      audience_type: audienceType,
      expires_at: expiresAt,
    }
    const res = await client
      .from('instants')
      .insert(fallbackPayload)
      .select('id, expires_at')
      .single()
    if (res.error) throw res.error
    storyRow = res.data
  }

  await populateStoryRecipients({ storyId: storyRow.id, audienceType, userId })

  return {
    story_id: storyRow.id,
    expires_at: storyRow.expires_at,
  }
}

// ----------------------------------------------------------------------------
// 3. Story Creation & Multi-Slide Publishing
// ----------------------------------------------------------------------------

export async function createStory({ imageBlob, caption = '', audienceType = 'friends', userId }) {
  if (!imageBlob) throw new Error('Story image is required.')
  if (!userId) throw new Error('User authentication required.')

  const client = getSupabaseClient()
  const imagePath = `${userId}/story_${crypto.randomUUID()}.jpg`

  // 1. Upload to private storage bucket
  const { error: uploadError } = await client.storage
    .from('qorvexa-instants')
    .upload(imagePath, imageBlob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 2. Authoritative RPC check
  try {
    const { data, error: rpcError } = await client.rpc('create_story', {
      p_image_path: imagePath,
      p_caption: caption.trim() || null,
      p_audience_type: audienceType,
    })
    if (!rpcError && data) return data
  } catch (_) {}

  // 3. Resilient Direct Table Insert
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const basePayload = {
    sender_id: userId,
    image_path: imagePath,
    caption: caption.trim() || null,
    audience_type: audienceType,
    expires_at: expiresAt,
  }

  let storyRow = null
  const withStoryResult = await client
    .from('instants')
    .insert({ ...basePayload, is_story: true })
    .select('id, expires_at')
    .single()

  if (!withStoryResult.error) {
    storyRow = withStoryResult.data
  } else {
    const fallbackResult = await client
      .from('instants')
      .insert(basePayload)
      .select('id, expires_at')
      .single()
    if (fallbackResult.error) throw fallbackResult.error
    storyRow = fallbackResult.data
  }

  // 4. Populate recipients
  await populateStoryRecipients({ storyId: storyRow.id, audienceType, userId })

  return {
    story_id: storyRow.id,
    expires_at: storyRow.expires_at,
  }
}

export async function publishBatchStories({ slides = [], userId, onProgress }) {
  if (!slides.length) throw new Error('No stories to publish.')
  if (!userId) throw new Error('User authentication required.')

  const results = []
  const total = slides.length

  for (let i = 0; i < total; i++) {
    const slide = slides[i]
    if (onProgress) {
      onProgress({ current: i + 1, total, percent: Math.round(((i) / total) * 100) })
    }

    const result = await createStory({
      imageBlob: slide.imageBlob,
      caption: slide.caption || '',
      audienceType: slide.audienceType || 'friends',
      userId,
    })
    results.push(result)
  }

  if (onProgress) {
    onProgress({ current: total, total, percent: 100 })
  }

  return results
}

async function populateStoryRecipients({ storyId, audienceType, userId }) {
  const client = getSupabaseClient()
  try {
    if (audienceType === 'close_friends') {
      const { data: closeFriends } = await client
        .from('close_friends')
        .select('friend_id')
        .eq('user_id', userId)

      if (closeFriends?.length) {
        const recipients = closeFriends.map((cf) => ({
          instant_id: storyId,
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
          instant_id: storyId,
          recipient_id: f.user_low === userId ? f.user_high : f.user_low,
        }))
        await client.from('instant_recipients').insert(recipients).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[stories] populateStoryRecipients warning:', err)
  }
}

// ----------------------------------------------------------------------------
// 4. Story Viewing & Realtime Signed URLs
// ----------------------------------------------------------------------------

export async function getStorySignedUrl(imagePath) {
  if (!imagePath) return null
  const client = getSupabaseClient()

  // First try signed URL from private bucket
  const { data, error } = await client.storage
    .from('qorvexa-instants')
    .createSignedUrl(imagePath, 3600)

  if (!error && data?.signedUrl) {
    return data.signedUrl
  }

  // Fallback to public URL if configured
  const { data: publicData } = client.storage
    .from('qorvexa-instants')
    .getPublicUrl(imagePath)

  return publicData?.publicUrl || null
}

export async function consumeAndViewStory(storyId, isOwn = false, ownProfile = null) {
  const client = getSupabaseClient()

  // 1. Authoritative RPC check
  try {
    const { data, error } = await client.rpc('claim_instant_view', { p_instant_id: storyId })
    if (!error && data?.authorized) {
      return {
        id: data.instant_id,
        signedUrl: data.signed_url,
        caption: data.caption,
        created_at: data.created_at,
        expires_at: data.expires_at,
        audience_type: data.audience_type,
        sender: {
          id: data.sender_id,
          username: data.sender_username,
          display_name: data.sender_display_name,
          avatar_url: data.sender_avatar_url,
        },
      }
    }
  } catch (_) {}

  // 2. Resilient Direct Table Retrieval
  const { data: storyRow, error: fetchErr } = await client
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
    .single()

  if (fetchErr || !storyRow) {
    throw new Error('Story not found or expired.')
  }

  if (new Date(storyRow.expires_at) <= new Date()) {
    throw new Error('This story has expired.')
  }

  // 3. Mark viewed if viewer is not the author
  if (!isOwn) {
    const { data: authData } = await client.auth.getUser()
    const viewerId = authData?.user?.id
    if (viewerId) {
      await client
        .from('instant_recipients')
        .update({
          is_viewed: true,
          viewed_at: new Date().toISOString(),
        })
        .eq('instant_id', storyId)
        .eq('recipient_id', viewerId)
        .catch(() => {})
    }
  }

  // 4. Generate signed media URL
  const signedUrl = await getStorySignedUrl(storyRow.image_path)
  if (!signedUrl) throw new Error('Unable to generate secure story URL.')

  return {
    id: storyRow.id,
    signedUrl,
    image_path: storyRow.image_path,
    caption: storyRow.caption,
    created_at: storyRow.created_at,
    expires_at: storyRow.expires_at,
    audience_type: storyRow.audience_type,
    sender: isOwn
      ? ownProfile || storyRow.profiles
      : storyRow.profiles || {
          id: storyRow.sender_id,
          username: 'Member',
          display_name: 'Member',
          avatar_url: null,
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

// ----------------------------------------------------------------------------
// 5. Story Reactions & Replies (Integrated with Messenger)
// ----------------------------------------------------------------------------

export async function reactToStory(storyId, emoji) {
  if (!storyId || !emoji) return null
  const client = getSupabaseClient()
  const { data: authData } = await client.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) return null

  try {
    await client
      .from('instant_recipients')
      .update({ reaction: emoji })
      .eq('instant_id', storyId)
      .eq('recipient_id', userId)
  } catch (_) {}

  return { success: true }
}

// Aliases for seamless backward compatibility
export const reactToInstant = reactToStory
export const consumeAndViewInstant = consumeAndViewStory

export async function sendStoryReply({ storyId, storyOwnerId, content = '', reaction = null, storySnapshot = {} }) {
  if (!storyOwnerId) throw new Error('Missing story owner ID.')
  if (!content && !reaction) throw new Error('Reply content or reaction is required.')

  const client = getSupabaseClient()
  const { data: authData } = await client.auth.getUser()
  const senderId = authData?.user?.id
  if (!senderId) throw new Error('User must be authenticated.')
  if (senderId === storyOwnerId) throw new Error('You cannot reply to your own story.')

  // 1. Authoritative RPC check
  try {
    const { data, error } = await client.rpc('send_story_reply_message', {
      p_story_id: storyId,
      p_story_owner_id: storyOwnerId,
      p_content: content,
      p_reaction: reaction,
      p_story_snapshot: storySnapshot,
    })
    if (!error && data?.conversation_id) return data
  } catch (_) {}

  // 2. Resilient Direct Messenger Integration
  const [userA, userB] = senderId < storyOwnerId ? [senderId, storyOwnerId] : [storyOwnerId, senderId]

  let convId = null
  const { data: existingConv } = await client
    .from('conversations')
    .select('id')
    .eq('user_low', userA)
    .eq('user_high', userB)
    .maybeSingle()

  if (existingConv) {
    convId = existingConv.id
  } else {
    const { data: newConv, error: createConvErr } = await client
      .from('conversations')
      .insert({ user_low: userA, user_high: userB })
      .select('id')
      .single()

    if (createConvErr) throw createConvErr
    convId = newConv.id
  }

  // 3. Format message content
  let displayContent = content
  if (reaction && !content) {
    displayContent = `Reacted ${reaction} to your story`
  }

  const metadata = {
    story_id: storyId,
    story_owner_id: storyOwnerId,
    reaction: reaction || null,
    image_path: storySnapshot?.image_path || null,
    caption: storySnapshot?.caption || null,
    expires_at: storySnapshot?.expires_at || null,
    is_expired: false,
  }

  const baseMessage = {
    conversation_id: convId,
    sender_id: senderId,
    content: displayContent,
  }

  let messageResult = null
  const fullMessage = {
    ...baseMessage,
    message_type: 'story_reply',
    story_id: storyId,
    story_metadata: metadata,
  }

  const primaryInsert = await client
    .from('messages')
    .insert(fullMessage)
    .select('id, conversation_id, created_at')
    .single()

  if (!primaryInsert.error) {
    messageResult = primaryInsert.data
  } else {
    const fallbackContent = `[Story Reply] ${displayContent}`
    const fallbackInsert = await client
      .from('messages')
      .insert({ ...baseMessage, content: fallbackContent })
      .select('id, conversation_id, created_at')
      .single()

    if (fallbackInsert.error) throw fallbackInsert.error
    messageResult = fallbackInsert.data
  }

  // Update conversation last_activity_at
  await client
    .from('conversations')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', convId)
    .catch(() => {})

  return {
    conversation_id: convId,
    message_id: messageResult.id,
  }
}

export async function getStoryForViewer(storyId) {
  if (!storyId) return { available: false, reason: 'missing_id' }
  const client = getSupabaseClient()

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
