// pages/index/index.js
Page({
  data: {
    records: [],
    loading: true,
    empty: true,
    currentSource: 'artificial-analysis',
    filteredCount: 0,
    displayRecords: [],
    adminTapCount: 0
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
  },

  // 根据来源筛选记录
  applyFilter: function () {
    const { records, currentSource } = this.data;
    let filtered = records;
    if (currentSource !== 'all') {
      filtered = records.filter(item => item.source === currentSource);
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
    wx.navigateTo({
      url: `/pages/trend/trend?source=${source}`
    });
  }
});
