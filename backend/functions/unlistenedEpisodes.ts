import { permissions, UnlistenedEpisodes, useDatabase, type UnlistenedEpisodesResponse } from "@teamkeel/sdk";

// Helper functions for cursor encoding/decoding
function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({
    pAt: publishedAt.getTime(),
    id
  })).toString('base64');
}

function decodeCursor(cursor: string): { pAt: number; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
    return decoded;
  } catch {
    return null;
  }
}

export default UnlistenedEpisodes(async (ctx, { podcastId, first, after }): Promise<UnlistenedEpisodesResponse> => {
  // Ensure user is authenticated
  const { identity } = ctx;
  if (!ctx.isAuthenticated || !identity) {
    permissions.deny();
    return { episodes: [], hasNextPage: false, nextCursor: null };
  }

  permissions.allow();

  const db = useDatabase();

  // Clamp page size between 1 and 100, default to 20
  const pageSize = Math.min(Math.max(first || 20, 1), 100);
  const limit = pageSize + 1; // Fetch one extra to determine hasNextPage

  let query = db
    .selectFrom("episode")
    .innerJoin("podcast", "episode.podcastId", "podcast.id")
    .select([
      "episode.id",
      "episode.podcastId",
      "episode.title",
      "episode.description",
      "episode.url",
      "episode.audioUrl",
      "episode.publishedAt",
      "episode.durationSeconds",
      "episode.createdAt",
      "episode.updatedAt",
      "podcast.title as podcastTitle",
      "podcast.imageUrl as podcastImageUrl"
    ])
    // Only episodes from podcasts the user is subscribed to
    .where("episode.podcastId", "in",
      db.selectFrom("podcast_subscription")
        .select("podcastId")
        .where("subscriberId", "=", identity.id)
    )
    // Exclude episodes that have been listened to (listened = true)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("listened_episode")
            .select("id")
            .where("episodeId", "=", eb.ref("episode.id"))
            .where("listenerId", "=", identity.id)
            .where("listened", "=", true)
        )
      )
    )
    // Sort by publishedAt DESC, then by id DESC for stable ordering
    .orderBy("episode.publishedAt", "desc")
    .orderBy("episode.id", "desc")
    .limit(limit);

  // Apply cursor-based pagination if provided
  if (after) {
    const cursor = decodeCursor(after);
    if (cursor) {
      const cursorDate = new Date(cursor.pAt);
      query = query.where((eb) =>
        eb.or([
          eb("episode.publishedAt", "<", cursorDate),
          eb.and([
            eb("episode.publishedAt", "=", cursorDate),
            eb("episode.id", "<", cursor.id)
          ])
        ])
      );
    }
  }

  // Apply optional podcast filter
  if (podcastId) {
    query = query.where("episode.podcastId", "=", podcastId);
  }

  const results = await query.execute();

  // Determine if there are more pages
  const hasNextPage = results.length > pageSize;
  const episodes = hasNextPage ? results.slice(0, pageSize) : results;

  // Generate next cursor from the last episode
  let nextCursor: string | null = null;
  if (hasNextPage && episodes.length > 0) {
    const lastEpisode = episodes[episodes.length - 1];
    nextCursor = encodeCursor(lastEpisode.publishedAt, lastEpisode.id);
  }

  return {
    episodes,
    hasNextPage,
    nextCursor
  };
});
