/**
 * Notification loading pipeline — extracted from NotificationsPage.tsx
 * for reuse by both the page component and the prefetch cache.
 *
 * Contains the full pipeline: getNotifications → categorize URIs →
 * parallel batch fetch → resolve reposts → attach posts to notifications.
 * No React state, no updateSeenNotifications, no follow status checking.
 */

import { BskyAgent, AppBskyNotificationListNotifications, AppBskyFeedDefs } from '@atproto/api'
import { getNotifications } from './notifications'
import log from '../utils/logger'

type Notification = AppBskyNotificationListNotifications.Notification

export interface NotificationWithPost extends Notification {
  post?: AppBskyFeedDefs.PostView
  parentPost?: AppBskyFeedDefs.PostView
  replyParentAuthor?: { displayName?: string; handle: string }
}

export interface LoadNotificationsResult {
  notifications: NotificationWithPost[]
  cursor?: string
}

/**
 * Load notifications with their associated posts resolved.
 *
 * Pipeline: fetch notifications → categorize URIs (direct post URIs,
 * reply/mention parent URIs, reply post URIs, repost URIs needing resolution)
 * → parallel batch fetch (direct posts + reply parents + reply posts)
 * simultaneously with repost URI resolution → batch fetch resolved repost
 * posts → attach posts to notifications.
 */
