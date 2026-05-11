const CACHE_KEY = 'openrouter_models_cache';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6小时

// 厂商别名字典
const PROVIDER_ALIASES = {
  'claude': 'anthropic/', 'gpt': 'openai/', 'o1': 'openai/', 'o3': 'openai/', 'o4': 'openai/',
  'gemini': 'google/', 'gemma': 'google/', 'llama': 'meta-llama/', 'mistral': 'mistralai/',
  'mixtral': 'mistralai/', 'qwen': 'qwen/', 'deepseek': 'deepseek/', 'grok': 'x-ai/',
  'command': 'cohere/', 'yi': '01-ai/', 'phi': 'microsoft/', 'internlm': 'internlm/',
  'jamba': 'ai21/', 'nova': 'amazon/', 'arc': 'stepfun/', 'seed': 'bytedance/',
  'minimax': 'minimax/', 'glm': 'zhipu/', 'baichuan': 'baichuan/', 'moonshot': 'moonshot/',
  'kimi': 'moonshot/', 'openchat': 'openchat/', 'neural': 'nousresearch/',
  'athene': 'nousresearch/', 'dolphin': 'cognitivecomputations/', 'falcon': 'tii/',
  'codegemma': 'google/', 'codestral': 'mistralai/', 'wizard': 'microsoft/',
  'snowflake': 'snowflake/', 'amazon': 'amazon/',
};

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tier1Match(queryNorm, models) {
  for (const m of models) {
    const idParts = (m.id || '').split('/');
    const idName = idParts.length > 1 ? idParts.slice(1).join('/') : m.id;
    if (normalize(idName) === queryNorm) return { model: m, confidence: 1.0 };
    if (normalize(m.name).includes(queryNorm) && queryNorm.length >= 3) return { model: m, confidence: 0.9 };
  }
  return null;
}

function tier2Match(query, models) {
  const queryLower = query.toLowerCase();
  for (const [alias, provider] of Object.entries(PROVIDER_ALIASES)) {
    if (queryLower.startsWith(alias) || queryLower.includes(alias)) {
      const providerModels = models.filter(m => (m.id || '').startsWith(provider));
      if (providerModels.length > 0) {
        const remainder = query.replace(new RegExp('^' + alias, 'i'), '').trim();
        if (remainder) {
          const result = tier1Match(normalize(remainder), providerModels);
          if (result) return { model: result.model, confidence: Math.min(result.confidence, 0.85) };
        }
        if (providerModels.length === 1) return { model: providerModels[0], confidence: 0.7 };
      }
    }
  }
  return null;
}

function tier3Match(query, models) {
  const queryTokens = query.toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
  let best = null, bestScore = 0;
  for (const m of models) {
    const nameTokens = (m.name || '').toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
    const idTokens = (m.id || '').toLowerCase().split(/[\s\-_./]+/).filter(t => t.length > 0);
    const allTokens = new Set([...nameTokens, ...idTokens]);
    let matchCount = 0, numericBonus = 0;
    for (const qt of queryTokens) {
      for (const at of allTokens) {
        if (at === qt || at.includes(qt) || qt.includes(at)) {
          matchCount++;
          if (/\d/.test(qt) && qt === at) numericBonus += 0.1;
          break;
        }
      }
    }
    const score = (matchCount / queryTokens.length) * 0.8 + numericBonus;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best && bestScore >= 0.5) return { model: best, confidence: bestScore * 0.8 };
  return null;
}

function tier4Match(query, models) {
  const q = normalize(query);
  if (q.length < 3) return null;
  let best = null, bestScore = 0;
  for (const m of models) {
    const nameNorm = normalize(m.name);
    const idNorm = normalize(m.id);
    let score = 0;
    if (nameNorm.includes(q) || q.includes(nameNorm)) score = Math.min(q.length, nameNorm.length) / Math.max(q.length, nameNorm.length);
    else if (idNorm.includes(q) || q.includes(idNorm)) score = Math.min(q.length, idNorm.length) / Math.max(q.length, idNorm.length);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best && bestScore >= 0.4) return { model: best, confidence: bestScore * 0.6 };
  return null;
}

function matchModel(modelName, models) {
  const queryNorm = normalize(modelName);
  let r = tier1Match(queryNorm, models);
  if (r && r.confidence >= 0.9) return r;
  r = tier2Match(modelName, models);
  if (r && r.confidence >= 0.7) return r;
  r = tier3Match(modelName, models);
  if (r && r.confidence >= 0.5) return r;
  r = tier4Match(modelName, models);
  if (r) return r;
  const t1 = tier1Match(queryNorm, models);
  const t2 = tier2Match(modelName, models);
  const candidates = [t1, t2].filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  if (candidates.length > 0 && candidates[0].confidence >= 0.4) return candidates[0];
  return null;
}

