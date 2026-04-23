import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType, SectionType, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

interface ExportChapter {
  id: string;
  title: string;
  synopsis?: string | null;
  status?: string | null;
  finalContent?: string | null;
}

interface ExportUnit {
  id: string;
  title: string;
  synopsis?: string | null;
  chapters: ExportChapter[];
}

interface ExportVolume {
  id: string;
  title: string;
  synopsis?: string | null;
  units: ExportUnit[];
}

interface ExportData {
  projectTitle: string;
  projectSynopsis?: string | null;
  volumes: ExportVolume[];
  selectedChapters?: Set<string>; // if undefined, export all
  /** 故事脉络（全书故事脉络总纲） */
  storyNarrative?: { id: string; title: string; content: string } | null;
}

// 构建文件夹路径文本（用于 docx 中的目录结构展示）
function buildFolderStructure(data: ExportData): string {
  let result = `${data.projectTitle}\n`;
  result += '├── 全书介绍\n';
  for (let vi = 0; vi < data.volumes.length; vi++) {
    const vol = data.volumes[vi];
    const isLastVol = vi === data.volumes.length - 1;
    const volPrefix = isLastVol ? '└── ' : '├── ';
    result += `${volPrefix}${vol.title}\n`;
    for (let ui = 0; ui < vol.units.length; ui++) {
      const unit = vol.units[ui];
      const isLastUnit = ui === vol.units.length - 1;
      const unitPrefix = isLastVol ? (isLastUnit ? '    └── ' : '    ├── ') : (isLastUnit ? '├──     └── ' : '├──     ├── ');
      result += `${unitPrefix}${unit.title}\n`;
      for (let ci = 0; ci < unit.chapters.length; ci++) {
        const ch = unit.chapters[ci];
        const isLastCh = ci === unit.chapters.length - 1;
        const chPrefix = isLastUnit ? (isLastCh ? '        └── ' : '        ├── ') : (isLastCh ? '├──         └── ' : '├──         ├── ');
        result += `${chPrefix}${ch.title}\n`;
      }
    }
  }
  return result;
}

// 生成全书介绍文本
function generateProjectIntroduction(data: ExportData): string {
  let intro = `# ${data.projectTitle}\n\n`;
  if (data.projectSynopsis) {
    intro += `## 全书介绍\n${data.projectSynopsis}\n\n`;
  }

  // 统计信息
  let totalChapters = 0;
  let finalizedChapters = 0;
  for (const vol of data.volumes) {
    for (const unit of vol.units) {
      for (const ch of unit.chapters) {
        totalChapters++;
        if (ch.status === 'final') finalizedChapters++;
      }
    }
  }
  intro += `## 统计信息\n`;
  intro += `- 卷数：${data.volumes.length}\n`;
  intro += `- 总章节数：${totalChapters}\n`;
  intro += `- 已定稿章节：${finalizedChapters}\n`;
  intro += `- 待创作章节：${totalChapters - finalizedChapters}\n\n`;

  // 各卷梗概
  for (const vol of data.volumes) {
    intro += `### ${vol.title}\n`;
    if (vol.synopsis) {
      intro += `${vol.synopsis}\n\n`;
    } else {
      intro += `（暂无梗概）\n\n`;
    }
  }

  return intro;
}

// 生成章节内容文本
function generateChapterContent(ch: ExportChapter, volTitle: string, unitTitle: string): string {
  let content = `# ${ch.title}\n\n`;
  content += `> 所属：${volTitle} → ${unitTitle}\n`;
  content += `> 状态：${ch.status === 'final' ? '已定稿' : ch.status === 'draft' ? '草稿' : '待创作'}\n\n`;

  if (ch.synopsis) {
    content += `## 章节梗概\n${ch.synopsis}\n\n`;
  }

  if (ch.finalContent) {
    content += `## 正文内容\n${ch.finalContent}\n`;
  }

  return content;
}

