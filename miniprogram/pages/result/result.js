// pages/result/result.js
Page({
  data: {
    date: '',
    source: 'arena',  // 来源：arena / huggingface
    subCategory: '',
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
    },
    exportImagePath: ''
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

  onShareAppMessage: function () {
    if (this.data.exportImagePath) {
      return {
        title: '全球AI大模型排名 - ' + this.data.date,
        path: '/pages/result/result?recordId=' + (this.options.recordId || '') + '&date=' + encodeURIComponent(this.options.date || ''),
        imageUrl: this.data.exportImagePath
      };
    }
    return {
      title: '全球AI大模型排名',
      path: '/pages/index/index'
    };
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
          const subCategory = res.result.data.subCategory || '';
          this.processRankings(res.result.data, decodeURIComponent(date || ''), source, subCategory);
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

  processRankings: function (data, date, source, subCategory) {
    console.log('processRankings 收到的数据:', data);

    // 兼容多种格式：Ranking / rankings / Rankings / Models
    let rankings = [];
    if (Array.isArray(data.Ranking)) {
      rankings = data.Ranking;
    } else if (Array.isArray(data.rankings)) {
      rankings = data.rankings;
    } else if (Array.isArray(data.Rankings)) {
      rankings = data.Rankings;
    } else if (Array.isArray(data.Models)) {
      rankings = data.Models;
    } else if (Array.isArray(data)) {
      rankings = data;
    }

    console.log('提取到的 rankings 数量:', rankings.length);

    // 兼容字段名：大写或小写下划线或小写
    const normalizedRankings = rankings.map(item => ({
      rank: item.Rank || item.rank || 0,
      modelName: item['Model Name'] || item.model_name || item.modelName || '',
      organization: item.Organization || item.organization || '',
      score: item.Score || item.score || 0,
      price: item.Price || item.price || null,
      speed: item.Speed || item.speed || null,
      contextLength: item['Context Window / Context Length'] || item['Context Window'] || item['Context Length'] || item.contextLength || null
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
      subCategory: subCategory || '',
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

  // 导出图片
  exportImage: function () {
    if (!this.data.filteredRankings.length) {
      wx.showToast({ title: '没有可导出的数据', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成图片中...' });
    this.drawExportCanvas().then((tempFilePath) => {
      wx.hideLoading();
      this.setData({ exportImagePath: tempFilePath });
      wx.showActionSheet({
        itemList: ['保存到相册', '分享给朋友'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.saveImageToAlbum(tempFilePath);
          } else if (res.tapIndex === 1) {
            // 分享通过 onShareAppMessage 触发
            wx.showToast({ title: '请点击右上角分享', icon: 'none' });
          }
        }
      });
    }).catch((err) => {
      wx.hideLoading();
      console.error('导出图片失败:', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    });
  },

  // Canvas 绘制排行榜图片
  drawExportCanvas: function () {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#exportCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            reject(new Error('Canvas 节点未找到'));
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getWindowInfo().pixelRatio;
          const width = 750;

          const rankings = this.data.filteredRankings.slice(0, 50);
          const isAA = this.data.source === 'artificial-analysis';
          const rowHeight = isAA ? 56 : 40;
          const headerHeight = 120;
          const footerHeight = 60;
          const tableHeaderHeight = 40;
          const height = headerHeight + tableHeaderHeight + rankings.length * rowHeight + footerHeight;

          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          // 背景
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, width, height);

          // 标题区
          ctx.fillStyle = '#16213e';
          ctx.fillRect(0, 0, width, headerHeight);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('全球AI大模型排名', 30, 45);

          // 来源标签
          const sourceLabels = { arena: 'Arena', 'huggingface': 'HuggingFace', 'artificial-analysis': 'AA' };
          const sourceColors = { arena: '#c9a96e', 'huggingface': '#7fb3d3', 'artificial-analysis': '#9575cd' };
          const label = sourceLabels[this.data.source] || 'Arena';
          const displayLabel = this.data.source === 'arena' && this.data.subCategory ? label + ' - ' + this.data.subCategory : label;
          const color = sourceColors[this.data.source] || '#c9a96e';

          ctx.font = 'bold 16px sans-serif';
          const labelWidth = ctx.measureText(displayLabel).width + 20;
          ctx.fillStyle = color + '33';
          this.roundRect(ctx, 30, 58, labelWidth, 26, 6);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.fillText(displayLabel, 40, 76);

          // 日期
          ctx.fillStyle = '#64ffda';
          ctx.font = '16px sans-serif';
          ctx.fillText(this.data.date, 30 + labelWidth + 15, 76);

          // 数量统计
          ctx.fillStyle = '#8892b0';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('共 ' + this.data.stats.total + ' 个模型', width - 30, 76);
          ctx.textAlign = 'left';

          // 分割线
          ctx.strokeStyle = 'rgba(100, 255, 218, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(30, headerHeight - 10);
          ctx.lineTo(width - 30, headerHeight - 10);
          ctx.stroke();

          // 表头
          const tableTop = headerHeight;
          ctx.fillStyle = 'rgba(100, 255, 218, 0.1)';
          ctx.fillRect(20, tableTop, width - 40, tableHeaderHeight);

          ctx.fillStyle = '#64ffda';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('排名', 55, tableTop + 27);
          ctx.textAlign = 'left';
          ctx.fillText(isAA ? '模型（价格/速度/上下文）' : '模型', 90, tableTop + 27);
          ctx.textAlign = 'center';
          ctx.fillText('厂商', 530, tableTop + 27);
          ctx.textAlign = 'right';
          ctx.fillText(isAA ? '智力' : '分数', width - 40, tableTop + 27);

          // 数据行
          rankings.forEach((item, index) => {
            const y = tableTop + tableHeaderHeight + index * rowHeight;

            // 斑马纹
            if (index % 2 === 0) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
              ctx.fillRect(20, y, width - 40, rowHeight);
            }

            // Top 3 高亮
            if (item.rank === 1) {
              ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
              ctx.fillRect(20, y, width - 40, rowHeight);
              ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
              ctx.lineWidth = 1;
              ctx.strokeRect(20, y, width - 40, rowHeight);
            } else if (item.rank === 2) {
              ctx.fillStyle = 'rgba(192, 192, 192, 0.1)';
              ctx.fillRect(20, y, width - 40, rowHeight);
              ctx.strokeStyle = 'rgba(192, 192, 192, 0.25)';
              ctx.lineWidth = 1;
              ctx.strokeRect(20, y, width - 40, rowHeight);
            } else if (item.rank === 3) {
              ctx.fillStyle = 'rgba(205, 127, 50, 0.1)';
              ctx.fillRect(20, y, width - 40, rowHeight);
              ctx.strokeStyle = 'rgba(205, 127, 50, 0.25)';
              ctx.lineWidth = 1;
              ctx.strokeRect(20, y, width - 40, rowHeight);
            }

            // 排名
            if (item.rank <= 3) {
              const badgeColors = { 1: '#ffd700', 2: '#c0c0c0', 3: '#cd7f32' };
              ctx.fillStyle = badgeColors[item.rank];
              ctx.font = 'bold 16px sans-serif';
            } else {
              ctx.fillStyle = '#8892b0';
              ctx.font = '15px sans-serif';
            }
            ctx.textAlign = 'center';
            ctx.fillText('#' + item.rank, 55, y + (isAA ? 24 : 27));

            // 模型名
            ctx.fillStyle = item.rank <= 3 ? '#ffffff' : '#e0e0e0';
            ctx.font = item.rank <= 3 ? 'bold 15px sans-serif' : '14px sans-serif';
            ctx.textAlign = 'left';
            const maxModelWidth = isAA ? 420 : 400;
            let modelName = item.modelName || '';
            if (ctx.measureText(modelName).width > maxModelWidth) {
              while (ctx.measureText(modelName + '...').width > maxModelWidth && modelName.length > 0) {
                modelName = modelName.slice(0, -1);
              }
              modelName += '...';
            }
            ctx.fillText(modelName, 90, y + (isAA ? 20 : 27));

            // AA 额外信息
            if (isAA) {
              ctx.fillStyle = '#a8b2d1';
              ctx.font = '12px sans-serif';
              const extraY = y + 40;
              ctx.fillText('💰 ' + (item.price || '-') + '  ⚡ ' + (item.speed || '-') + '  📐 ' + (item.contextLength || '-'), 90, extraY);
            }

            // 厂商
            ctx.fillStyle = '#a8b2d1';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.organization || '', 530, y + (isAA ? 24 : 27));

            // 分数
            ctx.fillStyle = item.rank <= 3 ? '#ffd700' : '#8892b0';
            ctx.font = item.rank <= 3 ? 'bold 15px sans-serif' : '14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(String(item.score || ''), width - 40, y + (isAA ? 24 : 27));
          });

          // 底部水印
          const footerY = tableTop + tableHeaderHeight + rankings.length * rowHeight + 20;
          ctx.fillStyle = '#8892b0';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('AI大模型排行榜 · 来源：' + displayLabel, width / 2, footerY + 20);

          // 导出为临时文件
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvas: canvas,
              width: width * dpr,
              height: height * dpr,
              destWidth: width * 2,
              destHeight: height * 2,
              success: (res) => {
                resolve(res.tempFilePath);
              },
              fail: (err) => {
                reject(err);
              }
            });
          }, 200);
        });
    });
  },

  // 圆角矩形辅助方法
  roundRect: function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // 保存图片到相册
  saveImageToAlbum: function (filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示',
            content: '需要您授权保存图片到相册',
            confirmText: '去授权',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
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
