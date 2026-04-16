import { z } from 'zod';
import { eq, and, asc, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import {
  spriteTextEntries,
  spriteAITasks,
} from '../../db/schema';
import { analyzeTriggerCondition, implementSpriteText } from './ai-integration';

// ============================================================
// Schema
// ============================================================

export const createEntrySchema = z.object({
  species: z.string(),
  variant: z.string(),
  level: z.number().int().min(-1).max(9),
  textType: z.enum(['user-trigger', 'idle-phase']),
  triggerCondition: z.string().min(1),
  responseText: z.string().min(1),
});

export const updateEntrySchema = z.object({
  id: z.string().uuid(),
  triggerCondition: z.string().min(1).optional(),
  responseText: z.string().min(1).optional(),
  textType: z.enum(['user-trigger', 'idle-phase']).optional(),
  level: z.number().int().min(-1).max(9).optional(),
  status: z.enum(['draft', 'confirmed', 'published', 'failed']).optional(),
  errorMessage: z.string().optional().nullable(),
});

// ============================================================
// Manifest sync
// ============================================================

/**
 * Read the sprite-manifest.json from the public directory to get
 * available species/variant/level combinations, then auto-create
 * placeholder entries for any missing combos.
 */
export async function syncFromManifest() {
  // We read the manifest directly from the web app's public JSON
  // The server can access it via the project root
  const manifestPath = process.cwd()
    ? `${process.cwd()}/../web/public/sprite-manifest.json`
    : '/app/web/public/sprite-manifest.json';

  let manifest: {
    variants: Record<string, { levels: number[] }>;
  };
  try {
    const raw = await import('fs').then(fs =>
      fs.default.readFileSync(manifestPath, 'utf-8'),
    );
    manifest = JSON.parse(raw);
  } catch {
    // If we can't read the manifest, fall back to known variants
    manifest = {
      variants: {
        'plant/sunflower': { levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
        'animal/fox': { levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
        'element/wind': { levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      },
    };
  }

  const created: { species: string; variant: string; level: number }[] = [];

  for (const [key, data] of Object.entries(manifest.variants)) {
    const [species, variant] = key.split('/');
    if (!species || !variant) continue;

    // Also create a generic template entry (level=-1) if missing
    for (const level of [-1, ...data.levels]) {
      const existing = await db.select({ id: spriteTextEntries.id })
        .from(spriteTextEntries)
        .where(
          and(
            eq(spriteTextEntries.species, species),
            eq(spriteTextEntries.variant, variant),
            eq(spriteTextEntries.level, level),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        const [entry] = await db.insert(spriteTextEntries).values({
          species,
          variant,
          level,
          textType: 'user-trigger',
          triggerCondition: '',
          responseText: '',
          status: 'draft',
        }).returning();
        created.push({ species, variant, level });
      }
    }
  }

  return { created };
}

// ============================================================
// CRUD
// ============================================================

export async function listEntries(species: string, variant: string) {
  const entries = await db.select()
    .from(spriteTextEntries)
    .where(
      and(
        eq(spriteTextEntries.species, species),
        eq(spriteTextEntries.variant, variant),
      ),
    )
    .orderBy(
      asc(spriteTextEntries.level),
      desc(spriteTextEntries.createdAt),
    );

  // Fetch associated AI tasks for all entries
  const entryIds = entries.map(e => e.id);
  let tasks: (typeof spriteAITasks.$inferSelect)[] = [];
  if (entryIds.length > 0) {
    for (const entryId of entryIds) {
      const entryTasks = await db.select()
        .from(spriteAITasks)
        .where(eq(spriteAITasks.entryId, entryId))
        .orderBy(desc(spriteAITasks.createdAt));
      tasks.push(...entryTasks);
    }
  }

  return {
    entries,
    tasks: tasks.reduce((acc, task) => {
      if (!acc[task.entryId]) acc[task.entryId] = [];
      acc[task.entryId].push(task);
      return acc;
    }, {} as Record<string, typeof tasks>),
  };
}

export async function createEntry(input: z.infer<typeof createEntrySchema>) {
  const [entry] = await db.insert(spriteTextEntries)
    .values({
      species: input.species,
      variant: input.variant,
      level: input.level,
      textType: input.textType,
      triggerCondition: input.triggerCondition,
      responseText: input.responseText,
      status: 'draft',
    })
    .returning();
  return entry;
}

export async function updateEntry(id: string, data: Omit<z.infer<typeof updateEntrySchema>, 'id'>) {
  const [entry] = await db.update(spriteTextEntries)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(spriteTextEntries.id, id))
    .returning();
  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  return entry;
}

export async function deleteEntry(id: string) {
  const [entry] = await db.select().from(spriteTextEntries).where(eq(spriteTextEntries.id, id)).limit(1);
  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  // Also delete associated AI tasks
  await db.delete(spriteAITasks).where(eq(spriteAITasks.entryId, id));
  await db.delete(spriteTextEntries).where(eq(spriteTextEntries.id, id));
  return { ok: true };
}

export async function publishEntry(id: string) {
  const [entry] = await db.update(spriteTextEntries)
    .set({ status: 'published', updatedAt: new Date() })
    .where(eq(spriteTextEntries.id, id))
    .returning();
  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  return entry;
}

export async function unpublishEntry(id: string) {
  const [entry] = await db.update(spriteTextEntries)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(spriteTextEntries.id, id))
    .returning();
  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  return entry;
}

// ============================================================
// Template: apply to all levels
// ============================================================

/**
 * Copy the triggerCondition + responseText from a level=-1 (generic template)
 * entry to all levels (0-9) of the same species/variant.
 * Always creates new entries — never overwrites existing ones.
 */
export async function applyToAllLevels(entryId: string) {
  const [template] = await db.select()
    .from(spriteTextEntries)
    .where(eq(spriteTextEntries.id, entryId))
    .limit(1);

  if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  if (template.level !== -1) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '只能从通用模板（等级-1）应用到全部等级' });
  }

  const results: { level: number; entryId: string }[] = [];

  for (let level = 0; level <= 9; level++) {
    const [created] = await db.insert(spriteTextEntries)
      .values({
        species: template.species,
        variant: template.variant,
        level,
        textType: template.textType,
        triggerCondition: template.triggerCondition,
        responseText: template.responseText,
        status: 'draft',
      })
      .returning();
    results.push({ level, entryId: created!.id });
  }

  return { results };
}

