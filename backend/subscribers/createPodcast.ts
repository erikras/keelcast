import { CreatePodcast, useDatabase } from '@teamkeel/sdk';
import { fetchEpisodes, fetchFeedMetadata, extractImageUrl, type EpisodeInsert } from '../rss/parser';

// To learn more about events and subscribers, visit https://docs.keel.so/events
export default CreatePodcast(async (ctx, event) => {
  const { rssUrl, id, createdById } = event.target.data

  const db = useDatabase();

  if (!rssUrl) {
    return;
  }

  try {
    const episodes = await fetchEpisodes(rssUrl, { validateUrls: false });
    const episodesToInsert = episodes.map((episode, index) => {
      return {
        podcastId: id,
        title: episode.title,
        description: episode.description,
        url: episode.url,
        audioUrl: episode.audioUrl, // Now using audioUrl - no more camelCase/snake_case issues!
        publishedAt: episode.publishedAt,
        durationSeconds: episode.durationSeconds
      };
    });

    const feedMetadata = await fetchFeedMetadata(rssUrl);

    await db.transaction().execute(async (trx) => {
      const imageUrl = extractImageUrl(feedMetadata);

      if (feedMetadata.title || feedMetadata.description || imageUrl) {
        const updateData = {
          ...(feedMetadata.title && { title: feedMetadata.title }),
          ...(feedMetadata.description && { description: feedMetadata.description }),
          ...(imageUrl && { imageUrl: imageUrl }),
          ...(feedMetadata.link && { url: feedMetadata.link }),
          ...(feedMetadata.author && { author: feedMetadata.author }),
          ...(feedMetadata.categories?.[0] && { category: feedMetadata.categories[0] })
        };
        await trx
          .updateTable('podcast')
          .set(updateData)
          .where('id', '=', id)
          .execute();
      } else {
        throw new Error('Failed to fetch feed metadata');
      }

      // Filter out episodes that already exist
      const newEpisodes: EpisodeInsert[] = [];

      for (let i = 0; i < episodesToInsert.length; i++) {
        const episode = episodesToInsert[i];

        // Check if episode already exists by URL
        const existingEpisode = await trx
          .selectFrom('episode')
          .select('id')
          .where('url', '=', episode.url)
          .where('podcastId', '=', id)
          .executeTakeFirst();

        if (existingEpisode) {
          continue;
        }

        // Additional safety check for null audioUrl
        if (!episode.audioUrl) {
          continue;
        }

        newEpisodes.push(episode);
      }

      // Batch insert episodes for better performance
      if (newEpisodes.length > 0) {
        // Check for any null audioUrl values
        const episodesWithNullAudio = newEpisodes.filter(ep => !ep.audioUrl);
        if (episodesWithNullAudio.length > 0) {
          throw new Error('Cannot insert episodes with null audioUrl values');
        }

        const insertResult = await trx
          .insertInto('episode')
          .values(newEpisodes)
          .execute();
      } else {

      }

      // Automatically subscribe the creator to their podcast
      if (createdById) {
        await trx
          .insertInto('podcast_subscription')
          .values({
            podcastId: id,
            subscriberId: createdById
          })
          .execute();
      } else {

      }
    });


  } catch (error) {
    throw error;
  }
});
