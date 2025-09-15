import { UpsertListenedEpisode, useDatabase } from '@teamkeel/sdk';

export default UpsertListenedEpisode(async (ctx, inputs) => {
  const { episodeId, secondsListened, listened } = inputs;
  const { identity } = ctx;

  if (!identity) {
    throw new Error('User must be authenticated');
  }

  const db = useDatabase();

  // Try to find existing record
  const existing = await db
    .selectFrom('listened_episode')
    .selectAll()
    .where('episodeId', '=', episodeId)
    .where('listenerId', '=', identity.id)
    .executeTakeFirst();

  if (existing) {
    // Update existing record
    const updated = await db
      .updateTable('listened_episode')
      .set({
        secondsListened: secondsListened ?? existing.secondsListened,
        listened: listened ?? existing.listened,
        listenedAt: new Date(),
      })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: updated.id,
      episodeId: updated.episodeId,
      listenerId: updated.listenerId,
      listenedAt: updated.listenedAt,
      secondsListened: updated.secondsListened,
      listened: updated.listened,
    };
  } else {
    // Create new record
    const created = await db
      .insertInto('listened_episode')
      .values({
        episodeId,
        listenerId: identity.id,
        listenedAt: new Date(),
        secondsListened: secondsListened ?? 0,
        listened: listened ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: created.id,
      episodeId: created.episodeId,
      listenerId: created.listenerId,
      listenedAt: created.listenedAt,
      secondsListened: created.secondsListened,
      listened: created.listened,
    };
  }
});