// ============================================================
// AI integration
// ============================================================

export async function submitToAI(entryId: string) {
  const [entry] = await db.select()
    .from(spriteTextEntries)
    .where(eq(spriteTextEntries.id, entryId))
    .limit(1);

  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  if (!entry.triggerCondition || !entry.responseText) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '触发条件和回复文本不能为空' });
  }

  // Create an AI task
  const [task] = await db.insert(spriteAITasks)
    .values({
      entryId,
      species: entry.species,
      variant: entry.variant,
      level: entry.level,
      taskType: 'implement',
      input: JSON.stringify({
        triggerCondition: entry.triggerCondition,
        responseText: entry.responseText,
        species: entry.species,
        variant: entry.variant,
        level: entry.level,
        textType: entry.textType,
      }),
      status: 'pending',
    })
    .returning();

  // Update entry to reference this task
  await db.update(spriteTextEntries)
    .set({ aiTaskId: task!.id, status: 'confirmed' })
    .where(eq(spriteTextEntries.id, entryId));

  // Execute the AI task (async - we don't await the full result)
  executeAITask(task!.id, entry).catch((err) => {
    // Error is handled within executeAITask
  });

  return { taskId: task!.id };
}

async function executeAITask(taskId: string, entry: typeof spriteTextEntries.$inferSelect) {
  // Mark as in progress
  await db.update(spriteAITasks)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(spriteAITasks.id, taskId));

  try {
    // Step 1: Analyze trigger condition
    const analysis = await analyzeTriggerCondition(entry.triggerCondition, entry.responseText);

    // Step 2: Implement the sprite text interaction
    const result = await implementSpriteText({
      species: entry.species,
      variant: entry.variant,
      level: entry.level,
      textType: entry.textType,
      triggerCondition: entry.triggerCondition,
      responseText: entry.responseText,
      analysis,
    });

    // Update task status to success
    await db.update(spriteAITasks)
      .set({
        status: 'success',
        result: result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(spriteAITasks.id, taskId));

    // Update entry status to published
    await db.update(spriteTextEntries)
      .set({ status: 'published', errorMessage: null, updatedAt: new Date() })
      .where(eq(spriteTextEntries.id, entry.id));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.update(spriteAITasks)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(spriteAITasks.id, taskId));

    await db.update(spriteTextEntries)
      .set({ status: 'failed', errorMessage, updatedAt: new Date() })
      .where(eq(spriteTextEntries.id, entry.id));
  }
}

export async function retryFailedTask(entryId: string) {
  const [entry] = await db.select()
    .from(spriteTextEntries)
    .where(eq(spriteTextEntries.id, entryId))
    .limit(1);

  if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: '文本条目不存在' });
  if (entry.status !== 'failed') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '只能重试失败的任务' });
  }

  return submitToAI(entryId);
}

export async function getTaskStatus(entryId: string) {
  const tasks = await db.select()
    .from(spriteAITasks)
    .where(eq(spriteAITasks.entryId, entryId))
    .orderBy(desc(spriteAITasks.createdAt))
    .limit(1);

  return tasks[0] || null;
}
