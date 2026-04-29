const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 生成唯一ID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { date, rankings, imageFileId, source } = event;

  if (!rankings || !Array.isArray(rankings)) {
    return { success: false, error: '缺少排名数据' };
  }

  try {
    const recordId = generateUUID();
    const timestamp = Date.now();

    // 提取厂商列表
    const organizations = [...new Set(rankings.map(r => r.organization || r.Organization || ''))].filter(Boolean);

    // 提取Top3
    const top3 = rankings.slice(0, 3).map(item => ({
      rank: item.rank || item.Rank || 0,
      modelName: item.model_name || item['Model Name'] || '',
      organization: item.organization || item.Organization || '',
      score: item.score || item.Score || 0,
      price: item.price || item.Price || null,
      speed: item.speed || item.Speed || null,
      contextLength: item.contextLength || item['Context Window / Context Length'] || item['Context Window'] || item['Context Length'] || null
    }));

    // 写入主记录
    const mainResult = await db.collection('analysis_records').add({
      data: {
        recordId,
        date: date || '',
        source: source || 'arena',  // 添加来源字段
        timestamp,
        imageFileId: imageFileId || '',
        totalModels: rankings.length,
        top3,
        organizations,
        status: 'completed'
      }
    });

    // 写入排名详情
    const detailResult = await db.collection('rankings_data').add({
      data: {
        recordId,
        rankings: rankings.map(item => ({
          rank: item.rank || item.Rank || 0,
          modelName: item.modelName || item.model_name || item['Model Name'] || '',
          organization: item.organization || item.Organization || '',
          score: item.score || item.Score || 0,
          price: item.price || item.Price || null,
          speed: item.speed || item.Speed || null,
          contextLength: item.contextLength || item['Context Window / Context Length'] || item['Context Window'] || item['Context Length'] || null
        }))
      }
    });

    return {
      success: true,
      recordId,
      mainId: mainResult._id,
      detailId: detailResult._id
    };

  } catch (err) {
    console.error('保存记录失败:', err);
    return {
      success: false,
      error: err.message || '保存失败'
    };
  }
};