// 从故事脉络和大纲数据中提取看点
function extractHighlights(data: ExportData): string[] {
  const highlights: string[] = [];
  const narrative = data.storyNarrative?.content || '';

  // 从脉络中提取核心冲突
  if (narrative.includes('核心冲突')) {
    const conflictMatch = narrative.match(/核心冲突[：:]\s*([\s\S]*?)(?:各卷主题|角色成长|$)/);
    if (conflictMatch) {
      highlights.push(`核心冲突：${conflictMatch[1].trim().slice(0, 100)}`);
    }
  }

  // 从各卷主题中提取亮点
  if (narrative.includes('各卷主题')) {
    const volumesThemeMatch = narrative.match(/各卷主题[：:]([\s\S]*?)$/);
    if (volumesThemeMatch) {
      const volThemes = volumesThemeMatch[1].trim();
      highlights.push(`多卷叙事：${volThemes.slice(0, 150)}`);
    }
  }

  // 基于卷数量生成结构亮点
  if (data.volumes.length > 1) {
    highlights.push(`宏大架构：共 ${data.volumes.length} 卷，层层递进的叙事结构`);
  }

  // 统计已定稿章节
  let finalCount = 0;
  for (const vol of data.volumes) {
    for (const unit of vol.units) {
      for (const ch of unit.chapters) {
        if (ch.status === 'final') finalCount++;
      }
    }
  }
  if (finalCount > 0) {
    highlights.push(`已完成 ${finalCount} 章定稿正文`);
  }

  // 题材类型亮点
  if (narrative.includes('主线剧情')) {
    const mainLineMatch = narrative.match(/主线剧情[：:]\s*([\s\S]*?)(?:核心冲突|各卷主题|$)/);
    if (mainLineMatch) {
      const mainLine = mainLineMatch[1].trim().slice(0, 100);
      if (mainLine) highlights.push(`主线剧情：${mainLine}`);
    }
  }

  if (highlights.length === 0) {
    highlights.push('跌宕起伏的故事情节', '丰满立体的人物形象', '扣人心弦的叙事节奏');
  }

  return highlights.slice(0, 6);
}

// 生成内容推荐语
function generateRecommendations(data: ExportData): string[] {
  const recs: string[] = [];
  const narrative = data.storyNarrative?.content || '';

  // 推荐语 1：基于主线
  if (narrative.includes('主线')) {
    const mainLineMatch = narrative.match(/主线[剧情]*[：:]\s*([^\n]+)/);
    if (mainLineMatch) {
      recs.push(`**故事主线**：${mainLineMatch[1].trim()}`);
    }
  }

  // 推荐语 2：基于卷结构
  if (data.volumes.length > 0) {
    const volSummaries: string[] = [];
    for (const vol of data.volumes.slice(0, 3)) {
      if (vol.synopsis) {
        volSummaries.push(`${vol.title}：${vol.synopsis.slice(0, 60)}...`);
      }
    }
    if (volSummaries.length > 0) {
      recs.push('**各卷亮点**：');
      volSummaries.forEach(s => recs.push(`  - ${s}`));
    }
  }

  // 推荐语 3：目标读者
  recs.push('**适合读者**：喜欢剧情驱动、角色成长线清晰的读者');

  // 推荐语 4：阅读建议
  if (data.volumes.length >= 3) {
    recs.push('**阅读建议**：建议按卷顺序阅读，体验完整的角色成长弧线');
  } else {
    recs.push('**阅读建议**：篇幅精炼，一气呵成');
  }

  return recs;
}

