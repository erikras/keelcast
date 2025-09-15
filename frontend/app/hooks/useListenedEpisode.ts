import { useCallback, useEffect, useState } from 'react';
import { APIClient } from '../../keelClient';

interface UseListenedEpisodeProps {
  client: any; // Accept any client type to avoid type issues
  episodeId: string;
}

interface ListenedEpisodeData {
  id: string;
  secondsListened: number;
  listened: boolean;
}

export function useListenedEpisode({ client, episodeId }: UseListenedEpisodeProps) {
  const [listenedEpisode, setListenedEpisode] = useState<ListenedEpisodeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);

  // Load existing listened episode data
  useEffect(() => {
    let mounted = true;

    const loadListenedEpisode = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use upsert to get or create the listened episode record
        const result = await client.api.mutations.upsertListenedEpisode({
          episodeId: episodeId,
          secondsListened: 0,
          listened: false
        });

        if (result.data) {
          setListenedEpisode({
            id: result.data.id,
            secondsListened: result.data.secondsListened,
            listened: result.data.listened
          });
        }

        if (mounted) {
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load listened episode');
          setIsLoading(false);
        }
      }
    };

    loadListenedEpisode();

    return () => {
      mounted = false;
    };
  }, [client, episodeId]);

  // Get listened episode (should always exist after initial load)
  const ensureListenedEpisode = useCallback((): ListenedEpisodeData | null => {
    if (listenedEpisode) {
      return listenedEpisode;
    }

    return null;
  }, [listenedEpisode]);

  // Update seconds listened (throttled to every 5 seconds)
  const updateProgress = useCallback(async (secondsListened: number) => {
    try {
      // Only create/update if user has actually started listening (> 0 seconds)
      if (secondsListened <= 0) {
        return;
      }

      const episode = ensureListenedEpisode();
      if (!episode) {
        return;
      }

      // Throttle database updates to every 5 seconds
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;
      const shouldUpdate = timeSinceLastUpdate >= 5000; // 5 seconds

      if (!shouldUpdate) {
        // Still update local state for immediate UI feedback
        setListenedEpisode(prev => prev ? { ...prev, secondsListened } : null);
        return;
      }

      const result = await client.api.mutations.upsertListenedEpisode({
        episodeId: episodeId,
        secondsListened: secondsListened
      });

      if (result.data) {
        setLastUpdateTime(now);
        setListenedEpisode(prev => prev ? { ...prev, secondsListened } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update progress');
    }
  }, [client, ensureListenedEpisode, lastUpdateTime, episodeId]);

  // Mark as completed
  const markComplete = useCallback(async () => {
    try {
      const episode = ensureListenedEpisode();
      if (!episode) {
        return;
      }

      const result = await client.api.mutations.upsertListenedEpisode({
        episodeId: episodeId,
        listened: true
      });

      if (result.data) {
        setListenedEpisode(prev => prev ? { ...prev, listened: true } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as complete');
    }
  }, [client, ensureListenedEpisode, episodeId]);

  return {
    listenedEpisode,
    isLoading,
    error,
    updateProgress,
    markComplete,
  };
}
