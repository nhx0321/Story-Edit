'use client';

import { ChapterWorkspace } from '@/components/chapter/chapter-workspace';

export default function ChapterEditorPage({ params }: { params: { id: string; chapterId: string } }) {
  return (
    <ChapterWorkspace
      projectId={params.id}
      chapterId={params.chapterId}
    />
  );
}
