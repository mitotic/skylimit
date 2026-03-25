# Websky Architecture

This document describes the codebase organization of Websky/Skylimit. Think of it as a "lay of the land" for developers who want to understand or contribute to the code.


## Overview

Websky is a **client-side only** Bluesky web client built with React, TypeScript, and Vite. It runs entirely in the browser with no backend&mdash;all API calls go directly to `bsky.social` (or a configured test server) using the `@atproto/api` library. The application can be deployed as static files.

The application has two main aspects:

1. **Bluesky client**: Standard social media features (feed, profiles, threads, notifications, search, compose, bookmarks)
2. **Skylimit curation**: An intelligent feed filtering system that probabilistically selects posts to fit a user-specified viewing budget


## Technology Stack

| Library | Purpose |
|---------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite 5 | Build tool and dev server |
| React Router v6 | Client-side routing (with v7 future flags) |
| Tailwind CSS 3 | Utility-first styling |
| @atproto/api | AT Protocol / Bluesky API client |
| HLS.js | Adaptive video streaming |
| date-fns | Date formatting |
| Vitest | Testing |


## Project Structure

```
src/
├── api/                # AT Protocol API wrappers (9 files)
│   ├── atproto-client.ts   # Agent creation, login, service URL
│   ├── feed.ts             # Home feed, author feed, threads, engagement lists
│   ├── posts.ts            # Like, repost, reply, bookmark, compose
│   ├── profile.ts          # User profile fetching
│   ├── search.ts           # User search
│   ├── social.ts           # Follow/unfollow, followers/following lists
│   ├── notifications.ts    # Notification fetching
│   ├── chat.ts             # Direct messaging conversations and messages
│   └── notificationLoader.ts # Notification loading pipeline (used by prefetch)
│
├── auth/               # Authentication and session management
│   ├── SessionContext.tsx   # React context: agent, session, login/logout
│   └── session-storage.ts  # localStorage/sessionStorage abstraction
│
├── components/         # Reusable UI components (45 files)
│   ├── Layout.tsx           # Main layout: sidebar (desktop) + bottom nav (mobile)
│   ├── Navigation.tsx       # Nav menu with theme toggle
│   ├── PostCard.tsx         # Primary post rendering with curation metadata
│   ├── CurationPopup.tsx    # Per-post curation stats and amp controls
│   ├── SkylimitStatistics.tsx # Followee statistics table and summary
│   ├── CurationInitModal.tsx  # First-use curation setup guide
│   ├── Compose.tsx          # Post/reply/quote composition
│   ├── VideoPlayer.tsx      # HLS video playback
│   ├── EditionView.tsx      # Edition display with navigation and collapsible sections
│   ├── EditionLayoutEditor.tsx # Visual editor for edition layouts
│   ├── BugReportModal.tsx   # Bug report with console logs and DM submission
│   ├── ReleaseBanner.tsx    # Version update notification banner
│   ├── HelpMessage.tsx      # Formatted help text with glossary
│   ├── DormantOverlay.tsx   # Multi-tab blocking overlay
│   ├── FeedSelector.tsx     # Feed switcher
│   ├── AcceleratedClock.tsx # Skyspeed test server clock display
│   └── ...                  # Avatar, Button, Modal, Spinner, Toast, etc.
│
├── contexts/           # React contexts
│   ├── ThemeContext.tsx      # Dark/light mode (localStorage-persisted)
│   └── RateLimitContext.tsx  # API rate limit tracking
│
├── curation/           # Skylimit curation system (25 modules)
│   ├── types.ts             # Core types: SkylimitSettings, CurationStatus, etc.
│   ├── skylimitFilter.ts    # Per-post curation decisions
│   ├── skylimitStats.ts     # Statistics computation and probability calculation
│   ├── skylimitFeedCache.ts # High-level feed cache API
│   ├── feedCacheCore.ts     # IndexedDB CRUD operations, metadata, pagination
│   ├── feedCacheFetch.ts    # API fetch orchestration and curation bridge
│   ├── skylimitCache.ts     # IndexedDB cache for summaries, follows, stats
│   ├── skylimitStore.ts     # Settings persistence (load/save/defaults)
│   ├── skylimitGeneral.ts   # Utilities: unique IDs, timestamps, hashtags
│   ├── skylimitEditions.ts  # Edition core logic
│   ├── skylimitEditionAssembly.ts # Assembles held posts into synthetic editions
│   ├── skylimitEditionMatcher.ts  # Matches posts to edition layout patterns
│   ├── editionRegistry.ts   # Lightweight edition index (localStorage)
│   ├── skylimitTimeline.ts  # Edition digest insertion
│   ├── skylimitNumbering.ts # Post counter numbering (resets daily)
│   ├── skylimitRecurate.ts  # Re-curate posts when stats change
│   ├── skylimitFollows.ts   # Follow list synchronization
│   ├── skylimitStatsWorker.ts # Background stats computation
│   ├── skylimitCleanup.ts   # Cache cleanup and pruning
│   ├── skylimitCounter.ts   # Post counting utilities
│   ├── skylimitUnviewedTracker.ts # Tracks viewed/unviewed posts since midnight
│   ├── pagedUpdates.ts      # Paged feed update logic with multi-fetch probing
│   ├── parentPostCache.ts   # Reply context parent post caching
│   ├── localCacheSearch.ts  # Search cached summaries without API calls
│   └── curationDataTransfer.ts # Export/import curation data for cross-device sync
│
├── hooks/              # Custom React hooks (8 files)
│   ├── useFeedPipeline.ts   # Central feed state management and curation pipeline
│   ├── useScrollManagement.ts # Scroll position tracking and restoration
│   ├── useViewTracking.ts   # IntersectionObserver-based view event tracking
│   ├── usePostInteractions.ts # Like, repost, reply action handlers
│   ├── useFeedTransition.ts # Feed switching transitions
│   ├── usePullToRefresh.ts  # Mobile pull-to-refresh gesture
│   ├── useSwipeNavigation.ts # Horizontal swipe gesture for navigation
│   └── homePageTypes.ts     # HomePage type definitions
│
├── prefetch/           # Prefetch caching
│   └── prefetchCache.ts     # Singleton cache for prefetched notifications
│
├── data/               # Static data
│   └── helpGlossary.ts     # Centralized glossary of curation terms
│
├── routes/             # Page components (11 pages)
│   ├── HomePage.tsx         # Main feed with curation, pagination, editions
│   ├── LoginPage.tsx        # App password authentication
│   ├── ProfilePage.tsx      # User profiles with posts/replies/likes tabs
│   ├── ThreadPage.tsx       # Thread view with parent chain
│   ├── NotificationsPage.tsx # Aggregated notifications
│   ├── SearchPage.tsx       # User search
│   ├── SavedPage.tsx        # Bookmarked posts
│   ├── FeedPage.tsx         # Custom feed viewer with state persistence
│   ├── ChatPage.tsx         # Direct messaging conversations
│   ├── FollowListPage.tsx   # Followers/following lists
│   └── SettingsPage.tsx     # Three-tab settings (basic/curation/following)
│
├── utils/              # Utilities (14 files)
│   ├── hmac.ts              # HMAC-SHA256 for deterministic randomization
│   ├── clientClock.ts       # Client-side clock (supports Skyspeed acceleration)
│   ├── rateLimit.ts         # Rate limit detection and handling
│   ├── rateLimitState.ts    # Shared rate limit state
│   ├── requestThrottle.ts   # Request throttling
│   ├── notificationAggregation.ts # Notification grouping logic
│   ├── og-image.ts          # OpenGraph image extraction
│   ├── tabGuard.ts          # Single-tab enforcement via localStorage heartbeat
│   ├── logger.ts            # Logging utilities
│   ├── logBuffer.ts         # Log buffer for bug reports
│   ├── beginnerMode.ts      # Beginner-friendly UI flag
│   ├── readOnlyMode.ts      # Read-only mode flag (disables write operations)
│   ├── versionCheck.ts      # Detects app version updates
│   └── timezoneUtils.ts     # Timezone handling
│
├── types/              # Shared TypeScript type definitions
│   └── index.ts
│
├── styles/
│   └── index.css        # Tailwind imports and global styles
│
├── App.tsx             # Routing, tab guard, and layout (RateLimitProvider wraps routes)
└── main.tsx            # Entry point: URL param handling, reset logic, React mount
```