export async function loadNotificationsWithPosts(
  agent: BskyAgent,
  options: {
    cursor?: string
    limit?: number
    onRateLimit?: (info: { retryAfter?: number; message?: string }) => void
  } = {}
): Promise<LoadNotificationsResult> {
  const { notifications: newNotifications, cursor: newCursor } = await getNotifications(agent, {
    cursor: options.cursor,
    limit: options.limit ?? 25,
    onRateLimit: options.onRateLimit,
  })

  // Helper to normalize reason strings
  const normalizeReason = (reason: string): string => {
    const r = reason.toLowerCase()
    if (r.includes('like')) return 'like'
    if (r.includes('repost')) return 'repost'
    return r
  }

  // Shared caches for both fetch phases
  const postCache = new Map<string, AppBskyFeedDefs.PostView>()
  const uriResolutionMap = new Map<string, string>()

  // Step 1: Separate direct URIs (can fetch immediately) from repost URIs (need resolution)
  const directPostUris = new Set<string>()
  const directReplyMentionUris = new Set<string>()
  const replyPostUris = new Set<string>()  // URIs of actual reply posts (notification.uri)
  const repostUrisToResolve: Array<{ reasonSubject: string; repo: string; rkey: string }> = []

  for (const notification of newNotifications) {
    const reason = String(notification.reason || '').toLowerCase()
    const normalizedReason = normalizeReason(reason)

    if (!notification.reasonSubject || reason === 'follow') continue

    // Collect reply post URIs for ALL reply/mention notifications (not just first per reasonSubject)
    if (normalizedReason === 'reply' || normalizedReason === 'mention') {
      replyPostUris.add(notification.uri)
    }

    if (uriResolutionMap.has(notification.reasonSubject)) continue

    const postUri = notification.reasonSubject

    if (postUri.includes('/app.bsky.feed.repost/')) {
      // Repost URI - need to resolve first
      const uriParts = postUri.replace('at://', '').split('/')
      repostUrisToResolve.push({
        reasonSubject: postUri,
        repo: uriParts[0],
        rkey: uriParts[2]
      })
    } else {
      // Direct post URI - can fetch immediately
      uriResolutionMap.set(postUri, postUri)
      if (normalizedReason === 'reply' || normalizedReason === 'mention') {
        directReplyMentionUris.add(postUri)
      } else if (normalizedReason === 'like' || normalizedReason === 'repost' || normalizedReason === 'quote') {
        directPostUris.add(postUri)
      }
    }
  }

  // Step 2: Fetch direct URIs AND resolve repost URIs IN PARALLEL
  const fetchDirectPosts = async () => {
    // Run all three batch fetches in parallel - they are independent
    const fetchLikeRepostPosts = async () => {
      if (directPostUris.size > 0) {
        try {
          const response = await agent.getPosts({ uris: Array.from(directPostUris) })
          for (const post of response.data.posts) {
            postCache.set(post.uri, post)
          }
        } catch (error) {
          log.warn('Notifications', 'Batch fetch failed:', error)
        }
      }
    }

    // Batch fetch parent/root posts for reply/mention notifications (reasonSubject URIs)
    const fetchReplyParentPosts = async () => {
      if (directReplyMentionUris.size > 0) {
        try {
          const response = await agent.getPosts({ uris: Array.from(directReplyMentionUris) })
          for (const post of response.data.posts) {
            postCache.set(post.uri, post)
          }
        } catch (error) {
          log.warn('Notifications', 'Batch fetch reply parent posts failed:', error)
        }
      }
    }

    // Batch fetch actual reply posts by their URIs (notification.uri)
    const fetchReplyPosts = async () => {
      if (replyPostUris.size > 0) {
        try {
          const response = await agent.getPosts({ uris: Array.from(replyPostUris) })
          for (const post of response.data.posts) {
            postCache.set(post.uri, post)
          }
        } catch (error) {
          log.warn('Notifications', 'Batch fetch reply posts failed:', error)
        }
      }
    }

    await Promise.all([fetchLikeRepostPosts(), fetchReplyParentPosts(), fetchReplyPosts()])
  }

  const resolveRepostUris = async () => {
    if (repostUrisToResolve.length === 0) return []

    return Promise.all(
      repostUrisToResolve.map(async ({ reasonSubject, repo, rkey }) => {
        try {
          const repostRecord = await agent.com.atproto.repo.getRecord({
            repo,
            collection: 'app.bsky.feed.repost',
            rkey
          })
          const subject = (repostRecord.data.value as any)?.subject
          return { reasonSubject, resolvedUri: subject?.uri || reasonSubject }
        } catch {
          return { reasonSubject, resolvedUri: reasonSubject }
        }
      })
    )
  }

  // Run both in parallel - direct fetches don't wait for repost resolution
  const [, resolvedReposts] = await Promise.all([
    fetchDirectPosts(),
    resolveRepostUris()
  ])

  // Step 3: Update resolution map and fetch posts for resolved repost URIs
  const repostPostUris = new Set<string>()
  for (const { reasonSubject, resolvedUri } of resolvedReposts) {
    uriResolutionMap.set(reasonSubject, resolvedUri)
    if (!postCache.has(resolvedUri)) {
      repostPostUris.add(resolvedUri)
    }
  }

  // Batch fetch posts for resolved repost URIs (only what we don't have)
  if (repostPostUris.size > 0) {
    try {
      const response = await agent.getPosts({ uris: Array.from(repostPostUris) })
      for (const post of response.data.posts) {
        postCache.set(post.uri, post)
      }
    } catch (error) {
      log.warn('Notifications', 'Batch fetch resolved reposts failed:', error)
    }
  }

  // Step 4: Attach posts to notifications using the cache
  const notificationsWithPosts: NotificationWithPost[] = newNotifications.map((notification) => {
    const reason = String(notification.reason || '').toLowerCase()
    const normalizedReason = normalizeReason(reason)

    if (!notification.reasonSubject || reason === 'follow') {
      return notification
    }

    const resolvedUri = uriResolutionMap.get(notification.reasonSubject)
    if (!resolvedUri) {
      return notification
    }

    if (normalizedReason === 'reply' || normalizedReason === 'mention') {
      // Get the root/original post (the user's post that was replied to)
      const rootPost = postCache.get(resolvedUri)

      // Try to get the actual reply post directly (fetched by notification.uri)
      const replyPost = postCache.get(notification.uri)
      if (replyPost) {
        // Determine reply-to author for indirect replies
        // An indirect reply is when the replier responded to someone other than the user
        // Compare parent URI with reasonSubject (the user's post) to detect this
        const record = notification.record as any
        const parentUri = record?.reply?.parent?.uri
        let replyParentAuthor: { displayName?: string; handle: string } | undefined
        if (parentUri && parentUri !== resolvedUri) {
          // Indirect reply: the reply is to a different post than the user's
          // Try to get parent post author from cache
          const parentPost = postCache.get(parentUri)
          if (parentPost?.author) {
            replyParentAuthor = {
              displayName: parentPost.author.displayName,
              handle: parentPost.author.handle
            }
          }
        }
        return {
          ...notification,
          post: replyPost,
          parentPost: rootPost,
          replyParentAuthor
        }
      }

      // Fallback to root post
      if (rootPost) {
        return { ...notification, post: rootPost }
      }
    } else {
      // For like/repost/quote, use the cached post
      const post = postCache.get(resolvedUri)
      if (post) {
        return { ...notification, post }
      }
    }

    return notification
  })

  return {
    notifications: notificationsWithPosts,
    cursor: newCursor,
  }
}
