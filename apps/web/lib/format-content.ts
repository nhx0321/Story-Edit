/**
 * 章节正文自动排版工具
 *
 * 对导入到草稿编辑器的章节正文进行自动排版、换行处理：
 * 1. 将连续文本按段落拆分为独立段落
 * 2. 段落之间用空行分隔
 * 3. 合并多余空行
 * 4. 修剪首尾空白
 */

/**
 * 判断字符串是否为纯文本（不含 HTML 标签）
 */
function isPlainText(content: string): boolean {
  return !/<[a-z][\s\S]*>/i.test(content);
}

/**
 * 从 HTML 中提取纯文本内容（剥离标签，保留段落结构）
 */
function htmlToText(html: string): string {
  // 将块级标签替换为换行
  let text = html
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n\n')
    .replace(/<[^>]+>/g, '') // 移除其他所有标签
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return text;
}

/**
 * 格式化章节正文
 * 输入可为纯文本或 HTML，输出为格式化的 HTML
 */
export function formatChapterContent(content: string): string {
  if (!content || !content.trim()) return '';

  let text: string;

  if (isPlainText(content)) {
    text = content;
  } else {
    text = htmlToText(content);
  }

  // 统一换行符
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 将连续的空白行合并为一个
  text = text.replace(/\n{3,}/g, '\n\n');

  // 按段落拆分（段落由两个以上换行分隔）
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  if (paragraphs.length === 0) return '';

  // 对每个段落内部：将单个换行视为段落内换行（非分段）
  // 但中文段落通常不应有硬换行，所以将单换行替换为空格（除非是对话中的换行）
  const formattedParagraphs = paragraphs.map(p => {
    // 如果段落中有对话标记（引号括起来的行），保留其内部的换行结构
    const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return p;

    // 多行段落：判断是否包含对话
    const hasDialogue = lines.some(l => /^["""「『]/.test(l) || /["""」』]$/.test(l));
    if (hasDialogue) {
      // 对话段落保留换行，用 <br> 连接
      return lines.join('<br>');
    }
    // 非对话段落，将单换行合并（中文文本不应在段落内断行）
    return lines.join('');
  });

  // 构建 HTML
  const html = formattedParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');

  return html;
}

/**
 * 将纯文本中的段落转为 HTML 段落格式
 * 用于 AI 生成或粘贴的纯文本内容
 */
export function textToParagraphs(text: string): string {
  if (!text || !text.trim()) return '';

  // 统一换行符
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 合并多余空行
  text = text.replace(/\n{3,}/g, '\n\n');

  // 拆分段落
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  if (paragraphs.length === 0) return '';

  return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
