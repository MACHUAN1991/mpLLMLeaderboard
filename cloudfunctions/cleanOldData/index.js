const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const RETENTION_DAYS = 14;

exports.main = async () => {
  const db = cloud.database();
  const _ = db.command;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deletedRecords = 0;
  let deletedRankings = 0;

  try {
    // 1. 查找超过14天的 analysis_records，收集 recordId
    const oldRecordIds = [];
    while (true) {
      const old = await db.collection('analysis_records')
        .where({ timestamp: _.lt(cutoff) })
        .limit(100)
        .get();

      if (!old.data || old.data.length === 0) break;

      for (const doc of old.data) {
        oldRecordIds.push(doc.recordId);
        await db.collection('analysis_records').doc(doc._id).remove();
        deletedRecords++;
      }
    }

    // 2. 用 recordId 删除对应的 rankings_data（每次最多操作100条）
    for (const recordId of oldRecordIds) {
      while (true) {
        const batch = await db.collection('rankings_data')
          .where({ recordId })
          .limit(100)
          .get();

        if (!batch.data || batch.data.length === 0) break;

        for (const doc of batch.data) {
          await db.collection('rankings_data').doc(doc._id).remove();
          deletedRankings++;
        }
      }
    }

    console.log(`清理完成: 删除 ${deletedRecords} 条记录, ${deletedRankings} 条排名数据`);
    return { success: true, deletedRecords, deletedRankings };

  } catch (err) {
    console.error('清理旧数据失败:', err);
    return { success: false, error: err.message };
  }
};
