import { getSupabaseClient } from './supabase.js'

export const ATTACHMENT_BUCKET = 'qorvexa-attachments'
export const MAX_ATTACHMENT_SIZE = 52428800 // 50 MB

export const PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
])

/**
 * Categorizes an uploaded file into 'photo' | 'video' | 'file'.
 */
export function detectAttachmentType(file) {
  const mime = (file.type || '').toLowerCase()
  if (PHOTO_MIME_TYPES.has(mime) || mime.startsWith('image/')) return 'photo'
  if (VIDEO_MIME_TYPES.has(mime) || mime.startsWith('video/')) return 'video'

  const ext = (file.name || '').split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'photo'
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)) return 'video'

  return 'file'
}

/**
 * Returns a friendly formatted file size string (e.g. "1.4 MB", "420 KB").
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)
  return `${val} ${units[i]}`
}

/**
 * Returns the uppercase file extension (e.g. "PDF", "DOCX", "ZIP").
 */
export function getFileExtension(filename = '') {
  const parts = filename.split('.')
  if (parts.length <= 1) return 'FILE'
  return parts.pop().toUpperCase().slice(0, 5)
}

/**
 * Uploads a single file to the private qorvexa-attachments bucket.
 */
export async function uploadAttachmentFile(client, { conversationId, senderId, file }) {
  if (!file) throw new Error('No file provided for upload.')
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`"${file.name}" exceeds the maximum allowed file size of 50 MB.`)
  }

  const type = detectAttachmentType(file)
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || (type === 'photo' ? 'jpg' : type === 'video' ? 'mp4' : 'bin')
  const storagePath = `${conversationId}/${senderId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) throw uploadError

  return {
    storage_path: storagePath,
    original_filename: file.name || `attachment.${ext}`,
    mime_type: file.type || 'application/octet-stream',
    file_size: file.size,
    attachment_type: type,
    metadata: {
      client_timestamp: new Date().toISOString(),
    },
  }
}

/**
 * Loads attachments for a set of message IDs and creates signed URLs.
 */
export async function loadMessageAttachments(client, messageIds = [], expiresIn = 3600) {
  const uniqueIds = [...new Set(messageIds.filter(Boolean))]
  if (!uniqueIds.length) return {}

  const { data, error } = await client
    .from('message_attachments')
    .select('id, message_id, conversation_id, sender_id, storage_path, original_filename, mime_type, file_size, attachment_type, thumbnail_path, metadata, created_at')
    .in('message_id', uniqueIds)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[messageAttachments] Failed to load attachments:', error.message)
    return {}
  }

  const attachments = data || []
  if (!attachments.length) return {}

  // Generate signed URLs in batch
  const paths = attachments.map((a) => a.storage_path)
  const { data: signedUrlsData, error: signError } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, expiresIn)

  const signedUrlByPath = {}
  if (!signError && signedUrlsData) {
    signedUrlsData.forEach((item) => {
      if (item?.path && item?.signedUrl) {
        signedUrlByPath[item.path] = item.signedUrl
      }
    })
  }

  // Group by message_id
  const attachmentsByMessageId = {}
  attachments.forEach((att) => {
    const signedUrl = signedUrlByPath[att.storage_path] || ''
    const withUrl = { ...att, signedUrl }
    if (!attachmentsByMessageId[att.message_id]) {
      attachmentsByMessageId[att.message_id] = []
    }
    attachmentsByMessageId[att.message_id].push(withUrl)
  })

  return attachmentsByMessageId
}

/**
 * Loads shared media for a conversation filtered by type ('photo' | 'video' | 'file' | 'all').
 */
export async function getSharedMediaGallery(client, { conversationId, type = 'all', limit = 60, beforeTimestamp = null, expiresIn = 3600 }) {
  if (!conversationId) return []

  let query = client
    .from('message_attachments')
    .select('id, message_id, conversation_id, sender_id, storage_path, original_filename, mime_type, file_size, attachment_type, thumbnail_path, metadata, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type && type !== 'all') {
    query = query.eq('attachment_type', type)
  }

  if (beforeTimestamp) {
    query = query.lt('created_at', beforeTimestamp)
  }

  const { data, error } = await query
  if (error) throw error

  const items = data || []
  if (!items.length) return []

  // Generate signed URLs in batch
  const paths = items.map((a) => a.storage_path)
  const { data: signedUrlsData } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, expiresIn)

  const signedUrlByPath = {}
  if (signedUrlsData) {
    signedUrlsData.forEach((item) => {
      if (item?.path && item?.signedUrl) {
        signedUrlByPath[item.path] = item.signedUrl
      }
    })
  }

  return items.map((item) => ({
    ...item,
    signedUrl: signedUrlByPath[item.storage_path] || '',
  }))
}

/**
 * Deletes an attachment and cleans up its storage object.
 */
export async function deleteAttachment(client, attachment) {
  if (!attachment) return

  // 1. Delete database record
  await client
    .from('message_attachments')
    .delete()
    .eq('id', attachment.id)

  // 2. Remove storage object
  if (attachment.storage_path) {
    await client.storage
      .from(ATTACHMENT_BUCKET)
      .remove([attachment.storage_path])
      .catch(() => {})
  }
}