## Provider Hierarchy

```
React.StrictMode
  └── BrowserRouter (v7_startTransition, v7_relativeSplatPath flags)
        └── ThemeProvider (dark mode toggle, localStorage-persisted)
              └── SessionProvider (auth state, BskyAgent, Skyspeed detection)
                    └── App
                          └── RateLimitProvider (rate limit tracking)
                                └── Layout (sidebar + content area)
                                      └── Routes (page components)
```


## Routing

| Route | Component | Auth | Purpose |
|-------|-----------|------|---------|
| `/login` | LoginPage | Public | App password authentication |
| `/` | HomePage | Protected | Curated Following Feed |
| `/notifications` | NotificationsPage | Protected | Aggregated notifications |
| `/search` | SearchPage | Protected | User search |
| `/saved` | SavedPage | Protected | Bookmarked posts |
| `/profile/:actor` | ProfilePage | Protected | User profiles |
| `/profile/:actor/followers` | FollowListPage | Protected | Followers list |
| `/profile/:actor/following` | FollowListPage | Protected | Following list |
| `/post/:uri` | ThreadPage | Protected | Thread view |
| `/feed/:feedUri` | FeedPage | Protected | Custom feed viewer |
| `/chat` | ChatPage | Protected | Direct message conversations |
| `/chat/:convoId` | ChatPage | Protected | Specific DM conversation |
| `/settings` | SettingsPage | Protected | App and curation settings |

