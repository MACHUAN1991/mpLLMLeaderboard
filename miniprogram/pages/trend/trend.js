Page({
  data: {
    loading: true,
    dates: [],
    models: {},
    modelNames: [],
    tableData: [],
    chartHeight: 500,
    scrollTop: 0
  },

  onLoad: function () {
    this.loadTrendData();
  },

  onPullDownRefresh: function () {
    this.loadTrendData(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadTrendData: function (callback) {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'getTrendData',
      data: { source: 'artificial-analysis' },
      success: (res) => {
        if (res.result.success) {
          const { dates, models } = res.result.data;
          this.processData(dates, models);
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('获取趋势数据失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
        if (callback) callback();
      }
    });
  },

  processData: function (dates, models) {
    const modelNames = Object.keys(models);

    // 生成表格数据
    const tableData = modelNames.map(name => {
      const entries = models[name] || [];
      const ranks = {};
      entries.forEach(e => {
        ranks[e.date] = e.rank;
      });

      // 生成时间线数据
      const timeline = entries.map(e => {
        const dateStr = e.date || '';
        // 简化日期显示：取最后两段如 "4.29"
        const parts = dateStr.split('.');
        const shortDate = parts.length >= 2 ? parts[parts.length - 2] + '.' + parts[parts.length - 1] : dateStr;
        return {
          date: e.date,
          rank: e.rank,
          score: e.score,
          shortDate
        };
      });

      // 当前排名（最新一期）
      const currentRank = entries.length > 0 ? entries[entries.length - 1].rank : 0;

      // 计算变化
      let change = '';
      let changeNum = 0;
      let changeClass = '';
      if (entries.length >= 2) {
        const first = entries[0].rank;
        const last = entries[entries.length - 1].rank;
        changeNum = Math.abs(first - last);
        if (last < first) {
          change = '↑' + changeNum;
          changeClass = 'rise';
        } else if (last > first) {
          change = '↓' + changeNum;
          changeClass = 'fall';
        } else {
          change = '→';
          changeClass = 'same';
        }
      }

      return {
        name,
        organization: entries[0]?.organization || '',
        ranks,
        timeline,
        change,
        changeNum,
        changeClass,
        currentRank,
        expanded: false
      };
    });

    this.setData({
      dates,
      models,
      modelNames,
      tableData
    });

    // 绘制图表
    setTimeout(() => {
      this.drawChart(dates, models, modelNames);
    }, 100);
  },

  drawChart: function (dates, models, modelNames) {
    const query = wx.createSelectorQuery();
    query.select('#trendCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.error('Canvas 节点未找到');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // 设置 Canvas 大小
        const dpr = wx.getWindowInfo().pixelRatio;
        const width = res[0].width;
        const height = this.data.chartHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        this.drawTrendChart(ctx, width, height, dates, models, modelNames);
      });
  },

  drawTrendChart: function (ctx, width, height, dates, models, modelNames) {
    // 清空画布
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 140, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 计算最大排名（用于 Y 轴）
    let maxRank = 10;
    modelNames.forEach(name => {
      const entries = models[name] || [];
      entries.forEach(e => {
        if (e.rank > maxRank) maxRank = e.rank;
      });
    });

    // 绘制背景网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // 水平网格线
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // 垂直网格线
    dates.forEach((date, idx) => {
      const x = padding.left + (chartWidth / (dates.length - 1 || 1)) * idx;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
    });

    // 绘制 X 轴标签（日期）
    ctx.fillStyle = '#8892b0';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    dates.forEach((date, idx) => {
      const x = padding.left + (chartWidth / (dates.length - 1 || 1)) * idx;
      const shortDate = date.substring(date.lastIndexOf('.') + 1) || date;
      ctx.fillText(shortDate, x, height - padding.bottom + 15);
    });

    // 绘制 Y 轴标签（排名）- #1 在最上面
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8892b0';
    ctx.font = '10px sans-serif';
    // 绘制排名 1, 3, 5, 7, 10 等关键刻度
    const rankTicks = [1, 3, 5, 7, 10].filter(r => r <= maxRank);
    rankTicks.forEach(rank => {
      const y = padding.top + chartHeight * ((rank - 1) / (maxRank - 1 || 1));
      ctx.fillText('#' + rank, padding.left - 8, y + 4);
    });

    // 定义颜色
    const colors = [
      '#64ffda', '#ff6b6b', '#ffd700', '#9370db', '#00bcd4',
      '#ff9800', '#e91e63', '#8bc34a', '#3f51b5', '#ff5722',
      '#009688', '#795548', '#607d8b', '#f44336', '#2196f3'
    ];

    // 绘制折线
    modelNames.forEach((name, modelIdx) => {
      const entries = models[name] || [];
      if (entries.length === 0) return;

      const color = colors[modelIdx % colors.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      entries.forEach((entry, idx) => {
        const x = padding.left + (chartWidth / (dates.length - 1 || 1)) * dates.indexOf(entry.date);
        // 排名反转：rank=1 在最上面，rank=maxRank 在最下面
        const y = padding.top + chartHeight * ((entry.rank - 1) / (maxRank - 1 || 1));

        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // 绘制数据点
      ctx.fillStyle = color;
      entries.forEach(entry => {
        const x = padding.left + (chartWidth / (dates.length - 1 || 1)) * dates.indexOf(entry.date);
        const y = padding.top + chartHeight * ((entry.rank - 1) / (maxRank - 1 || 1));

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // 绘制图例（改为竖排显示，更清晰）
    const legendX = width - padding.right - 120;
    let legendY = padding.top;
    modelNames.forEach((name, idx) => {
      const color = colors[idx % colors.length];
      const y = legendY + idx * 18;

      // 颜色方块
      ctx.fillStyle = color;
      ctx.fillRect(legendX, y - 5, 12, 12);

      // 模型名称（截断过长的名字）
      ctx.fillStyle = '#a8b2d1';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      const displayName = name.length > 14 ? name.substring(0, 12) + '...' : name;
      ctx.fillText(displayName, legendX + 16, y + 4);
    });
  },

  goBack: function () {
    wx.navigateBack();
  },

  toggleCard: function (e) {
    const index = e.currentTarget.dataset.index;
    const key = `tableData[${index}].expanded`;
    this.setData({
      [key]: !this.data.tableData[index].expanded
    });
  }
});
