const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { source = 'artificial-analysis' } = event;

  // 计算14天前的时间戳
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  try {
    // 1. 获取该来源最近一周的记录（按时间升序）
    const recordsResult = await db.collection('analysis_records')
      .where({
        source,
        timestamp: db.command.gte(fourteenDaysAgo)
      })
      .orderBy('timestamp', 'asc')
      .limit(100)
      .get();

    const records = recordsResult.data;

    if (!records || records.length === 0) {
      return { success: true, data: { dates: [], models: {} } };
    }

    // 2. 提取日期和 recordId 列表
    const dates = records.map(r => r.date || '');
    const recordIds = records.map(r => r.recordId);

    // 3. 批量获取所有 rankings_data
    // 由于云数据库 where in 限制 20 条，需要分批查询
    const batchSize = 20;
    let allRankings = [];

    for (let i = 0; i < recordIds.length; i += batchSize) {
      const batch = recordIds.slice(i, i + batchSize);
      const rankingsResult = await db.collection('rankings_data')
        .where({
          recordId: db.command.in(batch)
        })
        .get();

      allRankings = allRankings.concat(rankingsResult.data);
    }

    // 4. 构建模型趋势数据
    // 格式: { "modelName": [{ date, rank, score, organization }] }
    const models = {};
    const modelOrgMap = {}; // 记录每个模型的厂商

    records.forEach((record, idx) => {
      const date = record.date || '';
      const recordId = record.recordId;

      // 找到对应的 rankings_data
      const rankingData = allRankings.find(r => r.recordId === recordId);
      if (!rankingData || !rankingData.rankings) return;

      rankingData.rankings.forEach(item => {
        const modelName = item.modelName || item['Model Name'] || '';
        if (!modelName) return;

        // 记录厂商
        if (item.organization) {
          modelOrgMap[modelName] = item.organization;
        }

        if (!models[modelName]) {
          models[modelName] = [];
        }

        models[modelName].push({
          date,
          rank: item.rank || 0,
          score: item.score || 0,
          organization: item.organization || ''
        });
      });
    });

    // 5. 按模型在最新一期的排名排序，取 Top 15
    const latestRecord = records[records.length - 1];
    const latestRanking = allRankings.find(r => r.recordId === latestRecord.recordId);

    let topModels = Object.keys(models);
    if (latestRanking && latestRanking.rankings) {
      topModels.sort((a, b) => {
        const rankA = latestRanking.rankings.find(r => (r.modelName || r['Model Name']) === a);
        const rankB = latestRanking.rankings.find(r => (r.modelName || r['Model Name']) === b);
        return (rankA?.rank || 999) - (rankB?.rank || 999);
      });
      topModels = topModels.slice(0, 15);
    }

    // 6. 只保留 Top 模型的数据
    const filteredModels = {};
    topModels.forEach(name => {
      filteredModels[name] = models[name];
    });

    return {
      success: true,
      data: {
        dates,
        models: filteredModels
      }
    };

  } catch (err) {
    console.error('获取趋势数据失败:', err);
    return {
      success: false,
      error: err.message || '获取趋势数据失败'
    };
  }
};