// 只保留需要的字段，大幅减少存储体积
function slimModel(m) {
  return {
    id: m.id,
    name: m.name,
    description: m.description || '',
    context_length: m.context_length || 0,
    pricing: m.pricing || {},
    architecture: m.architecture || {},
    supported_parameters: m.supported_parameters || [],
    top_provider: m.top_provider || {},
    knowledge_cutoff: m.knowledge_cutoff || null,
    created: m.created || null,
    hugging_face_id: m.hugging_face_id || null,
    per_request_limits: m.per_request_limits || null
  };
}

Component({
  properties: {
    modelName: { type: String, value: '' },
    show: { type: Boolean, value: false }
  },

  data: {
    loading: false,
    matchFound: false,
    error: '',
    displayName: '',
    provider: '',
    description: '',
    inputPrice: '',
    outputPrice: '',
    contextLength: '',
    modality: '',
    tokenizer: '',
    instructType: '',
    knowledgeCutoff: '',
    maxTokens: '',
    createdDate: '',
    huggingFaceUrl: '',
    perRequestLimits: '',
    features: [],
    openRouterUrl: ''
  },

  observers: {
    'show, modelName': function (show, modelName) {
      if (show && modelName) {
        this.fetchModelDetail(modelName);
      } else if (!show) {
        this.setData({ matchFound: false, error: '', loading: false });
      }
    }
  },

  methods: {
    // 获取模型列表：优先本地缓存，其次直接请求 OpenRouter
    getModels: function () {
      return new Promise((resolve, reject) => {
        // 检查本地缓存
        try {
          const cached = wx.getStorageSync(CACHE_KEY);
          if (cached && cached.models && cached.lastFetched && (Date.now() - cached.lastFetched) < CACHE_TTL) {
            // 检查缓存是否包含新字段，不包含则刷新
            const sample = cached.models[0];
            if (sample && sample.created !== undefined) {
              resolve(cached.models);
              return;
            }
            console.log('缓存缺少新字段，重新获取');
          }
        } catch (e) {}

        // 直接请求 OpenRouter API
        wx.request({
          url: 'https://openrouter.ai/api/v1/models',
          method: 'GET',
          timeout: 20000,
          success: (res) => {
            if (res.statusCode === 200 && res.data && res.data.data) {
              const models = res.data.data.map(slimModel);
              // 写入本地缓存
              try {
                wx.setStorageSync(CACHE_KEY, { models, lastFetched: Date.now() });
              } catch (e) {}
              resolve(models);
            } else {
              reject(new Error('API 返回异常'));
            }
          },
          fail: (err) => {
            reject(err);
          }
        });
      });
    },

    fetchModelDetail: function (modelName) {
      this.setData({ loading: true, error: '', matchFound: false });

      this.getModels().then(models => {
        const result = matchModel(modelName, models);
        if (!result) {
          this.setData({ loading: false, matchFound: false });
          return;
        }
        const d = result.model;
        console.log('模型详情原始数据:', JSON.stringify(d).substring(0, 500));
        this.setData({
          loading: false,
          matchFound: true,
          displayName: d.name || modelName,
          provider: (d.id || '').split('/')[0] || '',
          description: d.description || '暂无描述',
          inputPrice: this.formatPrice(d.pricing?.prompt),
          outputPrice: this.formatPrice(d.pricing?.completion),
          contextLength: this.formatContextLength(d.context_length),
          modality: d.architecture?.modality || '-',
          tokenizer: d.architecture?.tokenizer || '-',
          instructType: d.architecture?.instruct_type || '-',
          knowledgeCutoff: d.knowledge_cutoff || '-',
          maxTokens: d.top_provider?.max_completion_tokens ? this.formatContextLength(d.top_provider.max_completion_tokens) : '-',
          createdDate: d.created ? this.formatDate(d.created) : '-',
          huggingFaceUrl: d.hugging_face_id ? 'https://huggingface.co/' + d.hugging_face_id : '',
          perRequestLimits: this.formatLimits(d.per_request_limits),
          features: this.extractFeatures(d.supported_parameters, d.architecture),
          openRouterUrl: 'https://openrouter.ai/models/' + encodeURIComponent(d.id)
        });
      }).catch(err => {
        console.error('获取模型详情失败:', err);
        // 降级到云函数
        this.fetchViaCloud(modelName);
      });
    },

    // 云函数降级
    fetchViaCloud: function (modelName) {
      wx.cloud.callFunction({
        name: 'getModelDetail',
        data: { modelName },
        success: (res) => {
          if (res.result && res.result.success && res.result.matchFound && res.result.data) {
            const d = res.result.data;
            this.setData({
              loading: false,
              matchFound: true,
              displayName: d.name || modelName,
              provider: (d.id || '').split('/')[0] || '',
              description: d.description || '暂无描述',
              inputPrice: this.formatPrice(d.pricing?.prompt),
              outputPrice: this.formatPrice(d.pricing?.completion),
              contextLength: this.formatContextLength(d.context_length),
              modality: d.architecture?.modality || '-',
              tokenizer: d.architecture?.tokenizer || '-',
              instructType: d.architecture?.instruct_type || '-',
              knowledgeCutoff: d.knowledge_cutoff || '-',
              maxTokens: d.top_provider?.max_completion_tokens ? this.formatContextLength(d.top_provider.max_completion_tokens) : '-',
              createdDate: d.created ? this.formatDate(d.created) : '-',
              huggingFaceUrl: d.hugging_face_id ? 'https://huggingface.co/' + d.hugging_face_id : '',
              perRequestLimits: this.formatLimits(d.per_request_limits),
              features: this.extractFeatures(d.supported_parameters, d.architecture),
              openRouterUrl: 'https://openrouter.ai/models/' + encodeURIComponent(d.id)
            });
          } else {
            this.setData({ loading: false, matchFound: false });
          }
        },
        fail: () => {
          this.setData({ loading: false, error: '网络请求失败，请稍后重试' });
        }
      });
    },

    formatPrice: function (pricePerToken) {
      if (!pricePerToken || pricePerToken === '0') return '免费';
      const num = parseFloat(pricePerToken);
      if (isNaN(num)) return '-';
      const perMillion = num * 1000000;
      if (perMillion < 0.01) return '< $0.01/M';
      return '$' + perMillion.toFixed(2) + '/M';
    },

    formatContextLength: function (tokens) {
      if (!tokens) return '-';
      const num = parseInt(tokens);
      if (isNaN(num)) return '-';
      if (num >= 1000000) return (num / 1000000) + 'M';
      if (num >= 1000) return (num / 1000) + 'K';
      return String(num);
    },

    formatDate: function (timestamp) {
      if (!timestamp) return '-';
      let d;
      // 兼容秒级时间戳、毫秒级时间戳、日期字符串
      if (typeof timestamp === 'number') {
        d = timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
      } else {
        d = new Date(timestamp);
      }
      if (isNaN(d.getTime())) return '-';
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    formatLimits: function (limits) {
      if (!limits) return '-';
      const parts = [];
      if (limits.max_request_length) parts.push('请求: ' + this.formatContextLength(limits.max_request_length));
      if (limits.max_prompt_tokens) parts.push('输入: ' + this.formatContextLength(limits.max_prompt_tokens));
      if (limits.max_completion_tokens) parts.push('输出: ' + this.formatContextLength(limits.max_completion_tokens));
      return parts.length > 0 ? parts.join(', ') : '-';
    },

    extractFeatures: function (params, arch) {
      const features = [];
      if (!params) return features;
      if (params.includes('tools')) features.push('Tools');
      if (params.includes('vision') || (arch?.input_modalities || []).includes('image')) features.push('Vision');
      if (params.includes('temperature')) features.push('Temperature');
      if (params.includes('reasoning') || params.includes('include_reasoning')) features.push('Reasoning');
      if (params.includes('web_search_options')) features.push('Web Search');
      if (params.includes('structured_outputs')) features.push('Structured Output');
      if (params.includes('response_format')) features.push('JSON Mode');
      return features;
    },

    onClose: function () { this.triggerEvent('close'); },
    onMaskTap: function () { this.onClose(); },
    onContentTap: function () {},

    onOpenRouter: function () {
      if (this.data.openRouterUrl) {
        wx.setClipboardData({
          data: this.data.openRouterUrl,
          success: () => { wx.showToast({ title: '链接已复制', icon: 'success' }); }
        });
      }
    },

    onHuggingFace: function () {
      if (this.data.huggingFaceUrl) {
        wx.setClipboardData({
          data: this.data.huggingFaceUrl,
          success: () => { wx.showToast({ title: '链接已复制', icon: 'success' }); }
        });
      }
    }
  }
});
