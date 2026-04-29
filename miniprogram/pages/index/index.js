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
    this.loadHistory();
  },

  // 分享给朋友
  onShareAppMessage: function () {
    return {
      title: '全球AI大模型排名',
      path: '/pages/index/index'
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
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'getHistory',
      data: { page: 1, pageSize: 50 },
      success: (res) => {
        console.log('历史记录:', res.result);
        if (res.result.success) {
          this.setData({
            records: res.result.data || [],
            empty: !res.result.data || res.result.data.length === 0,
            loading: false
          });
          this.applyFilter();  // 初始化筛选
        } else {
          console.error('获取失败:', res.result.error);
          this.setData({ empty: true, loading: false });
        }
      },
      fail: (err) => {
        console.error('调用失败:', err);
        this.setData({ empty: true, loading: false });
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

  goTrend: function () {
    wx.navigateTo({
      url: '/pages/trend/trend'
    });
  }
});
