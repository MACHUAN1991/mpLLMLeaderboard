// pages/index/index.js
Page({
  data: {
    imagePath: '',
    analyzing: false,
    result: null,
    error: null
  },

  // 选择图片
  chooseImage: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({ imagePath: tempFilePath });
      },
      fail: (err) => {
        wx.showToast({ title: '选择图片失败', icon: 'none' });
        console.error(err);
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

    this.setData({ analyzing: true, error: null });

    try {
      let filePath = this.data.imagePath;

      // 1. 检查并压缩图片（如果原图大于 300KB）
      try {
        const fileSize = await this.getFileSize(this.data.imagePath);
        console.log('原图大小:', fileSize);
        if (fileSize > 300 * 1024) {
          wx.showLoading({ title: '压缩图片中...' });
          const compressResult = await wx.compressImage({
            src: this.data.imagePath,
            quality: 30  // 更激进压缩
          });
          wx.hideLoading();
          if (compressResult.tempFilePath) {
            filePath = compressResult.tempFilePath;
            console.log('压缩后路径:', filePath);
          }
        }
      } catch (e) {
        console.warn('压缩失败，使用原图:', e);
      }

      // 2. 上传图片到云存储
      wx.showLoading({ title: '上传图片中...' });
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `arena/${Date.now()}.jpg`,
        filePath: filePath
      });

      const fileID = uploadResult.fileID;
      wx.hideLoading();

      // 3. 调用云函数分析图片
      wx.showLoading({ title: 'AI 解析中...' });
      const analyzeResult = await wx.cloud.callFunction({
        name: 'analyzeImage',
        data: { fileID }
      });

      wx.hideLoading();

      if (analyzeResult.result.success) {
        wx.navigateTo({
          url: `/pages/result/result?data=${encodeURIComponent(JSON.stringify(analyzeResult.result.data))}`
        });
      } else {
        this.setData({ error: analyzeResult.result.error || '解析失败' });
        wx.showToast({ title: analyzeResult.result.error || '解析失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      const errorMsg = err.message || err.errMsg || '分析失败';
      this.setData({ error: errorMsg });
      wx.showToast({ title: errorMsg, icon: 'none' });
      console.error(err);
    } finally {
      this.setData({ analyzing: false });
    }
  }
});
