const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const { page = 1, pageSize = 20 } = event;

  try {
    // 获取记录列表（按时间倒序）
    const countResult = await db.collection('analysis_records').count();

    const records = await db.collection('analysis_records')
      .orderBy('timestamp', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    if (records.data.length === 0) {
      return { success: true, data: [], total: 0, page, pageSize };
    }

    // 批量获取所有 recordId
    const recordIds = records.data.map(r => r.recordId);

    // 一次查询获取所有 rankings_data（in 查询，最多20条/次）
    const allDetails = [];
    // 微信云数据库 in 查询限制20条，分批查询
    for (let i = 0; i < recordIds.length; i += 20) {
      const batch = recordIds.slice(i, i + 20);
      const detailResult = await db.collection('rankings_data')
        .where({ recordId: _.in(batch) })
        .field({ recordId: true, rankings: true })
        .get();
      allDetails.push(...detailResult.data);
    }

    // 构建 recordId -> detail 的映射
    const detailMap = {};
    allDetails.forEach(d => {
      detailMap[d.recordId] = d.rankings || [];
    });

    // 组装数据，只返回 top3
    const recordsWithDetails = records.data.map(record => {
      const rankings = detailMap[record.recordId] || [];
      const sorted = [...rankings].sort((a, b) => (a.Rank || a.rank || 999) - (b.Rank || b.rank || 999));
      return {
        ...record,
        top3: sorted.slice(0, 3).map(item => ({
          rank: item.Rank || item.rank || 0,
          modelName: item['Model Name'] || item.model_name || item.modelName || ''
        }))
      };
    });

    return {
      success: true,
      data: recordsWithDetails,
      total: countResult.total,
      page,
      pageSize
    };

  } catch (err) {
    console.error('获取历史记录失败:', err);
    return {
      success: false,
      error: err.message || '获取失败'
    };
  }
};
