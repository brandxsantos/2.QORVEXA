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
        is_story,
        profiles:sender_id (id, username, display_name, avatar_url)
      )
    `)
    .eq('instants.is_story', true)
    .gt('instants.expires_at', now)

  if (error) {
    console.warn('[stories] fallback query warning:', error.message)
    return []
  }

  return (data || []).map((row) => ({
    id: row.instants.id,
    sender_id: row.instants.sender_id,
    audience_type: row.instants.audience_type,
    caption: row.instants.caption,
    created_at: row.instants.created_at,
    expires_at: row.instants.expires_at,
    is_viewed: row.is_viewed,
    viewed_at: row.viewed_at,
    is_story: true,
    sender: row.instants.profiles,
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
    .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at, is_story')
    .eq('sender_id', userId)
    .eq('is_story', true)
    .gt('expires_at', now)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[stories] fallback own query warning:', error.message)
    return []
  }

  return (data || []).map((item) => ({ ...item, is_own: true, is_story: true }))
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
    if (!rpcError) return data
  } catch (_) {}

  // Fallback to create_instant if create_story RPC is pending
  const { data, error: fbError } = await client.rpc('create_instant', {
    p_image_path: imagePath,
    p_caption: caption.trim() || null,
    p_audience_type: audienceType,
  })

  if (fbError) {
    await client.storage.from('qorvexa-instants').remove([imagePath]).catch(() => {})
    throw fbError
  }

  return data
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
    if (!error && Array.isArray(data)) return data
  } catch (_) {}

  if (!userId) return []
  const { data, error } = await client
    .from('instants')
    .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at, is_story')
    .eq('sender_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[instants] Failed to fetch own active instants:', error.message)
    return []
  }

  return (data || []).map((item) => ({ ...item, is_own: true }))
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
      .select('id, sender_id, image_path, caption, audience_type, created_at, expires_at, is_story')
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
