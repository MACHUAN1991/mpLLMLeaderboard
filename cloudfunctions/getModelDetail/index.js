const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CACHE_COLLECTION = 'openrouter_models_cache';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';

// 厂商别名字典：排行榜模型名前缀 → OpenRouter provider 前缀
const PROVIDER_ALIASES = {
  'claude': 'anthropic/',
  'gpt': 'openai/',
  'o1': 'openai/',
  'o3': 'openai/',
  'o4': 'openai/',
  'gemini': 'google/',
  'gemma': 'google/',
  'llama': 'meta-llama/',
  'mistral': 'mistralai/',
  'mixtral': 'mistralai/',
  'qwen': 'qwen/',
  'deepseek': 'deepseek/',
  'grok': 'x-ai/',
  'command': 'cohere/',
  'yi': '01-ai/',
  'dbrx': 'databricks/',
  'phi': 'microsoft/',
  'internlm': 'internlm/',
  'jamba': 'ai21/',
  'nova': 'amazon/',
  'arc': 'stepfun/',
  'seed': 'bytedance/',
  'minimax': 'minimax/',
  'glm': 'zhipu/',
  'yi': '01-ai/',
  'sky': '01-ai/',
  'baichuan': 'baichuan/',
  'moonshot': 'moonshot/',
  'kimi': 'moonshot/',
  'smaug': 'openchat/',
  'openchat': 'openchat/',
  'neural': 'nousresearch/',
  'athene': 'nousresearch/',
  'dolphin': 'cognitivecomputations/',
  'falcon': 'tii/',
  'codegemma': 'google/',
  'codestral': 'mistralai/',
  'wizard': 'microsoft/',
  'snowflake': 'snowflake/',
  'amazon': 'amazon/',
  'anthracite': 'magi-1/',
  'hetzner': 'hetzner/',
  'mecha': 'mecha/',
};

/**
 * 归一化字符串：小写、去除非字母数字
 */
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 从 OpenRouter 模型 ID 提取 provider 前缀
 */
function getProviderPrefix(id) {
  const parts = (id || '').split('/');
  return parts.length > 1 ? parts[0] + '/' : '';
}

/**
 * Tier 1: 归一化精确匹配
 */
function tier1Match(queryNorm, models) {
  for (const m of models) {
    const idNorm = normalize(m.id);
    const nameNorm = normalize(m.name);
    // 检查模型 ID 的 name 部分是否完全匹配
    const idParts = (m.id || '').split('/');
    const idName = idParts.length > 1 ? idParts.slice(1).join('/') : m.id;
    if (normalize(idName) === queryNorm) {
      return { model: m, confidence: 1.0 };
    }
    // 检查完整名称包含查询词
    if (nameNorm.includes(queryNorm) && queryNorm.length >= 3) {
      return { model: m, confidence: 0.9 };
    }
  }
  return null;
}

/**
 * Tier 2: 厂商别名 + 精确匹配
 */
function tier2Match(query, models) {
  const queryLower = query.toLowerCase();
  for (const [alias, provider] of Object.entries(PROVIDER_ALIASES)) {
    if (queryLower.startsWith(alias) || queryLower.includes(alias)) {
      const providerModels = models.filter(m => getProviderPrefix(m.id) === provider);
      if (providerModels.length > 0) {
        // 去掉厂商前缀后做 Tier 1 匹配
        const remainder = query.replace(new RegExp('^' + alias, 'i'), '').trim();
        if (remainder) {
          const result = tier1Match(normalize(remainder), providerModels);
          if (result) return { model: result.model, confidence: Math.min(result.confidence, 0.85) };
        }
        // 如果没有 remainder，返回该厂商最高分的模型
        if (providerModels.length === 1) {
          return { model: providerModels[0], confidence: 0.7 };
        }
      }
    }
  }
  return null;
}

/**
 * Tier 3: Token 重叠评分
 */
