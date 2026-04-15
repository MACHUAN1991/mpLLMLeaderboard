const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { recordId } = event;

  if (!recordId) {
    return { success: false, error: '缺少记录ID' };
  }

  try {
    // 删除主记录
    await db.collection('analysis_records')
      .where({ recordId })
      .remove();

    // 删除关联的排名详情
    await db.collection('rankings_data')
      .where({ recordId })
      .remove();

    // 删除云存储中的图片（如果存在）
    if (event.imageFileId) {
      try {
        await cloud.deleteFile({ fileList: [event.imageFileId] });
      } catch (e) {
        console.warn('删除图片失败:', e);
      }
    }

    return { success: true };

  } catch (err) {
    console.error('删除记录失败:', err);
    return {
      success: false,
      error: err.message || '删除失败'
    };
  }
};
