// 导出服务 — Markdown/TXT 免费 + DOCX 付费
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, verifyProjectOwner } from '../../trpc';
import { db } from '../../db';
import { projects, volumes, units, chapters, chapterVersions } from '../../db/schema';

// 通过 chapter → unit → volume → project 查找项目ID
async function getProjectIdFromChapter(chapterId: string): Promise<string> {
  const [ch] = await db.select({ unitId: chapters.unitId }).from(chapters).where(eq(chapters.id, chapterId));
  if (!ch) throw new TRPCError({ code: 'NOT_FOUND', message: '章节不存在' });
  const [unit] = await db.select({ volumeId: units.volumeId }).from(units).where(eq(units.id, ch.unitId));
  if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
  const [vol] = await db.select({ projectId: volumes.projectId }).from(volumes).where(eq(volumes.id, unit.volumeId));
  if (!vol) throw new TRPCError({ code: 'NOT_FOUND' });
  return vol.projectId;
}

export const exportRouter = router({
  // 导出单章（Markdown）
  chapterMarkdown: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projectId = await getProjectIdFromChapter(input.chapterId);
      await verifyProjectOwner(projectId, ctx.userId);

      const [chapter] = await db.select().from(chapters).where(eq(chapters.id, input.chapterId));
      const [latest] = await db.select().from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(asc(chapterVersions.versionNumber));
      if (!latest) throw new TRPCError({ code: 'NOT_FOUND', message: '无内容' });

      const md = `# ${chapter!.title}\n\n${latest.content}`;
      return { filename: `${chapter!.title}.md`, content: md, format: 'markdown' as const };
    }),

  // 导出单章（纯文本）
  chapterTxt: protectedProcedure
    .input(z.object({ chapterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projectId = await getProjectIdFromChapter(input.chapterId);
      await verifyProjectOwner(projectId, ctx.userId);

      const [chapter] = await db.select().from(chapters).where(eq(chapters.id, input.chapterId));
      const [latest] = await db.select().from(chapterVersions)
        .where(eq(chapterVersions.chapterId, input.chapterId))
        .orderBy(asc(chapterVersions.versionNumber));
      if (!latest) throw new TRPCError({ code: 'NOT_FOUND', message: '无内容' });

      const text = latest.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      return { filename: `${chapter!.title}.txt`, content: `${chapter!.title}\n\n${text}`, format: 'txt' as const };
    }),

  // 导出整个项目（Markdown，按卷→单元→章节组织）
  projectMarkdown: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)));
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });

      const vols = await db.select().from(volumes)
        .where(eq(volumes.projectId, input.projectId)).orderBy(asc(volumes.sortOrder));

      let md = `# ${project.name}\n\n`;

      for (const vol of vols) {
        md += `## ${vol.title}\n\n`;
        const unitList = await db.select().from(units)
          .where(eq(units.volumeId, vol.id)).orderBy(asc(units.sortOrder));

        for (const unit of unitList) {
          md += `### ${unit.title}\n\n`;
          const chapterList = await db.select().from(chapters)
            .where(eq(chapters.unitId, unit.id)).orderBy(asc(chapters.sortOrder));

          for (const ch of chapterList) {
            const [latestVer] = await db.select().from(chapterVersions)
              .where(eq(chapterVersions.chapterId, ch.id))
              .orderBy(asc(chapterVersions.versionNumber));
            md += `#### ${ch.title}\n\n${latestVer?.content || '（未创作）'}\n\n---\n\n`;
          }
        }
      }

      return { filename: `${project.name}.md`, content: md, format: 'markdown' as const };
    }),

  // DOCX 导出（付费功能，预留接口）
  projectDocx: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwner(input.projectId, ctx.userId);
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'DOCX 导出功能即将上线，敬请期待' });
    }),
});
