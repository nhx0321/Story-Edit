'use client';

import { useParams } from 'next/navigation';
import { ChapterWorkspace } from '@/components/chapter/chapter-workspace';

export default function ChapterEditorPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  return (
    <ChapterWorkspace
      projectId={id}
      chapterId={chapterId}
    />
  );
}
