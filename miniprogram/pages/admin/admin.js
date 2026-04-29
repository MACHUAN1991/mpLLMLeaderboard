// pages/admin/admin.js
Page({
  data: {
    imagePath: '',
    analyzing: false,
    result: null,
    error: null,
    analyzingStep: '',
    source: 'artificial-analysis',
    records: [],
    loadingRecords: false
  },

  onLoad: function () {
    // 导航到管理页前已在首页验证密码，此处直接加载记录
    this.loadRecords();
  },

  onUnload: function () {
    // 离开管理页时清除管理员状态，避免删除按钮一直显示
    wx.removeStorageSync('adminAuthorized');
  },

  // 显示登录对话框
  showLoginDialog: function () {
    wx.showModal({
      title: '管理权限验证',
      placeholderText: '请输入密码',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          if (res.content === 'admin123') {  // 密码：admin123
            wx.setStorageSync('adminAuthorized', true);
            wx.showToast({ title: '验证成功', icon: 'success' });
            this.loadRecords();
          } else {
            wx.showToast({ title: '密码错误', icon: 'none' });
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          }
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  // 加载记录列表
  loadRecords: function () {
    this.setData({ loadingRecords: true });
    wx.cloud.callFunction({
      name: 'getHistory',
      data: { page: 1, pageSize: 50 },
      success: (res) => {
        if (res.result.success) {
          this.setData({
            records: res.result.data || [],
            loadingRecords: false
          });
        } else {
          this.setData({ loadingRecords: false });
        }
      },
      fail: () => {
        this.setData({ loadingRecords: false });
      }
    });
  },

  // 删除记录
  deleteRecord: function (e) {
    const { recordid, date } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${date || '这条记录'} 吗？`,
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
                this.loadRecords();
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 选择排名来源
  selectSource: function (e) {
    const source = e.currentTarget.dataset.source;
    this.setData({ source });
  },

  // 选择图片
  chooseImage: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({ imagePath: tempFilePath, error: null, result: null });
      },
      fail: (err) => {
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    });
  },

  // 获取文件大小
  getFileSize: function (filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().getFileInfo({
        filePath: filePath,
        success: (res) => resolve(res.size),
        fail: (err) => reject(err)
      });
    });
  },

  // 上传并分析
  uploadAndAnalyze: async function () {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    this.setData({ analyzing: true, error: null, analyzingStep: '' });

    let fileID = null;

    try {
      let filePath = this.data.imagePath;

      // 1. 压缩图片
      try {
        const fileSize = await this.getFileSize(this.data.imagePath);
        console.log('原图大小:', fileSize);
        if (fileSize > 100 * 1024) {
          this.setData({ analyzingStep: '压缩图片...' });
          const compressResult = await wx.compressImage({
            src: this.data.imagePath,
            quality: 50
          });
          if (compressResult.tempFilePath) {
            filePath = compressResult.tempFilePath;
            const newSize = await this.getFileSize(filePath);
            console.log('压缩后大小:', newSize);
          }
        }
      } catch (e) {
        console.warn('压缩失败:', e);
      }

      // 2. 上传图片
      this.setData({ analyzingStep: '上传中...' });
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `arena/${Date.now()}.jpg`,
        filePath: filePath
      });
      fileID = uploadResult.fileID;
      wx.hideLoading();

      // 3. 调用云函数分析（显示进度）
      this.setData({ analyzingStep: '解析中...' });

      const analyzeResult = await wx.cloud.callFunction({
        name: 'analyzeImage',
        data: { fileID, source: this.data.source },
        timeout: 120000  // 120秒超时，云函数内部限制
      });

      wx.hideLoading();

      // 删除云端图片（无论成功失败都删除）
      if (fileID) {
        wx.cloud.deleteFile({
          fileList: [fileID]
        }).catch(err => {
          console.warn('删除图片失败:', err);
        });
      }

      if (analyzeResult.result.success) {
        const resultData = analyzeResult.result.data;

        // 4. 保存到数据库（等待完成）
        await this.saveToHistory(resultData, fileID);

        // 5. 跳转到 index 页面显示列表
        wx.reLaunch({
          url: '/pages/index/index'
        });

        this.setData({
          analyzing: false,
          analyzingStep: '完成',
          result: resultData
        });

      } else {
        this.setData({
          analyzing: false,
          error: analyzeResult.result.error || '解析失败'
        });
        wx.showToast({ title: '解析失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();

      // 删除云端图片（如果上传了的话）
      if (fileID) {
        wx.cloud.deleteFile({
          fileList: [fileID]
        }).catch(e => {
          console.warn('删除图片失败:', e);
        });
      }

      const errorMsg = err.message || err.errMsg || '分析失败';
      this.setData({
        analyzing: false,
        error: errorMsg
      });
      wx.showToast({ title: errorMsg, icon: 'none' });
      console.error(err);
    }
  },

  // 清除结果
  clearResult: function () {
    this.setData({
      imagePath: '',
      result: null,
      error: null,
      analyzingStep: ''
    });
  },

  // 保存到历史记录
  saveToHistory: function (data, fileID) {
    // analyzeImage 返回的格式是 { Ranking: [...], Date: ... } 或 { rankings: [...], date: ... }
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

    console.log('saveToHistory rankings 数量:', rankings.length);

    const now = new Date();
    const defaultDate = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

    return wx.cloud.callFunction({
      name: 'saveRecord',
      data: {
        date: data.Date || data.date || defaultDate,
        rankings: rankings,
        imageFileId: fileID || '',
        source: this.data.source
      }
    });
  }
});
