const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20 } = event;

  try {
    // 获取记录列表（按时间倒序）
    const countResult = await db.collection('analysis_records')
      .count();

    const records = await db.collection('analysis_records')
      .orderBy('timestamp', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 获取每个记录的排名详情
    const recordsWithDetails = await Promise.all(records.data.map(async (record) => {
      const detail = await db.collection('rankings_data')
        .where({ recordId: record.recordId })
        .get();

      return {
        ...record,
        rankings: detail.data[0]?.rankings || []
      };
    }));

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
