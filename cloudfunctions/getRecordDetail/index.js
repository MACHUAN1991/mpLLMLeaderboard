const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { recordId } = event;

  if (!recordId) {
    return { success: false, error: '缺少记录ID' };
  }

  try {
    // 获取主记录
    const mainRecord = await db.collection('analysis_records')
      .where({ recordId })
      .get();

    if (!mainRecord.data || mainRecord.data.length === 0) {
      return { success: false, error: '记录不存在' };
    }

    // 获取排名详情
    const detailRecord = await db.collection('rankings_data')
      .where({ recordId })
      .get();

    const record = mainRecord.data[0];
    const rankings = detailRecord.data[0]?.rankings || [];

    console.log('getRecordDetail - recordId:', recordId);
    console.log('getRecordDetail - rankings count:', rankings.length);

    return {
      success: true,
      data: {
        date: record.date,
        source: record.source || 'arena',
        rankings: rankings
      }
    };

  } catch (err) {
    console.error('获取记录详情失败:', err);
    return {
      success: false,
      error: err.message || '获取失败'
    };
  }
};
