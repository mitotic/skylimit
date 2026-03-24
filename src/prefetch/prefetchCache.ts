/**
 * Module-level singleton cache for prefetched notification data.
 *
 * Follows the same pattern as rateLimitState.ts — module-level state
 * with exported functions. Both Navigation (trigger) and NotificationsPage
 * (consumer) import from this module.
 *
 * Cache persists across reads and has no time-based expiry. It stays valid
 * until explicitly invalidated by: (a) polling detecting new unreads,
 * (b) a re-prefetch overwriting it, or (c) the user clicking "Load More".
 * The 5-minute interval controls prefetching frequency, not cache validity.
 */

import { BskyAgent } from '@atproto/api'
import { loadNotificationsWithPosts, LoadNotificationsResult } from '../api/notificationLoader'
import { isRateLimited } from '../utils/rateLimitState'
import log from '../utils/logger'

// Minimum time between prefetches (5 minutes) to avoid excessive API calls
const PREFETCH_MIN_INTERVAL_MS = 5 * 60_000

// --- Module-level state ---

let cachedNotifications: (LoadNotificationsResult & { fetchedAt: number }) | null = null
let isPrefetchingNotifications = false
let lastPrefetchTimeNotifications = 0

// --- Exported functions ---

/**
 * Trigger background prefetch of notifications.
 * Called from Navigation after first unread count fetch and on new unreads.
 * Guarded against concurrent fetches and rate limiting.
 */
export async function prefetchNotifications(agent: BskyAgent): Promise<void> {
  if (isPrefetchingNotifications) return
  if (isRateLimited()) {
    log.verbose('Prefetch', 'Skipping notification prefetch — rate limited')
    return
  }

  isPrefetchingNotifications = true
  try {
    log.debug('Prefetch', 'Prefetching notifications...')
    const result = await loadNotificationsWithPosts(agent, { limit: 25 })
    cachedNotifications = { ...result, fetchedAt: Date.now() }
    lastPrefetchTimeNotifications = Date.now()
    log.debug('Prefetch', `Prefetched ${result.notifications.length} notifications`)
  } catch (error) {
    log.warn('Prefetch', 'Notification prefetch failed:', error)
    // Don't throw — prefetch failures are silent, page falls back to on-demand
  } finally {
    isPrefetchingNotifications = false
  }
}

/**
 * Returns true if >= 5 minutes have elapsed since last prefetch.
 * Used by Navigation to decide whether to re-prefetch or just invalidate.
 */
export function shouldReprefetchNotifications(): boolean {
  return Date.now() - lastPrefetchTimeNotifications >= PREFETCH_MIN_INTERVAL_MS
}

/**
 * Read cached notifications (non-destructive). Returns null if cache is empty.
 */
export function getNotificationsCache(): LoadNotificationsResult | null {
  if (!cachedNotifications) return null
  return {
    notifications: cachedNotifications.notifications,
    cursor: cachedNotifications.cursor,
  }
}

/**
 * Write to cache directly. Used by NotificationsPage after on-demand
 * fetches so subsequent visits benefit from the cache.
 */
export function setNotificationsCache(data: LoadNotificationsResult): void {
  cachedNotifications = { ...data, fetchedAt: Date.now() }
}

/**
 * Clear the notifications cache. Called when:
 * - New unreads detected and < 5 min since last prefetch
 * - User clicks "Load More" (multi-page state can't be cached)
 */
export function invalidateNotificationsCache(): void {
  cachedNotifications = null
}

/**
 * Clear all prefetch caches. For logout/reset cleanup.
 */
export function clearAllPrefetchCaches(): void {
  cachedNotifications = null
  lastPrefetchTimeNotifications = 0
}
