const { formatPrice, formatSpeed, formatContextLength } = require('../../utils/formatters');

// pages/index/index.js
Page({
  data: {
    records: [],
    loading: true,
    empty: true,
    currentSource: 'arena',
    arenaSubCategories: [
      { key: 'text', label: 'Text' },
      { key: 'search', label: 'Search' },
      { key: 'vision', label: 'Vision' },
      { key: 'document', label: 'Document' },
      { key: 'webdev', label: 'WebDev' },
      { key: 'text-to-image', label: 'Text-to-Image' },
      { key: 'image-edit', label: 'Image Edit' },
      { key: 'text-to-video', label: 'Text-to-Video' },
      { key: 'image-to-video', label: 'Image-to-Video' }
    ],
    currentSubCategory: 'text',
    filteredCount: 0,
    displayRecords: [],
    adminTapCount: 0,
    // 最新排名相关
    latestRecord: null,
    latestRankings: [],
    rankingsLoading: false
  },

  onLoad: function () {
    // 先读缓存快速展示，再后台刷新
    const cached = wx.getStorageSync('history_cache');
    if (cached && cached.data) {
      this.setData({
        records: cached.data,
        loading: false,
        empty: cached.data.length === 0
      });
      this.applyFilter();
      this.loadLatestRankings();
    }
    this.loadHistory();
  },

  // 分享给朋友
  onShareAppMessage: function () {
    return {
      title: '全球AI大模型排名',
      path: '/pages/index/index'
    };
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: '全球AI大模型排名',
      query: ''
    };
  },

  onShow: function () {
    this.loadHistory();
  },

  onPullDownRefresh: function () {
    this.loadHistory(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadHistory: function (callback) {
    // 有缓存时不显示 loading 动画，直接展示缓存数据
    const hasData = this.data.records.length > 0;
    if (!hasData) {
      this.setData({ loading: true });
    }

    wx.cloud.callFunction({
      name: 'getHistory',
      data: { page: 1, pageSize: 50 },
      success: (res) => {
        console.log('历史记录:', res.result);
        if (res.result.success) {
          const data = res.result.data || [];
          this.setData({
            records: data,
            empty: data.length === 0,
            loading: false
          });
          this.applyFilter();
          this.loadLatestRankings();
          // 写入缓存
          wx.setStorageSync('history_cache', { data, time: Date.now() });
        } else {
          console.error('获取失败:', res.result.error);
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error('调用失败:', err);
        this.setData({ loading: false });
      },
      complete: () => {
        if (callback) callback();
      }
    });
  },

  viewDetail: function (e) {
    const { recordid, date } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/result/result?recordId=${recordid}&date=${encodeURIComponent(date)}`
    });
  },

  // 加载最新排名数据
  loadLatestRankings: function () {
    const { records, currentSource, currentSubCategory } = this.data;
    // 获取当前来源的最新记录
    let filtered = records;
    if (currentSource !== 'all') {
      filtered = records.filter(item => item.source === currentSource);
      if (currentSource === 'arena') {
        filtered = filtered.filter(item => (item.subCategory || '') === currentSubCategory);
      }
    }
    const latestRecord = filtered[0]; // 已按时间倒序
    if (!latestRecord) {
      this.setData({ latestRecord: null, latestRankings: [] });
      return;
    }

    this.setData({ rankingsLoading: true });

    wx.cloud.callFunction({
      name: 'getRecordDetail',
      data: { recordId: latestRecord.recordId },
      success: (res) => {
        if (res.result.success) {
          const rankings = res.result.data.rankings || [];
          const processedRankings = this.processRankings(rankings);
          this.setData({
            latestRecord: latestRecord,
            latestRankings: processedRankings,
            rankingsLoading: false
          });
        } else {
          console.error('获取排名失败:', res.result.error);
          this.setData({ rankingsLoading: false });
        }
      },
      fail: (err) => {
        console.error('调用失败:', err);
        this.setData({ rankingsLoading: false });
      }
    });
  },

  // 处理排名数据（兼容多种字段命名格式）
  processRankings: function (rankings) {
    if (!rankings || !Array.isArray(rankings)) return [];
    const isAA = this.data.currentSource === 'artificial-analysis';

    return rankings.map(item => {
      // 处理字段名兼容性
      const rank = item.rank || item.Rank || item['排名'] || 0;
      const modelName = item.modelName || item.model_name || item.Model || item['模型'] || '';
      const organization = item.organization || item.Organization || item['厂商'] || '';
      const score = item.score || item.Score || item['分数'] || item.Elo || '';
      let price = item.price || item.Price || item['价格'] || '';
      let speed = item.speed || item.Speed || item['速度'] || '';
      let contextLength = item.contextLength || item.context_length || item['上下文长度'] || '';

      if (isAA) {
        price = formatPrice(price);
        speed = formatSpeed(speed);
        contextLength = formatContextLength(contextLength);
      }

      return {
        rank: parseInt(rank) || 0,
        modelName,
        organization,
        score,
        price,
        speed,
        contextLength
      };
    }).sort((a, b) => a.rank - b.rank);
  },

  // 连续点击触发管理入口
  onSecretTap: function () {
    let count = this.data.adminTapCount + 1;
    this.setData({ adminTapCount: count });

    // 连续点击5次弹出密码验证
    if (count >= 5) {
      this.setData({ adminTapCount: 0 });
      wx.showModal({
        title: '管理权限验证',
        placeholderText: '请输入密码',
        editable: true,
        success: (res) => {
          if (res.confirm && res.content) {
            if (res.content === 'admin123') {
              wx.navigateTo({
                url: '/pages/admin/admin'
              });
            } else {
              wx.showToast({ title: '密码错误', icon: 'none' });
            }
          }
        }
      });
    }
  },

  formatDate: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  },

  // 切换来源筛选
  switchSource: function (e) {
    const source = e.currentTarget.dataset.source;
    this.setData({ currentSource: source });
    this.applyFilter();
    this.loadLatestRankings();
  },

  // 切换Arena子分类
  switchSubCategory: function (e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentSubCategory: key });
    this.applyFilter();
    this.loadLatestRankings();
  },

  // 根据来源筛选记录
  applyFilter: function () {
    const { records, currentSource, currentSubCategory } = this.data;
    let filtered = records;
    if (currentSource !== 'all') {
      filtered = records.filter(item => item.source === currentSource);
      // Arena来源按子分类筛选
      if (currentSource === 'arena') {
        filtered = filtered.filter(item => (item.subCategory || '') === currentSubCategory);
      }
    }
    this.setData({
      filteredCount: filtered.length,
      displayRecords: filtered,
      empty: filtered.length === 0
    });
  },

  getFilteredRecords: function () {
    const { records, currentSource } = this.data;
    if (currentSource === 'all') return records;
    return records.filter(item => item.source === currentSource);
  },

  goTrend: function (e) {
    const source = e.currentTarget.dataset.source || 'artificial-analysis';
    const subCategory = source === 'arena' ? this.data.currentSubCategory : '';
    wx.navigateTo({
      url: `/pages/trend/trend?source=${source}&subCategory=${subCategory}`
    });
  }
});
