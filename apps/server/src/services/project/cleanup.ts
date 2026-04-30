import { and, eq, lt, isNull, not } from 'drizzle-orm';
import { db } from '../../db';
import { projects, volumes, units, chapters, chapterVersions, settings } from '../../db/schema';

const DAYS_BEFORE_PERMANENT_DELETE = 30;

/**
 * 永久删除超过 30 天的已删除项目
 * 应在服务器启动时注册为定时任务，每小时执行一次
 */
export async function cleanupDeletedProjects() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_PERMANENT_DELETE);

  const deletedProjects = await db.delete(projects)
    .where(and(eq(projects.status, 'deleted'), lt(projects.deletedAt, cutoffDate)))
    .returning({ id: projects.id });

  const deletedCount = deletedProjects.length;
  if (deletedCount > 0) {
    console.log(`[Cleanup] Permanently deleted ${deletedCount} project(s) older than ${DAYS_BEFORE_PERMANENT_DELETE} days`);
  }

  return { deletedCount };
}

/**
 * 永久删除超过 30 天的已删除大纲元素（卷/单元/章节）和设定
 * 级联物理删除：先删除章节版本 → 章节 → 单元 → 卷
 */
export async function cleanupDeletedOutlineElements() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_PERMANENT_DELETE);
  let totalDeleted = 0;

  // 1. 删除过期章节的版本（章节被软删除后，其版本也应清理）
  const expiredChapters = await db.select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.status, 'deleted'), lt(chapters.deletedAt, cutoffDate)));

  for (const ch of expiredChapters) {
    const deletedVersions = await db.delete(chapterVersions)
      .where(eq(chapterVersions.chapterId, ch.id))
      .returning({ id: chapterVersions.id });
    totalDeleted += deletedVersions.length;
  }

  // 2. 删除过期章节
  const deletedChapters = await db.delete(chapters)
    .where(and(eq(chapters.status, 'deleted'), lt(chapters.deletedAt, cutoffDate)))
    .returning({ id: chapters.id });
  totalDeleted += deletedChapters.length;

  // 3. 删除过期单元
  const deletedUnits = await db.delete(units)
    .where(and(eq(units.status, 'deleted'), lt(units.deletedAt, cutoffDate)))
    .returning({ id: units.id });
  totalDeleted += deletedUnits.length;

  // 4. 删除过期卷
  const deletedVolumes = await db.delete(volumes)
    .where(and(eq(volumes.status, 'deleted'), lt(volumes.deletedAt, cutoffDate)))
    .returning({ id: volumes.id });
  totalDeleted += deletedVolumes.length;

  // 5. 删除过期设定
  const deletedSettings = await db.delete(settings)
    .where(and(not(isNull(settings.deletedAt)), lt(settings.deletedAt, cutoffDate)))
    .returning({ id: settings.id });
  totalDeleted += deletedSettings.length;

  if (totalDeleted > 0) {
    console.log(`[Cleanup] Permanently deleted ${totalDeleted} outline/setting element(s) older than ${DAYS_BEFORE_PERMANENT_DELETE} days`);
  }

  return { totalDeleted };
}

/**
 * 注册定时清理任务
 * @param intervalMs 执行间隔，默认 1 小时
 */
export function registerCleanupScheduler(intervalMs = 60 * 60 * 1000) {
  setInterval(async () => {
    try {
      await cleanupDeletedProjects();
      await cleanupDeletedOutlineElements();
    } catch (err) {
      console.error('[Cleanup] Failed to cleanup:', err);
    }
  }, intervalMs);
}
