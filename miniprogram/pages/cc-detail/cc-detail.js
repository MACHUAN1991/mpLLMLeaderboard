const { formatPrice, formatSpeed, formatContextLength } = require('../../utils/formatters');

Page({
  data: {
    model: '',
    modelData: null,
    openRouterInfo: null,
    loading: true,
    error: ''
  },

  onLoad: function (options) {
    const { model, agentType } = options;
    if (!model) {
      this.setData({ loading: false, error: '缺少模型参数' });
      return;
    }

    this.setData({ model: decodeURIComponent(model), agentType: agentType || 'claude-code' });
    this.loadModelData();
    this.loadOpenRouterInfo();
  },

  // 加载模型数据
  loadModelData: function () {
    const { model, agentType } = this.data;

    wx.cloud.callFunction({
      name: 'getAgentRankings',
      data: { agentType: agentType || 'claude-code' },
      success: (res) => {
        if (res.result.success && res.result.data.length > 0) {
          const latest = res.result.data[0];
          const modelItem = latest.rankings.find(item => item.model === model);

          if (modelItem) {
            this.setData({
              modelData: modelItem,
              loading: false
            });
            wx.setNavigationBarTitle({ title: modelItem.modelName });
          } else {
            this.setData({ loading: false, error: '未找到模型数据' });
          }
        } else {
          this.setData({ loading: false, error: '暂无数据' });
        }
      },
      fail: (err) => {
        console.error('获取数据失败:', err);
        this.setData({ loading: false, error: '获取数据失败' });
      }
    });
  },

  // 加载OpenRouter信息
  loadOpenRouterInfo: function () {
    const { model } = this.data;
    const parts = model.split('/');
    const modelName = parts.slice(1).join('/');

    wx.cloud.callFunction({
      name: 'getModelDetail',
      data: { modelName },
      success: (res) => {
        if (res.result.success && res.result.matchFound) {
          const data = res.result.data;
          this.setData({
            openRouterInfo: {
              contextLength: formatContextLength(data.context_length),
              inputPrice: formatPrice(data.pricing?.prompt ? (parseFloat(data.pricing.prompt) * 1000000).toString() : '0'),
              outputPrice: formatPrice(data.pricing?.completion ? (parseFloat(data.pricing.completion) * 1000000).toString() : '0'),
              maxTokens: data.top_provider?.max_completion_tokens,
              modality: data.architecture?.modality,
              features: this.extractFeatures(data.supported_parameters)
            }
          });
        }
      },
      fail: (err) => {
        console.error('获取OpenRouter信息失败:', err);
      }
    });
  },

  // 提取功能特性
  extractFeatures: function (params) {
    if (!params || !Array.isArray(params)) return [];

    const featureMap = {
      'tools': 'Tools',
      'vision': 'Vision',
      'temperature': 'Temperature',
      'reasoning': 'Reasoning',
      'web_search': 'Web Search',
      'structured_outputs': 'Structured Output',
      'json_mode': 'JSON Mode'
    };

    return params
      .map(p => featureMap[p.toLowerCase()])
      .filter(Boolean);
  },

  // 复制模型ID
  copyModelId: function () {
    const { model } = this.data;
    wx.setClipboardData({
      data: model,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 返回
  goBack: function () {
    wx.navigateBack();
  },

  // 分享
  onShareAppMessage: function () {
    const { modelData, agentType } = this.data;
    return {
      title: `Agent使用排名 - ${modelData?.modelName || ''}`,
      path: `/pages/cc-detail/cc-detail?model=${encodeURIComponent(this.data.model)}&agentType=${agentType}`
    };
  }
});
