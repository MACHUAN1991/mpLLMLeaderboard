// pages/result/result.js
Page({
  data: {
    date: '',
    rankings: [],
    rawData: ''
  },

  onLoad: function (options) {
    if (options.data) {
      try {
        const data = JSON.parse(decodeURIComponent(options.data));
        console.log('解析到的数据:', data);

        // 兼容两种格式：大写 Ranking / 小写 rankings
        let rankings = [];
        if (Array.isArray(data.Ranking)) {
          rankings = data.Ranking;
        } else if (Array.isArray(data.rankings)) {
          rankings = data.rankings;
        } else if (Array.isArray(data)) {
          rankings = data;
        }

        // 兼容字段名：大写或小写下划线
        const normalizedRankings = rankings.map(item => ({
          rank: item.Rank || item.rank || 0,
          modelName: item['Model Name'] || item.model_name || '',
          organization: item.Organization || item.organization || '',
          score: item.Score || item.score || 0
        }));

        this.setData({
          date: data.Date || data.date || '',
          rankings: normalizedRankings,
          rawData: JSON.stringify(data, null, 2)
        });
      } catch (err) {
        console.error('解析数据失败:', err);
        this.setData({ rawData: options.data });
      }
    }
  },

  // 复制到剪贴板
  copyData: function () {
    wx.setClipboardData({
      data: this.data.rawData,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 返回首页
  goBack: function () {
    wx.navigateBack();
  }
});
