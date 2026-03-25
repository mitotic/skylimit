/**
 * EditionView — displays assembled editions in the Periodic Editions tab.
 *
 * Shows one edition at a time with ◀/▶ navigation between editions.
 * Each edition has a masthead banner, default section (always expanded),
 * and named sections with collapsible accordion headers.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AppBskyFeedDefs } from '@atproto/api'
import type { BskyAgent } from '@atproto/api'
import PostCard from './PostCard'
import { getEditionList, getEditionContent, EditionDisplayData } from '../curation/skylimitEditionAssembly'
import { getPostUniqueId } from '../curation/skylimitGeneral'
import { getSettings, updateSettings } from '../curation/skylimitStore'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import { useViewTracking } from '../hooks/useViewTracking'
import { usePostInteractions } from '../hooks/usePostInteractions'
import { CurationFeedViewPost, EditionRegistryEntry } from '../curation/types'
import { getPostSummariesByIds } from '../curation/skylimitCache'
import { markEditionViewed, updateEditionUnreadCount } from '../curation/editionRegistry'
import { clientNow } from '../utils/clientClock'
import log from '../utils/logger'

/** Format a registry entry's date as a short string like "Mar 2, 9 AM" */
function formatEditionDate(entry: EditionRegistryEntry): string {
  const date = new Date(entry.startPostTimestamp)
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

interface EditionViewProps {
  agent: BskyAgent | null
  onReply?: (uri: string) => void
  onQuotePost?: (post: AppBskyFeedDefs.PostView) => void
  addToast: (message: string, type: 'success' | 'error' | 'info') => void
  forceProbeRef: React.MutableRefObject<boolean>
  setForceProbeTrigger: React.Dispatch<React.SetStateAction<number>>
  myUsername?: string
  onEditionViewed?: () => void
  targetEditionKey?: string | null
  onTargetConsumed?: () => void
}

const EDITION_INDEX_KEY = 'websky_edition_current_index'
const EDITION_SCROLL_KEY = 'websky_home_editions_scroll_state'


export default function EditionView({
  agent,
  onReply,
  onQuotePost,
  addToast,
  forceProbeRef,
  setForceProbeTrigger,
  myUsername,
  onEditionViewed,
  targetEditionKey,
  onTargetConsumed,
}: EditionViewProps) {
  const navigate = useNavigate()
  const [registryEntries, setRegistryEntries] = useState<EditionRegistryEntry[]>([])
  const [currentEdition, setCurrentEdition] = useState<EditionDisplayData | null>(null)
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = sessionStorage.getItem(EDITION_INDEX_KEY)
    if (saved !== null) {
      const idx = parseInt(saved, 10)
      if (!isNaN(idx) && idx >= 0) return idx
    }
    return 0
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [allSectionsCollapsed, setAllSectionsCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editionLoading, setEditionLoading] = useState(false)
  const [hasLayout, setHasLayout] = useState(true)

  // Newspaper view settings
  const [newspaperView, setNewspaperView] = useState(false)
  const [editionFont, setEditionFont] = useState<'serif' | 'sans-serif'>('serif')

  // Edition list popup
  const [showEditionList, setShowEditionList] = useState(false)
  const [showAllEditions, setShowAllEditions] = useState(false)
  const titleRef = useRef<HTMLButtonElement>(null)
  // View tracking: map from postId → { viewedAt, editionKey } (shared across editions)
  type ViewedAtEntry = { viewedAt: number; editionKey: string }
  const [viewedAtMap, setViewedAtMap] = useState<Map<string, ViewedAtEntry>>(new Map())
  const currentEditionKeyRef = useRef('')
  currentEditionKeyRef.current = registryEntries[currentIndex]?.editionKey || ''

  // Load edition registry on mount (lightweight, no post loading)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Check if edition layout is configured
        const settings = await getSettings()
        if (!cancelled) {
          setNewspaperView(settings.newspaperView || false)
          setEditionFont(settings.editionFont || 'serif')
        }
        if (!settings.editionLayout?.trim()) {
          if (!cancelled) setHasLayout(false)
          return
        }

        const entries = await getEditionList()
        if (cancelled) return
        setRegistryEntries(entries)

        // Navigate to target edition from URL param, or restore saved index
        if (targetEditionKey) {
          const targetIdx = entries.findIndex(e => e.editionKey === targetEditionKey)
          if (targetIdx >= 0) {
            setCurrentIndex(targetIdx)
          }
          onTargetConsumed?.()
        } else {
          // Restore saved index if valid
          const savedIndex = sessionStorage.getItem(EDITION_INDEX_KEY)
          if (savedIndex !== null) {
            const idx = parseInt(savedIndex, 10)
            if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
              setCurrentIndex(idx)
            }
          }
        }
      } catch (error) {
        log.error('Edition', 'Failed to load edition registry:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [targetEditionKey])

  // Load edition content on demand when index or registry changes
  useEffect(() => {
    if (registryEntries.length === 0) return
    const entry = registryEntries[currentIndex]
    if (!entry) return

    let cancelled = false
    setEditionLoading(true)

    async function loadEdition() {
      try {
        const content = await getEditionContent(entry, agent)
        if (cancelled) return
        if (!content) {
          log.warn('Edition', `Edition content unavailable for ${entry.editionKey} (${entry.editionName}): ` +
            `range=${new Date(entry.startPostTimestamp).toLocaleString()}–${new Date(entry.endPostTimestamp).toLocaleString()}, ` +
            `created=${new Date(entry.createdAt).toLocaleString()}`)
        }
        setCurrentEdition(content)

        // Mark this edition as viewed in the registry
        if (content && !entry.viewedAt) {
          markEditionViewed(entry.editionKey, clientNow())
          entry.viewedAt = clientNow()
          onEditionViewed?.()
        }

        // Hydrate viewedAt from IndexedDB for this edition's posts
        if (content) {
          const summaryIds = content.sections.flatMap(s => s.posts.map(getPostUniqueId))
          if (summaryIds.length > 0) {
            const summaries = await getPostSummariesByIds(summaryIds)
            const hydrated = new Map<string, number>()
            for (const [id, summary] of summaries) {
              if (summary.viewedAt) hydrated.set(id, summary.viewedAt)
            }
            if (!cancelled && hydrated.size > 0) {
              const ek = entry.editionKey
              setViewedAtMap(prev => {
                const next = new Map(prev)
                for (const [id, ts] of hydrated) {
                  if (!next.has(id)) next.set(id, { viewedAt: ts, editionKey: ek })
                }
                return next.size !== prev.size ? next : prev
              })
            }

            // Recompute and persist unreadCount from fetched summaries
            if (!cancelled && entry.postCount != null) {
              const unreadCount = summaryIds.length - (summaries ? [...summaries.values()].filter(s => s.viewedAt).length : 0)
              if (unreadCount !== entry.unreadCount) {
                updateEditionUnreadCount(entry.editionKey, Math.max(0, unreadCount))
                entry.unreadCount = Math.max(0, unreadCount)
              }
            }
          }
        }

        // Restore scroll position after content renders
        if (!cancelled) {
          const savedScrollY = sessionStorage.getItem(EDITION_SCROLL_KEY)
          if (savedScrollY) {
            const scrollY = parseInt(savedScrollY, 10)
            if (!isNaN(scrollY) && scrollY > 0) {
              requestAnimationFrame(() => {
                const attemptRestore = (attempt: number) => {
                  if (cancelled) return
                  setTimeout(() => {
                    const scrollHeight = document.documentElement.scrollHeight
                    const clientHeight = window.innerHeight
                    const maxScroll = Math.max(scrollHeight - clientHeight, 0)
                    if (scrollHeight > clientHeight && maxScroll >= scrollY * 0.8) {
                      window.scrollTo(0, Math.min(scrollY, maxScroll))
                    } else if (attempt < 10) {
                      attemptRestore(attempt + 1)
                    }
                  }, attempt * 50)
                }
                attemptRestore(1)
              })
            }
          }
        }
      } catch (error) {
        log.error('Edition', 'Failed to load edition content:', error)
      } finally {
        if (!cancelled) setEditionLoading(false)
      }
    }
    loadEdition()
    return () => { cancelled = true }
  }, [registryEntries, currentIndex, agent])

  // Prune viewedAtMap entries for editions that have been culled from the registry
  useEffect(() => {
    if (registryEntries.length === 0) return
    const validKeys = new Set(registryEntries.map(e => e.editionKey))
    setViewedAtMap(prev => {
      let changed = false
      const next = new Map(prev)
      for (const [postId, entry] of next) {
        if (!validKeys.has(entry.editionKey)) {
          next.delete(postId)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [registryEntries])

  // Persist current index
  useEffect(() => {
    sessionStorage.setItem(EDITION_INDEX_KEY, String(currentIndex))
  }, [currentIndex])

  // Save scroll position continuously (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const handleScroll = () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        const scrollY = window.scrollY
        if (scrollY < 50) {
          sessionStorage.removeItem(EDITION_SCROLL_KEY)
        } else {
          sessionStorage.setItem(EDITION_SCROLL_KEY, scrollY.toString())
        }
      }, 150)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  const goToPrev = useCallback(() => {
    sessionStorage.removeItem(EDITION_SCROLL_KEY)
    setCollapsedSections(new Set())
    setCurrentIndex(i => Math.min(i + 1, registryEntries.length - 1))
  }, [registryEntries.length])

  const goToNext = useCallback(() => {
    sessionStorage.removeItem(EDITION_SCROLL_KEY)
    setCollapsedSections(new Set())
    setCurrentIndex(i => Math.max(i - 1, 0))
  }, [])

  const goToEdition = useCallback((index: number) => {
    sessionStorage.removeItem(EDITION_SCROLL_KEY)
    setCollapsedSections(new Set())
    setCurrentIndex(index)
    setShowEditionList(false)
    setShowAllEditions(false)
  }, [])

  const toggleSection = useCallback((sectionCode: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionCode)) next.delete(sectionCode)
      else next.add(sectionCode)
      return next
    })
  }, [])

  const handleNewspaperViewToggle = useCallback(async () => {
    const newValue = !newspaperView
    setNewspaperView(newValue)
    await updateSettings({ newspaperView: newValue })
  }, [newspaperView])

  // Swipe left/right to navigate between editions on mobile
  // Use state (not ref) so the hook's effect re-runs when the element appears
  // after conditional early returns (loading states render without this div).
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  useSwipeNavigation({
    container: containerEl,
    onSwipeLeft: goToNext,
    onSwipeRight: goToPrev,
    enabled: registryEntries.length > 1,
  })

  // Viewer state overrides from post interactions (like, bookmark, repost)
  type ViewerOverride = {
    like?: string
    bookmarked?: boolean
    repost?: string
    likeCount?: number
    repostCount?: number
  }
  const [viewerOverrides, setViewerOverrides] = useState<Map<string, ViewerOverride>>(new Map())

  // View tracking: build flat feed with viewedAt and viewer overrides injected
  const edition = currentEdition

  const currentFeed = useMemo(() => {
    if (!edition) return []
    return edition.sections.flatMap(s => s.posts.map(post => {
      let result = post
      const summaryId = getPostUniqueId(post)
      const viewedAt = viewedAtMap.get(summaryId)?.viewedAt
      if (viewedAt && 'curation' in result) {
        const cp = result as CurationFeedViewPost
        if (!cp.curation?.viewedAt) {
          result = { ...cp, curation: { ...cp.curation, viewedAt } } as AppBskyFeedDefs.FeedViewPost
        }
      }
      // Apply viewer overrides (like/bookmark/repost state from interactions)
      const override = viewerOverrides.get(post.post.uri)
      if (override) {
        result = {
          ...result,
          post: {
            ...result.post,
            viewer: {
              ...result.post.viewer,
              ...(override.like !== undefined ? { like: override.like || undefined } : {}),
              ...(override.bookmarked !== undefined ? { bookmarked: override.bookmarked } : {}),
              ...(override.repost !== undefined ? { repost: override.repost || undefined } : {}),
            },
            ...(override.likeCount !== undefined ? { likeCount: override.likeCount } : {}),
            ...(override.repostCount !== undefined ? { repostCount: override.repostCount } : {}),
          },
        }
      }
      return result
    }))
  }, [edition, viewedAtMap, viewerOverrides])

  // setFeed adapter: extract viewedAt and viewer state updates from hook's state mapper
  const setFeedAdapter = useCallback<React.Dispatch<React.SetStateAction<AppBskyFeedDefs.FeedViewPost[]>>>((updater) => {
    if (typeof updater !== 'function') return
    // Apply the updater to a snapshot to see what changed
    const updated = updater(currentFeed)

    // Check for viewedAt changes
    setViewedAtMap(prev => {
      let changed = false
      const next = new Map(prev)
      for (const p of updated) {
        const cp = p as CurationFeedViewPost
        if (cp.curation?.viewedAt) {
          const id = getPostUniqueId(p)
          if (!prev.has(id)) {
            next.set(id, { viewedAt: cp.curation.viewedAt, editionKey: currentEditionKeyRef.current })
            changed = true
          }
        }
      }
      if (changed) {
        // Decrement unreadCount in registry for the current edition
        const ek = currentEditionKeyRef.current
        const newlyViewed = next.size - prev.size
        if (ek && newlyViewed > 0) {
          const entry = registryEntries.find(e => e.editionKey === ek)
          if (entry && entry.unreadCount != null) {
            entry.unreadCount = Math.max(0, entry.unreadCount - newlyViewed)
            updateEditionUnreadCount(ek, entry.unreadCount)
          }
        }
      }
      return changed ? next : prev
    })

    // Check for viewer state changes (like, bookmark, repost).
    // Merge with existing overrides to avoid stale-closure races: handleLike
    // makes two setFeed calls (optimistic count, then viewer URI) and the second
    // may run with a stale setFeedAdapter that doesn't see the first's count change.
    // By only overriding fields that actually changed, we preserve earlier updates.
    setViewerOverrides(prev => {
      let changed = false
      const next = new Map(prev)
      for (const p of updated) {
        const original = currentFeed.find(o => o.post.uri === p.post.uri)
        if (!original) continue
        const ov = original.post.viewer
        const nv = p.post.viewer
        const likeChanged = ov?.like !== nv?.like
        const bookmarkChanged = ov?.bookmarked !== nv?.bookmarked
        const repostChanged = ov?.repost !== nv?.repost
        const likeCountChanged = original.post.likeCount !== p.post.likeCount
        const repostCountChanged = original.post.repostCount !== p.post.repostCount
        if (likeChanged || bookmarkChanged || repostChanged || likeCountChanged || repostCountChanged) {
          const existing = prev.get(p.post.uri)
          next.set(p.post.uri, {
            ...existing,
            ...(likeChanged ? { like: nv?.like } : {}),
            ...(bookmarkChanged ? { bookmarked: nv?.bookmarked } : {}),
            ...(repostChanged ? { repost: nv?.repost } : {}),
            ...(likeCountChanged ? { likeCount: p.post.likeCount } : {}),
            ...(repostCountChanged ? { repostCount: p.post.repostCount } : {}),
          })
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [currentFeed])

  // Force useViewTracking to re-observe DOM when sections collapse/expand
  // (new array reference triggers the observe effect in the hook)
  const feedForTracking = useMemo(() => [...currentFeed], [currentFeed, collapsedSections])
  useViewTracking({ feed: feedForTracking, setFeed: setFeedAdapter })

  // Post interactions (like, bookmark, repost, delete, pin) scoped to edition feed
  const {
    handleLike, handleBookmark, handleRepost,
    handleDeletePost, handlePinPost,
  } = usePostInteractions({
    agent, feed: currentFeed, setFeed: setFeedAdapter,
    addToast, forceProbeRef, setForceProbeTrigger, myUsername,
  })

  // Helper to get a post with viewedAt and viewer overrides injected
  const getPostWithViewed = useCallback((post: AppBskyFeedDefs.FeedViewPost): AppBskyFeedDefs.FeedViewPost => {
    let result = post
    const summaryId = getPostUniqueId(post)
    const viewedAt = viewedAtMap.get(summaryId)?.viewedAt
    if (viewedAt) {
      const cp = result as CurationFeedViewPost
      if (!cp.curation?.viewedAt) {
        result = { ...cp, curation: { ...cp.curation, viewedAt } } as AppBskyFeedDefs.FeedViewPost
      }
    }
    // Apply viewer overrides (like/bookmark/repost state from interactions)
    const override = viewerOverrides.get(post.post.uri)
    if (override) {
      result = {
        ...result,
        post: {
          ...result.post,
          viewer: {
            ...result.post.viewer,
            ...(override.like !== undefined ? { like: override.like || undefined } : {}),
            ...(override.bookmarked !== undefined ? { bookmarked: override.bookmarked } : {}),
            ...(override.repost !== undefined ? { repost: override.repost || undefined } : {}),
          },
          ...(override.likeCount !== undefined ? { likeCount: override.likeCount } : {}),
          ...(override.repostCount !== undefined ? { repostCount: override.repostCount } : {}),
        },
      }
    }
    return result
  }, [viewedAtMap, viewerOverrides])

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>Loading editions...</p>
      </div>
    )
  }

  if (!hasLayout) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">Periodic Editions</p>
        <p>
          No edition layout provided. Go to{' '}
          <button
            onClick={() => navigate('/settings')}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edition Settings under the Settings/Curation tab
          </button>
          {' '}to define the layout for periodic editions.
        </p>
      </div>
    )
  }

  if (registryEntries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">Periodic Editions</p>
        <p>No editions available yet.</p>
      </div>
    )
  }

  if (editionLoading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>Loading edition...</p>
      </div>
    )
  }

  const currentRegistryEntry = registryEntries[currentIndex]
  const defaultSection = edition?.sections.find(s => s.code === '0')
  const namedSections = edition?.sections.filter(s => s.code !== '0') ?? []
  // Derive effective collapsed state: if user navigated (collapsedSections reset to empty),
  // apply the global allSectionsCollapsed intent; otherwise use per-section toggles
  const effectiveCollapsed = collapsedSections.size > 0
    ? collapsedSections
    : (allSectionsCollapsed ? new Set(namedSections.map(s => s.code)) : new Set<string>())
  const hasPrev = currentIndex < registryEntries.length - 1  // older editions
  const hasNext = currentIndex > 0                            // newer editions
  const prevUnviewed = hasPrev && !registryEntries[currentIndex + 1]?.viewedAt
  const nextUnviewed = hasNext && !registryEntries[currentIndex - 1]?.viewedAt

  return (
    <div ref={setContainerEl} className="pb-8">
      {/* Edition masthead banner */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={goToPrev}
            disabled={!hasPrev}
            className="p-2 text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:text-gray-700 dark:hover:text-gray-200 flex items-center"
            aria-label="Previous edition (older)"
          >
            {prevUnviewed && <span className="text-red-500 text-xs mr-0.5">●</span>}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span
                className={`font-semibold text-lg text-gray-900 dark:text-gray-100 ${editionFont === 'sans-serif' ? 'font-newspaper-sans' : 'font-serif'}`}
              >
                {edition?.editionName ?? currentRegistryEntry?.editionName ?? 'Edition'}
              </span>
              <button
                ref={titleRef}
                onClick={() => setShowEditionList(prev => !prev)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer leading-none"
                aria-label="Show edition list"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
          </div>

          {/* Edition list popup */}
          {showEditionList && createPortal(
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => { setShowEditionList(false); setShowAllEditions(false) }}
              />
              {/* Popup */}
              <div
                className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto w-80"
                style={{
                  top: titleRef.current
                    ? titleRef.current.getBoundingClientRect().bottom + 4
                    : 60,
                  left: titleRef.current
                    ? Math.min(
                        window.innerWidth - 328,
                        Math.max(8, titleRef.current.getBoundingClientRect().left +
                          titleRef.current.getBoundingClientRect().width / 2 - 160)
                      )
                    : 16,
                }}
              >
                {(() => {
                  const maxVisible = 12
                  const hasHidden = !showAllEditions && registryEntries.length > maxVisible
                  const displayedEntries = hasHidden ? registryEntries.slice(0, maxVisible) : registryEntries
                  return (
                    <>
                      {displayedEntries.map((entry, idx) => {
                        const isCurrent = idx === currentIndex
                        const isUnviewed = !entry.viewedAt
                        const entryDate = new Date(entry.startPostTimestamp)
                        const today = new Date()
                        const isToday = entryDate.getFullYear() === today.getFullYear() &&
                          entryDate.getMonth() === today.getMonth() &&
                          entryDate.getDate() === today.getDate()
                        const dateSuffix = isToday ? '' : ` (${entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`
                        const displayName = entry.editionName || formatEditionDate(entry)
                        return (
                          <button
                            key={entry.editionKey}
                            onClick={() => { if (!isCurrent) goToEdition(idx) }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-1 ${
                              isCurrent
                                ? 'text-gray-400 dark:text-gray-500 cursor-default'
                                : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                            } ${idx > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''}`}
                          >
                            <span className={`text-xs ${isUnviewed ? 'text-red-500' : 'invisible'}`}>●</span>
                            <span className="flex-1">{displayName}{dateSuffix}</span>
                            {entry.postCount != null && entry.unreadCount != null && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">
                                unread {entry.unreadCount}/{entry.postCount}
                              </span>
                            )}
                          </button>
                        )
                      })}
                      {hasHidden && (
                        <button
                          onClick={() => setShowAllEditions(true)}
                          className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-t border-gray-100 dark:border-gray-700"
                        >
                          Show older editions ({registryEntries.length - maxVisible} more)
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>
            </>,
            document.body
          )}

          <button
            onClick={goToNext}
            disabled={!hasNext}
            className="p-2 text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:text-gray-700 dark:hover:text-gray-200 flex items-center"
            aria-label="Next edition (newer)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {nextUnviewed && <span className="text-red-500 text-xs ml-0.5">●</span>}
          </button>
        </div>

        {/* Newspaper view checkbox + Open/Close Sections toggle */}
        {edition && <div className="flex items-center justify-between px-4 pb-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={newspaperView}
              onChange={handleNewspaperViewToggle}
              className="w-4 h-4"
            />
            Newspaper view
          </label>
          {(namedSections.length > 0 || defaultSection) && (
            <button
              onClick={() => {
                const totalSections = namedSections.length + (defaultSection ? 1 : 0)
                if (effectiveCollapsed.size === totalSections) {
                  setAllSectionsCollapsed(false)
                  setCollapsedSections(new Set())
                } else {
                  setAllSectionsCollapsed(true)
                  setCollapsedSections(new Set(['0', ...namedSections.map(s => s.code)]))
                }
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {effectiveCollapsed.size === namedSections.length + (defaultSection ? 1 : 0) ? 'Open sections' : 'Close sections'}
            </button>
          )}
        </div>}
      </div>

      {!edition && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium mb-2">Edition Unavailable</p>
          <p>The content for this edition could not be loaded.</p>
        </div>
      )}

      {/* Default section date/time header */}
      {defaultSection && defaultSection.posts.length > 0 ? (
        <div>
          <div
            onClick={() => toggleSection('0')}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          >
            <span className="text-gray-400 dark:text-gray-500 text-base">
              {effectiveCollapsed.has('0') ? '▶' : '▼'}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <span className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
              <span className={`text-lg font-normal text-gray-500 dark:text-gray-400 tracking-wide ${editionFont === 'sans-serif' ? 'font-newspaper-sans' : 'font-serif'}`}>
                {edition!.editionDate.toLocaleString(undefined, {
                  hour: 'numeric', minute: '2-digit',
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
              <span className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              unread {defaultSection.posts.filter(p => !viewedAtMap.has(getPostUniqueId(p))).length}/{defaultSection.posts.length}
            </span>
          </div>
          {!effectiveCollapsed.has('0') && defaultSection.posts.map(post => {
            const viewedPost = getPostWithViewed(post)
            return (
              <div key={getPostUniqueId(post)} data-post-uri={post.post.uri} data-post-id={getPostUniqueId(post)}>
                <PostCard
                  post={viewedPost}
                  showCounter={true}
                  onReply={onReply}
                  onRepost={handleRepost}
                  onQuotePost={onQuotePost}
                  onLike={handleLike}
                  onBookmark={handleBookmark}
                  onDeletePost={handleDeletePost}
                  onPinPost={handlePinPost}
                  newspaperView={newspaperView}
                  editionFont={editionFont}
                />
              </div>
            )
          })}
        </div>
      ) : edition ? (
        <div className={`text-center px-4 py-3 text-lg font-normal text-gray-500 dark:text-gray-400 tracking-wide border-t border-gray-200 dark:border-gray-700 ${editionFont === 'sans-serif' ? 'font-newspaper-sans' : 'font-serif'}`}>
          {edition.editionDate.toLocaleString(undefined, {
            hour: 'numeric', minute: '2-digit',
            month: 'long', day: 'numeric', year: 'numeric',
          })}
        </div>
      ) : null}

      {/* Named sections */}
      {namedSections.map(section => (
        <div key={section.code}>
          {/* Section divider/header */}
          <div
            onClick={() => toggleSection(section.code)}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          >
            <span className="text-blue-600 dark:text-blue-400 text-base">
              {effectiveCollapsed.has(section.code) ? '▶' : '▼'}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <span className="h-px flex-1 bg-blue-400 dark:bg-blue-500" />
              <span className={`text-lg font-semibold text-blue-600 dark:text-blue-400 tracking-wide ${editionFont === 'sans-serif' ? 'font-newspaper-sans' : 'font-serif'}`}>
                {section.name}
              </span>
              <span className="h-px flex-1 bg-blue-400 dark:bg-blue-500" />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              unread {section.posts.filter(p => !viewedAtMap.has(getPostUniqueId(p))).length}/{section.posts.length}
            </span>
          </div>

          {/* Section posts */}
          {!effectiveCollapsed.has(section.code) && section.posts.map(post => {
            const viewedPost = getPostWithViewed(post)
            return (
              <div key={getPostUniqueId(post)} data-post-uri={post.post.uri} data-post-id={getPostUniqueId(post)}>
                <PostCard
                  post={viewedPost}
                  showCounter={true}
                  onReply={onReply}
                  onRepost={handleRepost}
                  onQuotePost={onQuotePost}
                  onLike={handleLike}
                  onBookmark={handleBookmark}
                  onDeletePost={handleDeletePost}
                  onPinPost={handlePinPost}
                  newspaperView={newspaperView}
                  editionFont={editionFont}
                />
              </div>
            )
          })}
        </div>
      ))}

      {/* End of Edition marker */}
      {edition && <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-12 bg-gray-300 dark:bg-gray-600" />
          End of Edition
          <span className="h-px w-12 bg-gray-300 dark:bg-gray-600" />
        </span>
      </div>}
    </div>
  )
}
