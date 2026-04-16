// 精灵形象生成（通义万相 API）
import https from 'https';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const IMAGE_API_HOST = 'dashscope.aliyuncs.com';

// Prompt 模板
const PROMPT_TEMPLATES: Record<string, Record<string, string>> = {
  plant: {
    sunflower: '低多边形可爱风格，植物系向日葵精灵，{level}，金黄色调配翠绿，简单纯色背景，安静站立，Pokemon风格，可爱，卡通角色设计，Q版，正面视角',
  },
  animal: {
    fox: '低多边形可爱风格，动物系小狐狸精灵，{level}，橙红色调配白色腹部，简单纯色背景，安静站立，Pokemon风格，可爱，卡通角色设计，Q版，正面视角',
  },
  element: {
    wind: '低多边形可爱风格，元素系小风灵精灵，{level}，蓝白色调半透明飘渺感，简单纯色背景，安静悬浮，Pokemon风格，可爱，卡通角色设计，Q版，正面视角',
  },
};

// 等级描述
const LEVEL_DESC: Record<number, string> = {
  1: '幼小初生形态，体型小巧',
  2: '体型略大，更加活泼',
  3: '成长形态，更加成熟',
  4: '成熟形态，体型更大',
  5: '进阶形态，增添装饰元素',
  6: '高级形态，优雅灵动',
  7: '精英形态，华丽配饰',
  8: '大师形态，光芒环绕',
  9: '终极满级形态，光芒璀璨',
};

export interface SpriteImageParams {
  species: string;
  variant: string;
  level: number;
  customPrompt?: string;
  fullPrompt?: string;
}

function httpPost(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: IMAGE_API_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON response: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(postData);
    req.end();
  });
}

function httpGet(path: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: IMAGE_API_HOST,
      path,
      method: 'GET',
      headers,
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON response: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateSpriteImage(params: SpriteImageParams): Promise<string> {
  if (!DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY 未配置');

  const template = PROMPT_TEMPLATES[params.species]?.[params.variant];
  if (!template) throw new Error(`不支持的系别/种类: ${params.species}/${params.variant}`);

  const levelDesc = LEVEL_DESC[params.level] || '';
  const prompt = params.customPrompt || template.replace('{level}', levelDesc);
  params.fullPrompt = prompt;

  // 1. 提交图像生成任务
  const submitBody = {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt },
    parameters: { size: '1024*1024', n: 1 },
  };

  const submitResult = await httpPost('/api/v1/services/aigc/text2image/image-synthesis', submitBody, {
    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    'X-DashScope-Async': 'enable',
  }) as { output?: { task_id: string }; message?: string };

  if (!submitResult.output?.task_id) {
    throw new Error(`图像生成提交失败: ${submitResult.message || '未知错误'}`);
  }

  const taskId = submitResult.output.task_id;

  // 2. 轮询任务状态
  const maxAttempts = 30;
  const pollInterval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await wait(pollInterval);

    const statusResult = await httpGet(`/api/v1/tasks/${taskId}`, {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    }) as { output?: { task_status: string; results?: { url: string }[] }; message?: string };

    const status = statusResult.output?.task_status;

    if (status === 'SUCCEEDED') {
      const imageUrl = statusResult.output?.results?.[0]?.url;
      if (!imageUrl) throw new Error('图像生成成功但未返回图片URL');
      return imageUrl;
    }

    if (status === 'FAILED') {
      throw new Error(`图像生成失败: ${statusResult.message || '未知错误'}`);
    }
  }

  throw new Error('图像生成超时');
}