function tier3Match(query, models) {
  const queryTokens = query.toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
  let best = null;
  let bestScore = 0;

  for (const m of models) {
    const nameTokens = (m.name || '').toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
    const idTokens = (m.id || '').toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
    const allTokens = new Set([...nameTokens, ...idTokens]);

    // 计算 query token 在模型名中的匹配数
    let matchCount = 0;
    let numericBonus = 0;
    for (const qt of queryTokens) {
      for (const at of allTokens) {
        if (at === qt || at.includes(qt) || qt.includes(at)) {
          matchCount++;
          // 数字 token 匹配加分
          if (/\d/.test(qt) && qt === at) numericBonus += 0.1;
          break;
        }
      }
    }

    const score = (matchCount / queryTokens.length) * 0.8 + numericBonus;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  if (best && bestScore >= 0.5) {
    return { model: best, confidence: bestScore * 0.8 };
  }
  return null;
}

/**
 * Tier 4: 模糊子串匹配
 */
function tier4Match(query, models) {
  const q = normalize(query);
  if (q.length < 3) return null;

  let best = null;
  let bestScore = 0;

  for (const m of models) {
    const nameNorm = normalize(m.name);
    const idNorm = normalize(m.id);

    if (nameNorm.includes(q) || q.includes(nameNorm)) {
      const score = Math.min(q.length, nameNorm.length) / Math.max(q.length, nameNorm.length);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    } else if (idNorm.includes(q) || q.includes(idNorm)) {
      const score = Math.min(q.length, idNorm.length) / Math.max(q.length, idNorm.length);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
  }

  if (best && bestScore >= 0.4) {
    return { model: best, confidence: bestScore * 0.6 };
  }
  return null;
}

/**
 * 分层匹配模型名
 */
function matchModel(modelName, models) {
  const queryNorm = normalize(modelName);

  // Tier 1: 归一化精确匹配
  let result = tier1Match(queryNorm, models);
  if (result && result.confidence >= 0.9) return result;

  // Tier 2: 厂商别名匹配
  result = tier2Match(modelName, models);
  if (result && result.confidence >= 0.7) return result;

  // Tier 3: Token 重叠
  result = tier3Match(modelName, models);
  if (result && result.confidence >= 0.5) return result;

  // Tier 4: 模糊子串
  result = tier4Match(modelName, models);
  if (result) return result;

  // 返回 Tier 1/2 中最佳结果（即使置信度较低）
  const t1 = tier1Match(queryNorm, models);
  const t2 = tier2Match(modelName, models);
  const candidates = [t1, t2].filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  if (candidates.length > 0 && candidates[0].confidence >= 0.4) {
    return candidates[0];
  }

  return null;
}

/**
 * 获取模型列表（带缓存）
 */
async function getModels() {
  const db = cloud.database();
  const now = Date.now();

  // 尝试读取缓存
  try {
    const cacheRes = await db.collection(CACHE_COLLECTION).limit(1).get();
    if (cacheRes.data && cacheRes.data.length > 0) {
      const cached = cacheRes.data[0];
      if (cached.lastFetched && (now - cached.lastFetched) < CACHE_TTL) {
        console.log('使用缓存的模型数据');
        return cached.models;
      }
    }
  } catch (err) {
    console.log('缓存读取失败，将重新获取:', err.message);
  }

  // 从 OpenRouter API 获取
  console.log('从 OpenRouter API 获取模型数据...');
  const response = await axios.get(OPENROUTER_API, { timeout: 30000 });
  const models = response.data.data || [];
  console.log(`获取到 ${models.length} 个模型`);

  // 写入缓存（upsert）
  try {
    // 删除旧缓存
    const oldCache = await db.collection(CACHE_COLLECTION).limit(1).get();
    if (oldCache.data && oldCache.data.length > 0) {
      await db.collection(CACHE_COLLECTION).doc(oldCache.data[0]._id).remove();
    }
    // 写入新缓存
    await db.collection(CACHE_COLLECTION).add({
      data: { models, lastFetched: now }
    });
  } catch (err) {
    console.log('缓存写入失败:', err.message);
  }

  return models;
}

/**
 * 格式化模型详情返回
 */
function formatModelDetail(model) {
  const pricing = model.pricing || {};
  return {
    id: model.id,
    name: model.name,
    description: model.description || '',
    pricing: {
      prompt: pricing.prompt || '0',
      completion: pricing.completion || '0',
      image: pricing.image || '0'
    },
    context_length: model.context_length || 0,
    architecture: {
      modality: model.architecture?.modality || '',
      tokenizer: model.architecture?.tokenizer || '',
      instruct_type: model.architecture?.instruct_type || ''
    },
    supported_parameters: model.supported_parameters || [],
    top_provider: {
      max_completion_tokens: model.top_provider?.max_completion_tokens || 0,
      is_moderated: model.top_provider?.is_moderated || false
    },
    knowledge_cutoff: model.knowledge_cutoff || null
  };
}

/**
 * 云函数入口
 */
exports.main = async (event) => {
  const { modelName } = event;

  if (!modelName) {
    return { success: false, error: '缺少模型名称' };
  }

  try {
    const models = await getModels();
    const result = matchModel(modelName, models);

    if (!result) {
      return { success: true, data: null, matchFound: false, query: modelName };
    }

    console.log(`匹配成功: "${modelName}" → "${result.model.name}" (置信度: ${result.confidence.toFixed(2)})`);

    return {
      success: true,
      data: formatModelDetail(result.model),
      matchFound: true,
      matchConfidence: result.confidence,
      query: modelName
    };
  } catch (err) {
    console.error('获取模型详情失败:', err);
    return {
      success: false,
      error: err.message || '获取模型详情失败'
    };
  }
};
