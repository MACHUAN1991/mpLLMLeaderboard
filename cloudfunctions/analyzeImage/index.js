const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// MiniMax API 配置
const MINIMAX_API_KEY = 'sk-cp-IZRYLuOD2w5M9nMBUppkBvylueSSieRXFq5TPw_C7xYu4JqsKCRqjsUMQgnOuafMgD_NXgvol7x-uzc5oOBxuohPBa0H97X4vNKr0NCkEgc_PzJiOwjGMw0';
// 国内版 Token Plan 视觉理解端点
const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/coding_plan/vlm';

/**
 * 从微信云存储获取临时访问链接
 */
async function getTempFileURL(fileList) {
  try {
    const result = await cloud.getTempFileURL({ fileList });
    return result.fileList;
  } catch (err) {
    console.error('获取临时链接失败:', err);
    throw new Error('获取图片链接失败');
  }
}

/**
 * 下载图片并转为 base64
 */
async function downloadImageAsBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024
    });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error('下载图片失败:', err);
    throw new Error('下载图片失败');
  }
}

/**
 * 根据来源构建不同的解析提示词
 */
function buildPrompt(source) {
  const baseFields = `1. 排名（Rank）
2. 模型名称（Model Name）
3. 模型厂商/组织（Organization）
4. 分数（Score）
5. 该截图的发布日期（Date）`;

  if (source === 'artificial-analysis') {
    return `请解析这张Artificial Analysis大模型排名截图，提取以下信息并以JSON格式返回：
${baseFields}
6. 价格（Price）- 模型的使用价格/成本，格式为原始文本（如"$0.50/M tokens"、"免费"等），如果无法提取请返回null
7. 速度（Speed）- 模型的响应速度/tokens per second，格式为原始文本（如"150 tok/s"），如果无法提取请返回null
如果某个字段无法提取，请返回null。请只返回JSON，不要包含其他文字。`;
  }

  const sourceName = source === 'huggingface' ? 'HuggingFace' : 'Arena';
  return `请解析这张${sourceName}大模型排名截图，提取以下信息并以JSON格式返回：
${baseFields}
如果某个字段无法提取，请返回null。请只返回JSON，不要包含其他文字。`;
}

/**
 * 调用 MiniMax 视觉理解 API
 */
async function analyzeWithBase64(base64Image, source) {
  try {
    console.log('调用 MiniMax API...');
    const response = await axios.post(
      MINIMAX_API_URL,
      {
        prompt: buildPrompt(source),
        image_url: base64Image
      },
      {
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000,  // 60秒超时
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );
    return response.data;
  } catch (err) {
    console.error(`MiniMax API 调用失败:`, err.message);
    throw new Error('AI 图片解析失败');
  }
}

/**
 * 方式2: 直接使用图片 URL
 */
async function analyzeWithUrl(imageUrl, source) {
  try {
    const response = await axios.post(
      MINIMAX_API_URL,
      {
        prompt: buildPrompt(source),
        image_url: imageUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );
    return response.data;
  } catch (err) {
    console.error('MiniMax API (URL) 调用失败:', err.response?.data || err.message);
    throw new Error('AI 图片解析失败');
  }
}

/**
 * 解析 MiniMax 返回的结果，提取 JSON
 */
function parseAIResponse(content) {
  try {
    // content 可能是字符串（包含 markdown 代码块）或直接是数组/对象
    let text = content;
    if (typeof content === 'object' && content !== null) {
      // 如果是对象，直接返回
      return content;
    }

    // 如果是字符串，先去除 markdown 代码块
    if (typeof text === 'string') {
      // 去除 ```json 和 ``` 等标记
      text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    }

    // 尝试直接解析为 JSON（可能是数组）
    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch {
      // 如果直接解析失败，尝试提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // 尝试提取 JSON 对象
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        return JSON.parse(objMatch[0]);
      }
    }
    return null;
  } catch (err) {
    console.error('解析 AI 返回结果失败:', err);
    return null;
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { fileID, source } = event;

  if (!fileID) {
    return { success: false, error: '缺少图片文件ID' };
  }

  try {
    // 1. 获取云存储图片的临时访问链接
    console.log('正在获取图片临时链接:', fileID);
    const fileList = await getTempFileURL([fileID]);

    if (!fileList[0] || !fileList[0].tempFileURL) {
      throw new Error('无法获取图片访问链接');
    }

    const imageUrl = fileList[0].tempFileURL;
    console.log('图片临时链接获取成功');

    // 2. 下载图片并转为 base64（微信云存储链接无法直接作为图片URL）
    console.log('正在下载图片并转为 base64...');
    const base64Image = await downloadImageAsBase64(imageUrl);
    console.log('图片下载完成，base64 长度:', base64Image.length);

    // 3. 调用 MiniMax API 分析图片
    console.log('正在调用 MiniMax AI 分析...');
    const aiResult = await analyzeWithBase64(base64Image, source);
    console.log('AI 返回结果:', JSON.stringify(aiResult).substring(0, 500));

    // 4. 解析 AI 返回结果
    let parsedResult = null;
    // 优先从 content 字段获取（MiniMax VLM 通常返回这个格式）
    const aiContent = aiResult.content || aiResult.output?.text || aiResult.output?.content;
    if (aiContent) {
      parsedResult = parseAIResponse(aiContent);
    } else if (aiResult.choices?.[0]?.message?.content) {
      parsedResult = parseAIResponse(aiResult.choices[0].message.content);
    } else {
      parsedResult = aiResult;
    }

    // 5. 标准化数据格式（处理数组和对象两种情况）
    let normalizedData;
    if (Array.isArray(parsedResult)) {
      // 数组格式：直接使用，提取日期
      normalizedData = {
        Ranking: parsedResult,
        Date: parsedResult[0]?.Date || ''
      };
    } else if (parsedResult?.Ranking) {
      // 对象格式：{Ranking: [...], Date: ...}
      normalizedData = parsedResult;
    } else {
      // 其他格式
      normalizedData = parsedResult;
    }

    // 6. 返回结果
    return {
      success: true,
      data: normalizedData,
      rawResponse: aiResult
    };

  } catch (err) {
    console.error('图片分析失败:', err);
    return {
      success: false,
      error: err.message || '图片分析失败'
    };
  }
};
