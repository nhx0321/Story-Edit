const https = require('https');
const fs = require('fs');
const API_KEY = 'sk-b9f05ffbd4bf423ebc24d0629cea0bc5';

// 读取本地图片并转为 base64 data URI
function imageToDataUri(filepath) {
  const data = fs.readFileSync(filepath);
  const base64 = data.toString('base64');
  return 'data:image/png;base64,' + base64;
}

// 参考图路径（用户认可的版本）
const refFox = '精灵美术参考图/风格E-Q版圆润狐.png';
const refSunflower = '精灵美术参考图/道具D-生长药剂.png';
const refWind = '精灵美术参考图/风灵精灵-1级.png';

// 6张图: 3个能量蛋 + 3个L1精灵
const jobs = [
  {
    name: 'egg-plant-L0',
    ref: null,
    prompt: 'cute energy orb sphere, plant type, translucent bright green glowing ball floating in air, small green leaf particles orbiting around sphere, soft organic material, solid white background, centered, 3D game asset'
  },
  {
    name: 'egg-animal-L0',
    ref: null,
    prompt: 'cute energy orb sphere, animal type, translucent warm orange glowing ball floating in air, tiny paw print shapes orbiting around sphere, soft clay-like material, solid white background, centered, 3D game asset'
  },
  {
    name: 'egg-element-L0',
    ref: null,
    prompt: 'cute energy orb sphere, element type, translucent light-blue glowing ball floating in air, spiral wind energy waves orbiting around sphere, soft jelly-like material, solid white background, centered, 3D game asset'
  },
  {
    name: 'fox-L1',
    ref: refFox,
    prompt: 'Same character style as reference, extremely cute baby fox, chibi 3D character, big round head with small body, oversized pointed ears with dark inner tips, large round amber eyes with sparkles, orange fur with white belly, fluffy round tail wrapping around body, standing on hind legs with arms spread, soft clay material, solid white background, centered'
  },
  {
    name: 'sunflower-L1',
    ref: refSunflower,
    prompt: 'Same character style as reference, cute sunflower sprite creature, chibi 3D character, round yellow flower head with chubby rounded petals, brown flower center face with two big black round eyes and small smile, green leaf arms, short green stem body, two small green leaf feet, standing pose, soft clay material, solid white background, centered, game character'
  },
  {
    name: 'wind-L1',
    ref: refWind,
    prompt: 'Same character style as reference, extremely cute baby wind spirit, chibi 3D character, translucent light-blue spherical body with soft glow, two big round sparkling blue eyes, tiny wisp cloud arms, tiny cloud feet, floating pose, soft jelly-like material, solid white background, centered'
  }
];

function submitTask(prompt, refImageUrl) {
  return new Promise((resolve, reject) => {
    const body = {
      model: 'wan2.6-image',
      input: {
        prompt: prompt
      },
      parameters: {
        size: '512*512',
        n: 1
      }
    };
    if (refImageUrl) {
      body.input.ref_image = refImageUrl;
    }
    const data = JSON.stringify(body);
    const options = {
      hostname: 'dashscope.aliyuncs.com',
      path: '/api/v1/services/aigc/image-generation/generation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'X-DashScope-Async': 'enable',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.output && result.output.task_id) resolve(result.output.task_id);
          else reject('No task_id: ' + JSON.stringify(result).slice(0, 500));
        } catch (e) { reject('Parse: ' + e.message + ' Body: ' + body.slice(0, 500)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject('Timeout'); });
    req.write(data);
  });
}

function pollTask(taskId) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      attempts++;
      const options = {
        hostname: 'dashscope.aliyuncs.com',
        path: '/api/v1/tasks/' + taskId,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + API_KEY }
      };
      const req = https.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            const status = result.output ? result.output.task_status : undefined;
            if (status === 'SUCCEEDED') {
              const url = result.output.results ? result.output.results[0].url : undefined;
              if (url) resolve(url); else reject('No URL in result');
            } else if (status === 'FAILED') reject('Task failed: ' + JSON.stringify(result.output).slice(0, 300));
            else if (attempts > 80) reject('Too many attempts, status=' + status);
            else setTimeout(poll, 3000);
          } catch (e) { reject('Parse: ' + e.message); }
        });
      });
      req.on('error', reject);
      req.end();
    };
    poll();
  });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const file = fs.createWriteStream(filepath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dir = '精灵美术参考图/final';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('共 ' + jobs.length + ' 张图片，开始提交...');
  const taskIds = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      let refUri = null;
      if (job.ref && fs.existsSync(job.ref)) {
        refUri = imageToDataUri(job.ref);
        console.log('  [' + (i+1) + '/' + jobs.length + '] ' + job.name + ' [有参考图]');
      } else {
        console.log('  [' + (i+1) + '/' + jobs.length + '] ' + job.name + ' [无参考图]');
      }
      const taskId = await submitTask(job.prompt, refUri);
      taskIds.push({ name: job.name, taskId: taskId });
      console.log('    -> ' + taskId);
    } catch (e) {
      console.log('  [' + (i+1) + '/' + jobs.length + '] ' + job.name + ' 提交失败: ' + e.message);
    }
    await sleep(1000);
  }

  console.log('\n全部提交完成，开始轮询下载...\n');
  let success = 0, failed = 0;
  for (let i = 0; i < taskIds.length; i++) {
    const name = taskIds[i].name;
    const taskId = taskIds[i].taskId;
    console.log('[' + (i+1) + '/' + taskIds.length + '] ' + name + '...');
    try {
      const url = await pollTask(taskId);
      const filepath = dir + '/' + name + '.png';
      await downloadImage(url, filepath);
      console.log('  OK: ' + name);
      success++;
    } catch (e) {
      console.log('  FAIL: ' + e.message);
      failed++;
    }
  }
  console.log('\n完成: 成功 ' + success + ', 失败 ' + failed);
}

main().catch(console.error);