Unauthenticated users are redirected to `/login`. Authenticated users accessing `/login` are redirected to `/`.


## Data Flow

### Authentication Flow

1. User enters handle + app password on LoginPage
2. `login()` in `atproto-client.ts` creates a `BskyAgent` and calls `agent.login()`
3. JWT tokens stored via `session-storage.ts` (localStorage if "Remember Me", sessionStorage otherwise)
4. `SessionProvider` exposes `agent` and `session` via React context
5. Token refresh handled by BskyAgent's `persistSession` callback

### Feed Loading and Curation Pipeline

This is the most complex data flow in the application, orchestrated by `useFeedPipeline.ts` (with `HomePage.tsx` as the container component):

1. **Mount**: HomePage checks if a valid cached feed exists in IndexedDB
2. **Cache hit**: Restore displayed feed from `skylimitFeedCache` (if within idle interval)
3. **Cache miss**: Fetch posts from API via `getHomeFeed()` with cursor-based pagination
4. **Save raw posts**: Create feed cache entries via `createFeedCacheEntries()`
5. **Create summaries**: Extract post metadata into `PostSummary` records
6. **Curate**: Apply `curateSinglePost()` to each post (probability filtering, reply handling, repost dedup, edition saving)
7. **Save summaries**: Store post summaries in the summaries cache
8. **Compute stats**: Schedule background statistics computation via `skylimitStatsWorker`
9. **Insert editions**: At scheduled times, insert edition digest posts via `skylimitTimeline`
10. **Number posts**: Assign sequential counters via `skylimitNumbering`
11. **Display**: Render `CurationFeedViewPost[]` as `PostCard` components

### Paged Updates Flow

When new posts arrive while the user is browsing:

1. `probeForNewPosts()` periodically checks for new content
2. `calculatePageRaw()` determines how many raw posts to fetch (accounting for curation filtering)
3. When enough posts accumulate for a full page, a "New Posts" button appears
4. Clicking the button triggers a fetch, curate, and display cycle


## State Management

### Session State (`SessionContext`)

Provides `agent` (BskyAgent instance), `session` (user info), `isLoading`, `login()`, and `logout()` via React context. Handles Skyspeed test server detection, config change prompts, and auto-login from URL parameters.

### Feed State (`useFeedPipeline` hook)

The most complex state in the application, managed by `src/hooks/useFeedPipeline.ts` with `HomePage.tsx` as the container. Key state variables:

- `feed` / `previousPageFeed`: Currently displayed posts and previous page
- `newestDisplayedPostTimestamp` / `oldestDisplayedPostTimestamp`: Feed boundary tracking
- `showNewPostsButton` / `newPostsCount`: New posts notification
- `activeTab`: Curated vs. editions view
- Multiple refs for scroll state preservation across navigation

Other feed-related hooks:
- `useScrollManagement`: Scroll position tracking and restoration
- `useViewTracking`: IntersectionObserver-based view event tracking
- `usePostInteractions`: Like, repost, reply action handlers
- `useFeedTransition`: Feed switching animations
- `usePullToRefresh`: Mobile pull-to-refresh gesture
- `useSwipeNavigation`: Horizontal swipe for page navigation

### Curation State (IndexedDB)

The `skylimit_db` IndexedDB database contains these object stores:

- **follows**: Follow relationships with amplification factors and metadata
- **filter**: Computed global stats and per-user probabilities
- **summaries**: Post metadata summaries (indexed by timestamp)
- **feedCache**: Displayed feed posts (indexed by timestamp)
- **settings**: User curation preferences
- **editions**: Posts saved for digest editions


