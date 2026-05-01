import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { router, protectedProcedure } from '../../trpc';
import { db } from '../../db';
import { videoBackgrounds } from '../../db/schema';

export const videoBackgroundRouter = router({
  list: protectedProcedure.query(async () => {
    return db.select({
      id: videoBackgrounds.id,
      name: videoBackgrounds.name,
      fileName: videoBackgrounds.fileName,
      description: videoBackgrounds.description,
      hasAudio: videoBackgrounds.hasAudio,
      sortOrder: videoBackgrounds.sortOrder,
    })
      .from(videoBackgrounds)
      .where(eq(videoBackgrounds.isActive, true))
      .orderBy(asc(videoBackgrounds.sortOrder));
  }),
});
