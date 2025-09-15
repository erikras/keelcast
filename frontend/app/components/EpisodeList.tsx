import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router";
import { createClient } from "../utils/createClient";
import type { Episode } from "../../keelClient";

interface EpisodeWithPodcast extends Episode {
  podcastTitle?: string;
  podcastImageUrl?: string | null;
}

interface EpisodeListProps {
  podcastId?: string;
  pageSize?: number;
}

interface EpisodeListState {
  episodes: EpisodeWithPodcast[];
  loading: boolean;
  error: string | null;
  cursor: string | null;
  hasNextPage: boolean;
  hydrated: boolean;
}

export default function EpisodeList({ podcastId, pageSize = 20 }: EpisodeListProps) {
  const [state, setState] = useState<EpisodeListState>({
    episodes: [],
    loading: false,
    error: null,
    cursor: null,
    hasNextPage: true,
    hydrated: false,
  });

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const episodeIdsRef = useRef<Set<string>>(new Set());

  const loadPage = useCallback(async (initial = false) => {
    // Don't load if already loading or no more pages (unless initial)
    if (state.loading || (!initial && !state.hasNextPage)) {
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const client = createClient();
      
      // Type assertion for now until client types are regenerated
      const response = await (client.api.queries.unlistenedEpisodes as any)({
        podcastId,
        first: pageSize,
        after: initial ? undefined : state.cursor,
      });

      if (abortController.signal.aborted) {
        return;
      }

      if (response.error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: response.error.message || 'Failed to load episodes',
        }));
        return;
      }

      const { episodes: newEpisodes, nextCursor, hasNextPage } = response.data;

      // Episodes now include podcast data from the backend
      const episodesWithPodcasts = newEpisodes as EpisodeWithPodcast[];

      // Deduplicate episodes by ID
      const uniqueNewEpisodes = episodesWithPodcasts.filter((episode: EpisodeWithPodcast) => {
        if (episodeIdsRef.current.has(episode.id)) {
          return false;
        }
        episodeIdsRef.current.add(episode.id);
        return true;
      });

      setState(prev => ({
        ...prev,
        episodes: initial ? uniqueNewEpisodes : [...prev.episodes, ...uniqueNewEpisodes],
        cursor: nextCursor,
        hasNextPage,
        loading: false,
      }));
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load episodes',
      }));
    }
  }, [podcastId, pageSize, state.cursor, state.hasNextPage, state.loading]);

  // Initial load and hydration
  useEffect(() => {
    setState(prev => ({ ...prev, hydrated: true }));
    loadPage(true);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!state.hydrated || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && state.hasNextPage && !state.loading) {
          loadPage(false);
        }
      },
      {
        rootMargin: '300px', // Start loading 300px before the element is visible
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [state.hydrated, state.hasNextPage, state.loading, loadPage]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleRetry = () => {
    loadPage(state.episodes.length === 0);
  };

  // Don't render anything until hydrated to prevent SSR mismatch
  if (!state.hydrated) {
    return null;
  }

  // Error state
  if (state.error && state.episodes.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-800">{state.error}</p>
          <button
            onClick={handleRetry}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!state.loading && state.episodes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">You're all caught up!</h3>
        <p className="text-gray-600">No unlistened episodes found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table Header */}
      <div className="bg-white rounded-t-lg shadow-sm border-b border-gray-200">
        <div className="grid grid-cols-10 gap-4 px-6 py-3 text-sm font-medium text-gray-500 uppercase tracking-wider">
          <div className="col-span-1"></div> {/* Artwork column */}
          <div className="col-span-6 text-left">Episode</div>
          <div className="col-span-2 text-center">Date</div>
          <div className="col-span-1 text-right">Duration</div>
        </div>
      </div>

      {/* Initial loading skeletons */}
      {state.loading && state.episodes.length === 0 && (
        <div className="bg-white rounded-b-lg shadow-sm">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-10 gap-4 px-6 py-4 border-b border-gray-100 last:border-b-0 animate-pulse">
              <div className="col-span-1">
                <div className="w-12 h-12 bg-gray-200 rounded"></div>
              </div>
              <div className="col-span-6">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
              <div className="col-span-2">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
              </div>
              <div className="col-span-1">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Episode table rows */}
      {state.episodes.length > 0 && (
        <div className="bg-white rounded-b-lg shadow-sm">
          {state.episodes.map((episode, index) => (
            <Link
              key={episode.id}
              to={`/play/${episode.id}`}
              className={`grid grid-cols-10 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                index !== state.episodes.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              {/* Podcast Artwork */}
              <div className="col-span-1">
                {episode.podcastImageUrl ? (
                  <img
                    src={episode.podcastImageUrl}
                    alt={`${episode.podcastTitle} artwork`}
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Episode Title and Podcast */}
              <div className="col-span-6 min-w-0 text-left">
                <h3 className="text-sm font-medium text-gray-900 truncate mb-1">
                  {episode.title}
                </h3>
                <p className="text-xs text-gray-500 truncate">
                  {episode.podcastTitle || 'Unknown Podcast'}
                </p>
              </div>

              {/* Date */}
              <div className="col-span-2 flex items-center justify-center">
                <span className="text-sm text-gray-600">
                  {formatDate(episode.publishedAt)}
                </span>
              </div>

              {/* Duration */}
              <div className="col-span-1 flex items-center justify-end">
                <span className="text-sm text-gray-600">
                  {episode.durationSeconds ? formatDuration(episode.durationSeconds) : '—'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Loading more indicator */}
      {state.loading && state.episodes.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-center">
            <div className="flex items-center space-x-2 text-gray-500">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm">Loading more episodes...</span>
            </div>
          </div>
        </div>
      )}

      {/* Error during pagination */}
      {state.error && state.episodes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800">{state.error}</p>
            <button
              onClick={handleRetry}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Load more button fallback */}
      {state.hasNextPage && !state.loading && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center">
            <button
              onClick={() => loadPage(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Load More Episodes
            </button>
          </div>
        </div>
      )}

      {/* Intersection observer sentinel */}
      <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
