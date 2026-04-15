// pages/index/index.js
Page({
  data: {
    records: [],
    loading: true,
    empty: true
  },

  onLoad: function () {
    this.loadHistory();
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

  // 跳转到管理页
  goToAdmin: function () {
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },

  // 删除记录
  deleteRecord: function (e) {
    const { recordid } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deleteRecord',
            data: { recordId: recordid },
            success: (res) => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({ title: '删除成功', icon: 'success' });
                this.loadHistory();
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
              console.error(err);
            }
          });
        }
      }
    });
  },

  formatDate: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
});
