// pages/history/history.js
Page({
  data: {
    records: [],
    loading: true,
    empty: false
  },

  onLoad: function () {
    this.loadHistory();
  },

  onShow: function () {
    // 每次显示页面时刷新
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
            empty: !res.result.data || res.result.data.length === 0
          });
        } else {
          console.error('获取失败:', res.result.error);
          this.setData({ empty: true });
        }
      },
      fail: (err) => {
        console.error('调用失败:', err);
        this.setData({ empty: true });
      },
      complete: () => {
        this.setData({ loading: false });
        callback && callback();
      }
    });
  },

  viewDetail: function (e) {
    const { recordid, date } = e.currentTarget.dataset;
    const record = this.data.records.find(r => r.recordId === recordid);
    if (record && record.rankings) {
      const data = {
        date: date,
        rankings: record.rankings
      };
      wx.navigateTo({
        url: `/pages/result/result?data=${encodeURIComponent(JSON.stringify(data))}&from=history&recordId=${recordid}`
      });
    }
  },

  deleteRecord: function (e) {
    const { recordid, imagefileid } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.doDelete(recordid, imagefileid);
        }
      }
    });
  },

  doDelete: function (recordId, imageFileId) {
    wx.showLoading({ title: '删除中...' });

    wx.cloud.callFunction({
      name: 'deleteRecord',
      data: { recordId, imageFileId },
      success: (res) => {
        if (res.result.success) {
          wx.showToast({ title: '已删除', icon: 'success' });
          // 从列表中移除
          const records = this.data.records.filter(r => r.recordId !== recordId);
          this.setData({
            records,
            empty: records.length === 0
          });
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.showToast({ title: '删除失败', icon: 'none' });
        console.error(err);
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  formatDate: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
});
