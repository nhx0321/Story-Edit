'use client';

import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';

export type WorkflowPhase =
  | 'empty'
  | 'outline_in_progress'
  | 'outline_done'
  | 'settings_in_progress'
  | 'settings_done'
  | 'chapters_ready'
  | 'chapters_in_progress';

export interface WorkflowProgress {
  phase: WorkflowPhase;
  hasVolumes: boolean;
  hasUnits: boolean;
  hasChapters: boolean;
  settingCount: number;
  settingComplete: boolean;
  chapterTotal: number;
  chapterDraft: number;
  chapterFinal: number;
  isLoading: boolean;
  refetch: () => void;
}

const SETTING_STEP_COUNT = 10;

export function useWorkflowProgress(projectId: string): WorkflowProgress {
  const { data: outlineTree, isLoading: outlineLoading, refetch: refetchOutline } =
    trpc.project.getOutlineTree.useQuery({ projectId });

  const { data: allSettings, isLoading: settingsLoading, refetch: refetchSettings } =
    trpc.project.listSettings.useQuery({ projectId });

  let hasVolumes = false;
  let hasUnits = false;
  let hasChapters = false;
  let chapterTotal = 0;
  let chapterDraft = 0;
  let chapterFinal = 0;

  if (outlineTree) {
    hasVolumes = outlineTree.length > 0;
    for (const vol of outlineTree) {
      const volData = vol as { units?: { chapters?: { status?: string | null }[] }[] };
      if (volData.units && volData.units.length > 0) {
        hasUnits = true;
        for (const unit of volData.units) {
          if (unit.chapters && unit.chapters.length > 0) {
            hasChapters = true;
            for (const ch of unit.chapters) {
              chapterTotal++;
              if (ch.status === 'final') chapterFinal++;
              else if (ch.status === 'draft') chapterDraft++;
            }
          }
        }
      }
    }
  }

  const settingCount = allSettings?.length ?? 0;
  const settingComplete = settingCount >= SETTING_STEP_COUNT;

  // 推导 phase
  let phase: WorkflowPhase = 'empty';
  if (chapterDraft > 0 || chapterFinal > 0) {
    phase = 'chapters_in_progress';
  } else if (hasChapters) {
    phase = 'chapters_ready';
  } else if (settingComplete) {
    phase = 'settings_done';
  } else if (settingCount > 0) {
    phase = 'settings_in_progress';
  } else if (hasUnits || hasVolumes) {
    phase = hasUnits ? 'outline_done' : 'outline_in_progress';
  }

  const refetch = useCallback(() => {
    refetchOutline();
    refetchSettings();
  }, [refetchOutline, refetchSettings]);

  return {
    phase,
    hasVolumes,
    hasUnits,
    hasChapters,
    settingCount,
    settingComplete,
    chapterTotal,
    chapterDraft,
    chapterFinal,
    isLoading: outlineLoading || settingsLoading,
    refetch,
  };
}
