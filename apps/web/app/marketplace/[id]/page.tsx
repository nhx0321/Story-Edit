'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function MarketplaceItemPage({ params }: { params: { id: string } }) {
  const [userRating, setUserRating] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [showProjectSelect, setShowProjectSelect] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showReplies, setShowReplies] = useState<Record<string, boolean>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const { data: item, isLoading } = trpc.template.getById.useQuery({ id: params.id });
  const { data: myProjects } = trpc.project.list.useQuery();
  const { data: comments } = trpc.template.getComments.useQuery({ templateId: params.id, parentId: null });

  const likeMutation = trpc.template.like.useMutation({
    onSuccess: () => utils.template.getById.invalidate({ id: params.id }),
  });
  const rateMutation = trpc.template.rate.useMutation();
  const importMutation = trpc.template.smartImport.useMutation();
  const addComment = trpc.template.addComment.useMutation({
    onSuccess: () => utils.template.getComments.invalidate({ templateId: params.id, parentId: null }),
  });
  const addReply = trpc.template.addComment.useMutation({
    onSuccess: () => utils.template.getComments.invalidate({ templateId: params.id, parentId: null }),
  });
  const deleteComment = trpc.template.deleteComment.useMutation({
    onSuccess: () => utils.template.getComments.invalidate({ templateId: params.id, parentId: null }),
  });
  const utils = trpc.useUtils();

  const handleLike = () => {
    if (!confirm('点赞将消耗 1 精灵豆，确认继续？')) return;
    likeMutation.mutate({ templateId: params.id });
  };
  const handleRate = (score: number) => {
    setUserRating(score);
    rateMutation.mutate({ templateId: params.id, score });
  };
  const handleImport = async () => {
    if (!confirm('导入将消耗 10 精灵豆，确认继续？')) return;
    if (!projectId) return;
    try {
      const result = await importMutation.mutateAsync({
        templateId: params.id,
        projectId,
      });
      alert(`导入成功：${result.message}`);
      setShowProjectSelect(false);
    } catch (e: any) {
      alert(e.message || '导入失败');
    }
  };
  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate({ templateId: params.id, content: commentText });
    setCommentText('');
  };
  const handleReply = (parentId: string) => {
    const text = replyTexts[parentId] || '';
    if (!text.trim()) return;
    addReply.mutate({ templateId: params.id, content: text, parentId });
    setReplyTexts(prev => ({ ...prev, [parentId]: '' }));
  };

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  if (!item) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">模板不存在</div>;

  const isPaid = !item.isLimited;
  const priceCents = item.price ?? 0;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <a href="/marketplace" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回模板广场</a>
        <div className="bg-white rounded-xl border border-gray-200 p-8 mt-4">
          {/* 标签 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category || '未分类'}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              item.source === 'official' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>{item.source === 'official' ? '官方' : '用户上传'}</span>
            {item.source === 'official' ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">免费</span>
            ) : (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">1豆预览 · 10豆导入</span>
            )}
          </div>

          <h1 className="text-2xl font-bold mb-2">{item.title}</h1>
          <p className="text-gray-500 mb-4">{item.description}</p>

          {/* 统计 */}
          <div className="flex items-center gap-6 text-sm text-gray-400 mb-6">
            <span>{item.viewCount} 浏览</span>
            <span>{item.importCount} 导入</span>
            <span>{item.commentsCount} 评论</span>
            <span>评分 {typeof item.avgRating === 'number' ? item.avgRating.toFixed(1) : '暂无'} ({item.ratingCount} 人)</span>
            <span>{item.likeCount} 点赞</span>
          </div>

          {/* 上传者信息 */}
          {item.uploader && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
              <span className="text-base">{item.uploader.avatarUrl || '👤'}</span>
              <span className="text-sm text-gray-600">{item.uploader.nickname || '未知用户'}</span>
              {item.uploader.vipLevel && item.uploader.vipLevel !== '免费版' && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  item.uploader.vipLevel === '年费VIP' ? 'bg-yellow-100 text-yellow-700'
                  : item.uploader.vipLevel === 'VIP' ? 'bg-blue-100 text-blue-700'
                  : 'bg-green-100 text-green-700'
                }`}>{item.uploader.vipLevel}</span>
              )}
            </div>
          )}

          {/* 点赞和评分 */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <button onClick={handleLike}
              className="text-sm text-gray-500 hover:text-red-500 transition">
              ♥ 点赞
            </button>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400 mr-1">评分：</span>
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} onClick={() => handleRate(i)}
                  className={`text-lg ${i <= userRating ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition`}>
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* 内容展示 */}
          <div className="prose prose-gray max-w-none mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {isPaid ? '完整内容' : '预览内容'}
            </h3>
            {item.content ? (
              <>
                <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-96 overflow-y-auto">
                  {item.content}
                </pre>
                {item.isLimited && item.source === 'user' && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-amber-700">以上为预览内容，点赞需 1 精灵豆，导入需 10 精灵豆</p>
                    <button onClick={() => handleLike()}
                      className="mt-2 px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
                      1 豆点赞预览
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500">暂无内容</p>
            )}
          </div>

          {/* 模板使用建议 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">模板使用建议</h3>
            <ul className="text-xs text-amber-700 space-y-1.5">
              <li>• 模板不是越多越好，选择适合项目需求的模板即可</li>
              <li>• 导入后请精简提示词，避免在项目中重复调用相似内容</li>
              <li>• 模板只会更新已有的角色，不会创建新的 AI 角色</li>
            </ul>
          </div>

          {/* 操作按钮 */}
          {!item.isLimited && (
            <div className="flex gap-3">
              <div className="relative flex-1">
                <button onClick={() => setShowProjectSelect(!showProjectSelect)}
                  className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition">
                  智能导入
                </button>
                {showProjectSelect && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-lg border border-gray-200 shadow-lg p-3">
                    <p className="text-xs text-gray-500 mb-2 font-medium">选择目标项目</p>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-3">
                      <option value="">请选择项目</option>
                      {myProjects?.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {/* 导入目标提示 */}
                    <div className="text-xs bg-blue-50 text-blue-600 rounded-lg p-2 mb-3">
                      {item.category === 'setting' && '📋 设定模板将导入到项目设定中'}
                      {item.category === 'style' && '📋 风格模板将追加到已有的小说作者参考中（不会创建新角色）'}
                      {item.category === 'structure' && '📋 结构模板将追加到已有的文学编辑参考中（不会创建新角色）'}
                      {item.category === 'methodology' && '📋 方法论模板将追加到已有的文学编辑参考中（不会创建新角色）'}
                      {item.category === 'ai_prompt' && '📋 提示词模板将更新已有的同名AI角色（不会创建新角色）'}
                      {!item.category && '📋 模板将导入到项目中已有的角色'}
                    </div>
                    <button onClick={handleImport}
                      disabled={!projectId || importMutation.isPending}
                      className="w-full py-1.5 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      {importMutation.isPending ? '导入中...' : '确认导入'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 评论区 */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mt-4">
          <h3 className="text-base font-medium mb-4">评论 ({item.commentsCount})</h3>

          {/* 发表评论 */}
          <div className="mb-6">
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
              placeholder="写下你的评论..." />
            <button onClick={handleAddComment} disabled={addComment.isPending || !commentText.trim()}
              className="mt-2 px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              发表评论
            </button>
          </div>

          {/* 评论列表 */}
          <div className="space-y-3">
            {comments?.map(c => (
              <CommentItem key={c.id} comment={c} templateId={params.id}
                onReply={(parentId, text) => {
                  setReplyTexts(prev => ({ ...prev, [parentId]: text }));
                }}
                replyText={replyTexts[c.id] || ''}
                onDelete={() => deleteComment.mutate({ commentId: c.id })} />
            ))}
            {comments?.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">暂无评论</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function CommentItem({ comment, templateId, onReply, replyText, onDelete }: {
  comment: { id: string; content: string; userId: string; createdAt: string };
  templateId: string;
  onReply: (parentId: string, text: string) => void;
  replyText: string;
  onDelete: () => void;
}) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const utils = trpc.useUtils();

  const addReply = trpc.template.addComment.useMutation({
    onSuccess: () => utils.template.getComments.invalidate({ templateId, parentId: null }),
  });

  const handleReply = () => {
    if (!replyText.trim()) return;
    addReply.mutate({ templateId, content: replyText, parentId: comment.id });
    setShowReplyBox(false);
  };

  return (
    <div className="border-b border-gray-100 pb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-700">{comment.content}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleDateString('zh-CN')}</span>
            <button onClick={() => setShowReplyBox(!showReplyBox)}
              className="text-xs text-gray-400 hover:text-gray-600">回复</button>
          </div>
        </div>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 shrink-0 ml-2">删除</button>
      </div>

      {showReplyBox && (
        <div className="mt-2 flex gap-2">
          <input value={replyText}
            onChange={e => onReply(comment.id, e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5"
            placeholder="回复..." />
          <button onClick={handleReply}
            className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 transition">
            发送
          </button>
        </div>
      )}
    </div>
  );
}
