// pages/admin/admin.js
Page({
  data: {
    imagePath: '',
    analyzing: false,
    result: null,
    error: null,
    analyzingStep: ''
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
          wx.showLoading({ title: '压缩中...' });
          const compressResult = await wx.compressImage({
            src: this.data.imagePath,
            quality: 50
          });
          wx.hideLoading();
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
      this.setData({ analyzingStep: '上传图片...' });
      wx.showLoading({ title: '上传中...' });
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `arena/${Date.now()}.jpg`,
        filePath: filePath
      });
      fileID = uploadResult.fileID;
      wx.hideLoading();

      // 3. 调用云函数分析（显示进度）
      this.setData({ analyzingStep: 'AI 解析中（请等待）...' });
      wx.showLoading({ title: 'AI 解析中...' });

      const analyzeResult = await wx.cloud.callFunction({
        name: 'analyzeImage',
        data: { fileID },
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

    return wx.cloud.callFunction({
      name: 'saveRecord',
      data: {
        date: data.Date || data.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        rankings: rankings,
        imageFileId: fileID || ''
      }
    });
  }
});
