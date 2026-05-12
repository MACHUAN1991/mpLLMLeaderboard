// pages/admin/admin.js
Page({
  data: {
    imageList: [],
    analyzing: false,
    result: null,
    error: null,
    analyzingStep: '',
    batchProgress: { current: 0, total: 0 },
    batchResults: null,
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
    sources: [
      { key: 'arena', label: 'Arena' },
      { key: 'artificial-analysis', label: 'AA' },
      { key: 'huggingface', label: 'HF' }
    ],
    showPickerIndex: -1,
    deleteMode: false,
    selectedRecords: {},
    selectedCount: 0,
    records: [],
    loadingRecords: false,
    ccFetching: false,
    ccFetchResult: null
  },

  onLoad: function () {
    this.loadRecords();
  },

  onUnload: function () {
    wx.removeStorageSync('adminAuthorized');
  },

  showLoginDialog: function () {
    wx.showModal({
      title: '管理权限验证',
      placeholderText: '请输入密码',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          if (res.content === 'admin123') {
            wx.setStorageSync('adminAuthorized', true);
            wx.showToast({ title: '验证成功', icon: 'success' });
            this.loadRecords();
          } else {
            wx.showToast({ title: '密码错误', icon: 'none' });
            setTimeout(() => { wx.navigateBack(); }, 1500);
          }
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  loadRecords: function () {
    this.setData({ loadingRecords: true });
    wx.cloud.callFunction({
      name: 'getHistory',
      data: { page: 1, pageSize: 50 },
      success: (res) => {
        if (res.result.success) {
          this.setData({ records: res.result.data || [], loadingRecords: false });
        } else {
          this.setData({ loadingRecords: false });
        }
      },
      fail: () => { this.setData({ loadingRecords: false }); }
    });
  },

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

  // 切换删除模式
  toggleDeleteMode: function () {
    this.setData({
      deleteMode: !this.data.deleteMode,
      selectedRecords: {},
      selectedCount: 0
    });
  },

  // 选中/取消单条记录
  toggleSelectRecord: function (e) {
    const id = e.currentTarget.dataset.id;
    const selected = { ...this.data.selectedRecords };
    if (selected[id]) {
      delete selected[id];
    } else {
      selected[id] = true;
    }
    this.setData({
      selectedRecords: selected,
      selectedCount: Object.keys(selected).length
    });
  },

  // 全选/取消全选
  toggleSelectAll: function () {
    const { records, selectedRecords } = this.data;
    if (Object.keys(selectedRecords).length === records.length) {
      this.setData({ selectedRecords: {}, selectedCount: 0 });
    } else {
      const all = {};
      records.forEach(r => { all[r.recordId] = true; });
      this.setData({ selectedRecords: all, selectedCount: records.length });
    }
  },

  // 批量删除选中记录
  deleteSelected: function () {
    const { selectedRecords, selectedCount } = this.data;
    if (selectedCount === 0) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedCount} 条记录吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          const ids = Object.keys(selectedRecords);
          let done = 0;
          let failed = 0;
          ids.forEach(id => {
            wx.cloud.callFunction({
              name: 'deleteRecord',
              data: { recordId: id },
              success: () => {
                done++;
                if (done + failed === ids.length) {
                  wx.hideLoading();
                  wx.showToast({ title: `删除${failed > 0 ? `完成，${failed}条失败` : '成功'}`, icon: failed > 0 ? 'none' : 'success' });
                  this.setData({ deleteMode: false, selectedRecords: {}, selectedCount: 0 });
                  this.loadRecords();
                }
              },
              fail: () => {
                failed++;
                if (done + failed === ids.length) {
                  wx.hideLoading();
                  wx.showToast({ title: `删除完成，${failed}条失败`, icon: 'none' });
                  this.setData({ deleteMode: false, selectedRecords: {}, selectedCount: 0 });
                  this.loadRecords();
                }
              }
            });
          });
        }
      }
    });
  },

  MAX_IMAGES: 30,

  chooseImage: function () {
    const remaining = this.MAX_IMAGES - this.data.imageList.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择30张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: Math.min(remaining, 9),
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFilePaths.map(path => ({
          path,
          source: 'arena',
          subCategory: ''
        }));
        this.setData({
          imageList: this.data.imageList.concat(newImages),
          error: null,
          result: null,
          batchResults: null
        });
      },
      fail: () => {
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    });
  },

  removeImage: function (e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.imageList.slice();
    list.splice(idx, 1);
    this.setData({ imageList: list, showPickerIndex: -1 });
  },

  openPicker: function (e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ showPickerIndex: idx });
  },

  closePicker: function () {
    this.setData({ showPickerIndex: -1 });
  },

  // 选择来源
  pickSource: function (e) {
    const key = e.currentTarget.dataset.key;
    const idx = this.data.showPickerIndex;
    if (idx < 0) return;
    const list = this.data.imageList.slice();
    list[idx] = { ...list[idx], source: key, subCategory: '' };
    this.setData({ imageList: list });
  },

  // 选择子分类
  pickSubCategory: function (e) {
    const key = e.currentTarget.dataset.key;
    const idx = this.data.showPickerIndex;
    if (idx < 0) return;
    const list = this.data.imageList.slice();
    list[idx] = { ...list[idx], subCategory: key };
    this.setData({ imageList: list, showPickerIndex: -1 });
  },

  getSourceLabel: function (key) {
    const s = this.data.sources.find(s => s.key === key);
    return s ? s.label : key;
  },

  getSubCategoryLabel: function (key) {
    const cat = this.data.arenaSubCategories.find(c => c.key === key);
    return cat ? cat.label : key;
  },

  getFileSize: function (filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (res) => resolve(res.size),
        fail: (err) => reject(err)
      });
    });
  },

  uploadAndAnalyze: async function () {
    const { imageList } = this.data;
    if (imageList.length === 0) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }

    // 校验：Arena 来源必须选子分类
    for (let i = 0; i < imageList.length; i++) {
      const img = imageList[i];
      if (img.source === 'arena' && !img.subCategory) {
        wx.showToast({ title: `第${i + 1}张：Arena需选子分类`, icon: 'none' });
        return;
      }
    }

    const total = imageList.length;
    this.setData({
      analyzing: true,
      error: null,
      result: null,
      batchResults: null,
      batchProgress: { current: 0, total },
      showPickerIndex: -1
    });

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < total; i++) {
      const { path: filePath, source, subCategory } = imageList[i];
      let fileID = null;

      try {
        this.setData({
          batchProgress: { current: i + 1, total },
          analyzingStep: `压缩 ${i + 1}/${total}...`
        });

        let compressedPath = filePath;
        try {
          const fileSize = await this.getFileSize(filePath);
          if (fileSize > 100 * 1024) {
            const compressResult = await wx.compressImage({ src: filePath, quality: 50 });
            if (compressResult.tempFilePath) {
              compressedPath = compressResult.tempFilePath;
            }
          }
        } catch (e) {
          console.warn('压缩失败:', e);
        }

        this.setData({ analyzingStep: `上传 ${i + 1}/${total}...` });
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `arena/${Date.now()}_${i}.jpg`,
          filePath: compressedPath
        });
        fileID = uploadResult.fileID;

        this.setData({ analyzingStep: `解析 ${i + 1}/${total}...` });
        const analyzeResult = await wx.cloud.callFunction({
          name: 'analyzeImage',
          data: {
            fileID,
            source,
            subCategory: source === 'arena' ? subCategory : ''
          },
          timeout: 120000
        });

        if (fileID) {
          wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
        }

        if (analyzeResult.result.success) {
          await this.saveToHistory(analyzeResult.result.data, fileID, source, subCategory);
          successCount++;
        } else {
          failCount++;
          errors.push(`第${i + 1}张: ${analyzeResult.result.error || '解析失败'}`);
        }
      } catch (err) {
        if (fileID) {
          wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
        }
        failCount++;
        errors.push(`第${i + 1}张: ${err.message || '分析失败'}`);
        console.error(`第${i + 1}张处理失败:`, err);
      }
    }

    this.setData({
      analyzing: false,
      analyzingStep: '',
      batchResults: { success: successCount, fail: failCount, errors },
      batchProgress: { current: total, total }
    });

    this.loadRecords();

    if (failCount === 0) {
      wx.showToast({ title: `${successCount}张全部成功`, icon: 'success' });
    } else {
      wx.showToast({ title: `成功${successCount}张，失败${failCount}张`, icon: 'none' });
    }
  },

  clearResult: function () {
    this.setData({
      imageList: [],
      result: null,
      error: null,
      batchResults: null,
      batchProgress: { current: 0, total: 0 },
      analyzingStep: '',
      showPickerIndex: -1
    });
  },

  saveToHistory: function (data, fileID, source, subCategory) {
    let rankings = [];
    if (Array.isArray(data.Ranking)) rankings = data.Ranking;
    else if (Array.isArray(data.rankings)) rankings = data.rankings;
    else if (Array.isArray(data.Rankings)) rankings = data.Rankings;
    else if (Array.isArray(data.Leaderboard)) rankings = data.Leaderboard;
    else if (Array.isArray(data)) rankings = data;

    const now = new Date();
    const defaultDate = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

    return wx.cloud.callFunction({
      name: 'saveRecord',
      data: {
        date: data.Date || data.date || defaultDate,
        rankings,
        imageFileId: fileID || '',
        source,
        subCategory: source === 'arena' ? subCategory : ''
      }
    });
  },

  // 手动抓取Claude Code数据
  fetchClaudeCodeData: function () {
    this.setData({ ccFetching: true, ccFetchResult: null });

    wx.cloud.callFunction({
      name: 'fetchClaudeCodeRankings',
      timeout: 60000,
      success: (res) => {
        console.log('Claude Code抓取结果:', res);
        if (res.result.success) {
          this.setData({
            ccFetching: false,
            ccFetchResult: {
              success: true,
              totalModels: res.result.totalModels,
              date: res.result.date
            }
          });
          wx.showToast({ title: '抓取成功', icon: 'success' });
        } else {
          this.setData({
            ccFetching: false,
            ccFetchResult: {
              success: false,
              error: res.result.error
            }
          });
        }
      },
      fail: (err) => {
        console.error('Claude Code抓取失败:', err);
        this.setData({
          ccFetching: false,
          ccFetchResult: {
            success: false,
            error: err.message || '调用失败'
          }
        });
      }
    });
  }
});
