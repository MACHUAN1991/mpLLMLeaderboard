Component({
  properties: {
    modelName: { type: String, value: '' },
    show: { type: Boolean, value: false }
  },

  data: {
    loading: false,
    modelData: null,
    matchFound: false,
    error: '',
    // 格式化后的展示数据
    displayName: '',
    provider: '',
    description: '',
    inputPrice: '',
    outputPrice: '',
    contextLength: '',
    modality: '',
    knowledgeCutoff: '',
    maxTokens: '',
    features: [],
    openRouterUrl: ''
  },

  observers: {
    'show, modelName': function (show, modelName) {
      if (show && modelName) {
        this.fetchModelDetail(modelName);
      }
      if (!show) {
        // 关闭时重置状态
        this.setData({
          modelData: null,
          matchFound: false,
          error: '',
          loading: false
        });
      }
    }
  },

  methods: {
    fetchModelDetail: function (modelName) {
      this.setData({ loading: true, error: '', modelData: null, matchFound: false });

      wx.cloud.callFunction({
        name: 'getModelDetail',
        data: { modelName },
        success: (res) => {
          if (res.result.success && res.result.matchFound && res.result.data) {
            const d = res.result.data;
            this.setData({
              loading: false,
              matchFound: true,
              modelData: d,
              displayName: d.name || modelName,
              provider: this.extractProvider(d.id),
              description: d.description || '暂无描述',
              inputPrice: this.formatPrice(d.pricing?.prompt),
              outputPrice: this.formatPrice(d.pricing?.completion),
              contextLength: this.formatContextLength(d.context_length),
              modality: d.architecture?.modality || '-',
              knowledgeCutoff: d.knowledge_cutoff || '-',
              maxTokens: d.top_provider?.max_completion_tokens ? this.formatContextLength(d.top_provider.max_completion_tokens) : '-',
              features: this.extractFeatures(d.supported_parameters, d.architecture),
              openRouterUrl: 'https://openrouter.ai/models/' + encodeURIComponent(d.id)
            });
          } else {
            this.setData({
              loading: false,
              matchFound: false
            });
          }
        },
        fail: (err) => {
          console.error('获取模型详情失败:', err);
          this.setData({
            loading: false,
            error: '网络请求失败，请稍后重试'
          });
        }
      });
    },

    extractProvider: function (id) {
      if (!id) return '';
      const parts = id.split('/');
      return parts.length > 0 ? parts[0] : '';
    },

    formatPrice: function (pricePerToken) {
      if (!pricePerToken || pricePerToken === '0') return '免费';
      const num = parseFloat(pricePerToken);
      if (isNaN(num)) return '-';
      // 转换为 $/1M tokens
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

    onClose: function () {
      this.triggerEvent('close');
    },

    onMaskTap: function () {
      this.onClose();
    },

    onContentTap: function () {
      // 阻止冒泡，防止点击内容区关闭
    },

    onOpenRouter: function () {
      if (this.data.openRouterUrl) {
        wx.setClipboardData({
          data: this.data.openRouterUrl,
          success: () => {
            wx.showToast({ title: '链接已复制', icon: 'success' });
          }
        });
      }
    }
  }
});
