import { getSupabaseClient } from './supabase.js'

/**
 * Service for QORVEXA Instants: camera-first spontaneous photo sharing with view-once and 24h expiration.
 */

export async function fetchActiveInstants() {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('get_active_instants_inbox')
  if (error) throw error
  return data || []
}

export async function fetchSentInstants() {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('get_sent_instants_archive')
  if (error) throw error
  return data || []
}

export async function consumeAndViewInstant(instantId) {
  const client = getSupabaseClient()
  // 1. Atomic backend claim
  const { data, error } = await client.rpc('consume_and_view_instant', { p_instant_id: instantId })
  if (error) throw error

  // 2. Generate short-lived (60s) signed URL for private image
  if (data?.image_path) {
    const { data: signedData, error: signError } = await client.storage
      .from('qorvexa-instants')
      .createSignedUrl(data.image_path, 60)
    if (!signError && signedData?.signedUrl) {
      data.signedUrl = signedData.signedUrl
    }
  }

  return data
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
    // Attempt cleanup if RPC fails
    await client.storage.from('qorvexa-instants').remove([imagePath]).catch(() => {})
    throw rpcError
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

export async function setCloseFriend(friendId, isClose) {
  const client = getSupabaseClient()
  const { data, error } = await client.rpc('set_close_friend', {
    p_friend_id: friendId,
    p_is_close: isClose,
  })
  if (error) throw error
  return data
}

export async function getInstantSignedUrl(imagePath) {
  if (!imagePath) return ''
  const client = getSupabaseClient()
  const { data, error } = await client.storage
    .from('qorvexa-instants')
    .createSignedUrl(imagePath, 60)
  if (error) throw error
  return data?.signedUrl || ''
}