// 导出为 DOCX 格式
export async function exportOutlineDocx(data: ExportData, options?: { includeContent?: boolean }) {
  const includeContent = options?.includeContent ?? false;

  const children: any[] = [];

  // 封面标题
  children.push(
    new Paragraph({
      text: data.projectTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // ===== 全书内容简介（故事脉络 + 看点提炼 + 内容推荐） =====
  if (data.storyNarrative && data.storyNarrative.content) {
    children.push(
      new Paragraph({
        text: '全书内容简介',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 600, after: 200 },
      })
    );

    // 剧情梗概（来自故事脉络）
    children.push(
      new Paragraph({
        text: '剧情梗概',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    );
    const narrativeParagraphs = data.storyNarrative.content.split(/\n+/).filter(p => p.trim());
    for (const para of narrativeParagraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun(para.trim())],
          spacing: { after: 120 },
        })
      );
    }

    // 看点提炼
    children.push(
      new Paragraph({
        text: '看点提炼',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      })
    );
    const highlights = extractHighlights(data);
    for (const h of highlights) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `• ${h}`, bold: false }),
          ],
          spacing: { after: 80 },
        })
      );
    }

    // 内容推荐
    children.push(
      new Paragraph({
        text: '内容推荐',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      })
    );
    const recommendations = generateRecommendations(data);
    for (const r of recommendations) {
      children.push(
        new Paragraph({
          children: [new TextRun(r)],
          spacing: { after: 120 },
        })
      );
    }
  }

  // 全书介绍
  if (data.projectSynopsis) {
    children.push(
      new Paragraph({
        text: '全书介绍',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun(data.projectSynopsis)],
        spacing: { after: 200 },
      })
    );
  }

  // 统计信息
  let totalChapters = 0;
  let finalizedChapters = 0;
  for (const vol of data.volumes) {
    for (const unit of vol.units) {
      for (const ch of unit.chapters) {
        totalChapters++;
        if (ch.status === 'final') finalizedChapters++;
      }
    }
  }

  children.push(
    new Paragraph({
      text: '统计信息',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun(`卷数：${data.volumes.length}  总章节：${totalChapters}  已定稿：${finalizedChapters}`)],
      spacing: { after: 200 },
    })
  );

  // 各卷内容
  for (const vol of data.volumes) {
    // 分页符（除了第一卷）
    if (children.length > 5) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    children.push(
      new Paragraph({
        text: vol.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    if (vol.synopsis) {
      children.push(
        new Paragraph({
          text: '卷梗概',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun(vol.synopsis)],
          spacing: { after: 200 },
        })
      );
    }

    for (const unit of vol.units) {
      children.push(
        new Paragraph({
          text: unit.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
        })
      );

      if (unit.synopsis) {
        children.push(
          new Paragraph({
            children: [new TextRun(`单元梗概：${unit.synopsis}`)],
            spacing: { after: 100 },
          })
        );
      }

      for (const ch of unit.chapters) {
        children.push(
          new Paragraph({
            text: ch.title,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );

        if (ch.synopsis) {
          children.push(
            new Paragraph({
              children: [new TextRun(`梗概：${ch.synopsis}`)],
              spacing: { after: 100 },
            })
          );
        }

        children.push(
          new Paragraph({
            children: [new TextRun(`状态：${ch.status === 'final' ? '已定稿' : ch.status === 'draft' ? '草稿' : '待创作'}`)],
            spacing: { after: 200 },
          })
        );

        // 如果包含正文内容
        if (includeContent && ch.finalContent) {
          const plainText = ch.finalContent.replace(/<[^>]*>/g, '');
          const paragraphs = plainText.split(/\n\n+/).filter(p => p.trim());
          for (const para of paragraphs) {
            children.push(
              new Paragraph({
                children: [new TextRun(para.trim())],
                spacing: { after: 120 },
              })
            );
          }
        }
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${data.projectTitle}_大纲.docx`);
}

// 过滤数据：根据选中的章节
function filterBySelectedChapters(data: ExportData): ExportData {
  if (!data.selectedChapters || data.selectedChapters.size === 0) return data;

  const filteredVolumes: ExportVolume[] = [];
  for (const vol of data.volumes) {
    const filteredUnits: ExportUnit[] = [];
    for (const unit of vol.units) {
      const filteredChapters = unit.chapters.filter(ch => data.selectedChapters!.has(ch.id));
      if (filteredChapters.length > 0) {
        filteredUnits.push({ ...unit, chapters: filteredChapters });
      }
    }
    if (filteredUnits.length > 0) {
      filteredVolumes.push({ ...vol, units: filteredUnits });
    }
  }
  return { ...data, volumes: filteredVolumes };
}

// 主导出函数
export async function exportOutline(data: ExportData, format: 'docx' | 'pdf', options?: { includeContent?: boolean }) {
  const filteredData = filterBySelectedChapters(data);

  if (filteredData.volumes.length === 0) {
    alert('没有可导出的内容');
    return false;
  }

  if (format === 'docx') {
    await exportOutlineDocx(filteredData, options);
    return true;
  }

  // PDF 导出（VIP 功能，使用浏览器打印）
  alert('PDF 导出功能开发中，请使用 DOCX 格式导出后转换为 PDF');
  return false;
}
