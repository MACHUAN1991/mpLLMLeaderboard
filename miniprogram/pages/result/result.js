// pages/result/result.js
Page({
  data: {
    date: '',
    source: 'arena',  // 来源：arena / huggingface
    rankings: [],
    filteredRankings: [],
    searchKey: '',
    filterOrg: '',
    rankRange: 'all',
    organizations: [],
    allOrganizations: [],
    rawData: '',
    showFilter: false,
    stats: {
      total: 0,
      showing: 0
    }
  },

  onLoad: function (options) {
    this.options = options;
    if (options.recordId) {
      // 从云数据库获取完整数据
      this.loadFromRecord(options.recordId, options.date);
    } else if (options.data) {
      // 兼容旧方式：直接从URL解析
      this.parseFromUrl(options);
    }
  },

  onPullDownRefresh: function () {
    if (this.options.recordId) {
      this.loadFromRecord(this.options.recordId, this.options.date);
    }
    wx.stopPullDownRefresh();
  },

  loadFromRecord: function (recordId, date) {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getRecordDetail',
      data: { recordId },
      success: (res) => {
        wx.hideLoading();
        wx.stopPullDownRefresh();
        console.log('getRecordDetail 返回:', res.result);
        if (res.result.success) {
          const source = res.result.data.source || 'arena';
          this.processRankings(res.result.data, decodeURIComponent(date || ''), source);
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.stopPullDownRefresh();
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.error(err);
      }
    });
  },

  parseFromUrl: function (options) {
    try {
      const data = JSON.parse(decodeURIComponent(options.data));
      console.log('解析到的数据:', data);
      this.processRankings(data, data.Date || data.date || '');
    } catch (err) {
      console.error('解析数据失败:', err);
    }
  },

  // 格式化日期：2026.4.16
  formatDate: function (dateStr) {
    if (!dateStr) return '';
    // 尝试解析日期字符串
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  },

  processRankings: function (data, date, source) {
    console.log('processRankings 收到的数据:', data);

    // 兼容两种格式：大写 Ranking / 小写 rankings / Rankings
    let rankings = [];
    if (Array.isArray(data.Ranking)) {
      rankings = data.Ranking;
    } else if (Array.isArray(data.rankings)) {
      rankings = data.rankings;
    } else if (Array.isArray(data.Rankings)) {
      rankings = data.Rankings;
    } else if (Array.isArray(data)) {
      rankings = data;
    }

    console.log('提取到的 rankings 数量:', rankings.length);

    // 兼容字段名：大写或小写下划线或小写
    const normalizedRankings = rankings.map(item => ({
      rank: item.Rank || item.rank || 0,
      modelName: item['Model Name'] || item.model_name || item.modelName || '',
      organization: item.Organization || item.organization || '',
      score: item.Score || item.score || 0
    }));

    console.log('normalizedRankings:', normalizedRankings);

    // 提取所有厂商
    const orgSet = new Set();
    normalizedRankings.forEach(item => {
      if (item.organization) orgSet.add(item.organization);
    });
    const allOrganizations = Array.from(orgSet).sort();
    const orgPickerRange = ['', ...allOrganizations];

    this.setData({
      date: this.formatDate(date),
      source: source || 'arena',
      rankings: normalizedRankings,
      filteredRankings: normalizedRankings,
      organizations: allOrganizations,
      allOrganizations: allOrganizations,
      orgPickerRange: orgPickerRange,
      rawData: JSON.stringify(data, null, 2),
      stats: {
        total: normalizedRankings.length,
        showing: normalizedRankings.length
      }
    });
  },

  // 保存到历史记录
  saveToHistory: function (date, rankings, fileID) {
    wx.cloud.callFunction({
      name: 'saveRecord',
      data: {
        date: date,
        rankings: rankings,
        imageFileId: fileID || ''
      },
      success: (res) => {
        console.log('保存成功:', res.result);
      },
      fail: (err) => {
        console.error('保存失败:', err);
      }
    });
  },

  // 搜索输入
  onSearch: function (e) {
    const value = e.detail.value || '';
    this.setData({ searchKey: value });
    this.applyFilters();
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({ searchKey: '' });
    this.applyFilters();
  },

  // 切换筛选面板
  toggleFilter: function () {
    this.setData({ showFilter: !this.showFilter });
  },

  // 厂商筛选
  onFilterOrg: function (e) {
    const index = parseInt(e.detail.value);
    const filterOrg = index === 0 ? '' : this.data.allOrganizations[index - 1];
    this.setData({ filterOrg });
    this.applyFilters();
  },

  // 排名范围筛选
  onFilterRank: function (e) {
    const ranges = ['all', '1-10', '11-50', '51-100', '100+'];
    const index = parseInt(e.detail.value);
    this.setData({ rankRange: ranges[index] });
    this.applyFilters();
  },

  // 重置筛选
  onResetFilter: function () {
    this.setData({
      searchKey: '',
      filterOrg: '',
      rankRange: 'all'
    });
    this.applyFilters();
  },

  // 应用筛选
  applyFilters: function () {
    let result = this.data.rankings;
    const { searchKey, filterOrg, rankRange } = this.data;

    // 搜索过滤（模型名）
    if (searchKey) {
      const key = searchKey.toLowerCase();
      result = result.filter(item =>
        item.modelName.toLowerCase().includes(key)
      );
    }

    // 厂商过滤
    if (filterOrg) {
      result = result.filter(item => item.organization === filterOrg);
    }

    // 排名范围过滤
    if (rankRange !== 'all') {
      const rangeMap = {
        '1-10': [1, 10],
        '11-50': [11, 50],
        '51-100': [51, 100],
        '100+': [101, 9999]
      };
      const [min, max] = rangeMap[rankRange] || [1, 9999];
      result = result.filter(item => item.rank >= min && item.rank <= max);
    }

    this.setData({
      filteredRankings: result,
      stats: {
        total: this.data.rankings.length,
        showing: result.length
      }
    });
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
  },

  // 返回首页
  goHome: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
