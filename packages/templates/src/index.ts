// @story-edit/templates — 内置模板（方法论/风格/结构/自检清单）

export interface Template {
  id: string;
  name: string;
  category: 'methodology' | 'style' | 'structure' | 'checklist' | 'setting';
  description: string;
  content: string;
}

// 内置模板将在此注册
const builtinTemplates: Template[] = [];

export function getTemplates(category?: Template['category']): Template[] {
  if (!category) return builtinTemplates;
  return builtinTemplates.filter(t => t.category === category);
}

export function getTemplate(id: string): Template | undefined {
  return builtinTemplates.find(t => t.id === id);
}