## Curation System Architecture

The 25 modules in `src/curation/` implement the [Skylimit Protocol](SkylimitProtocol.md):

### Core Algorithm

- **`skylimitStats.ts`**: The mathematical heart. Implements the two-pass complete intervals algorithm, Skylimit Number computation, and per-user probability calculation. This is where `computePostStats()` and `computeUserProbabilities()` live.

- **`skylimitFilter.ts`**: The decision engine. `curateSinglePost()` takes a post and determines its curation status using HMAC-based random numbers, reply categorization, repost deduplication, and edition digest logic.

- **`types.ts`**: Defines all core types including `SkylimitSettings` (30+ fields), `CurationStatus` (10 status types, all ending in `_show` or `_drop`), `PostSummary`, `GlobalStats`, `UserEntry`, and `CurationFeedViewPost`.

### Storage

- **`skylimitFeedCache.ts`**: High-level feed cache API.

- **`feedCacheCore.ts`**: IndexedDB CRUD operations, metadata, pagination, and lookback management for cached feed posts.

- **`feedCacheFetch.ts`**: API fetch orchestration and curation bridge. Handles fetch iteration, secondary-to-primary cache transfer, and edition creation during gaps.

- **`skylimitCache.ts`**: IndexedDB operations for follows, filter (stats/probabilities), post summaries, and editions.

- **`skylimitStore.ts`**: Settings persistence with defaults and validation.

- **`curationDataTransfer.ts`**: Export/import system for syncing curation data (settings, edition layout, amplification factors) across devices.

### Edition System

- **`skylimitEditions.ts`**: Edition core logic.

- **`skylimitEditionAssembly.ts`**: Assembles held posts into synthetic edition posts by creating fake editor users who "repost" curated collections.

- **`skylimitEditionMatcher.ts`**: Matches posts to edition layout patterns (handles, hashtags, topics).

- **`editionRegistry.ts`**: Lightweight localStorage-based index of all created editions. Enables fast navigation in the Editions tab without scanning the post cache.

### Pipeline

- **`pagedUpdates.ts`**: Logic for paged feed updates including page size calculation accounting for curation filtering variability, with multi-fetch probing.

- **`skylimitTimeline.ts`**: Inserts edition digest posts at scheduled times.

- **`skylimitNumbering.ts`**: Assigns sequential post counters that reset at midnight.

- **`skylimitRecurate.ts`**: Re-curates existing posts when statistics change (e.g., after background computation).

### Support

- **`skylimitGeneral.ts`**: Utility functions for unique IDs, timestamps, hashtag extraction, interval string computation, and edition layout parsing.

- **`skylimitFollows.ts`**: Synchronizes follow list from the Bluesky API.

- **`skylimitStatsWorker.ts`**: Schedules background statistics computation to avoid blocking the UI.

- **`skylimitCleanup.ts`**: Prunes old data from caches.

- **`skylimitCounter.ts`**: Post counting utilities.

- **`skylimitUnviewedTracker.ts`**: Tracks posts viewed/unviewed since midnight for unread count display.

- **`parentPostCache.ts`**: Caches parent posts for reply context display.

- **`localCacheSearch.ts`**: Searches cached post summaries by handle, name, and text patterns without API calls.


## Build and Deployment

### Development

```bash
npm run dev      # Vite dev server at http://localhost:5181
npm run build    # TypeScript compile + Vite production build -> dist/
npm run test     # Vitest tests
npm run lint     # ESLint
```

### Configuration

- **`vite.config.ts`**: Dev server port (5181), path alias (`@/` -> `./src/`), source maps disabled in production
- **`tailwind.config.js`**: Custom primary color palette (Sky blue), dark mode class-based
- **`tsconfig.json`**: ES2020 target, strict mode, path aliases

### Deployment

Production builds output to `dist/`. The `copy-to-skylimit.sh` script copies non-development files to the `skylimit` repository for deployment to [skylimit.dev](https://skylimit.dev) via GitHub Pages.

### Test Server Connection

Websky can connect to the Skyspeed test server via:

- **URL parameter**: `http://localhost:5181/?server=localhost:3210`
- **Environment variable**: `VITE_BSKY_SERVICE=http://localhost:3210 npm run dev`

See the [Admin Guide](AdminGuide.md) for more details on deployment and test server setup.
