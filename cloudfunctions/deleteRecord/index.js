const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// Agent类型对应的数据库集合
const AGENT_COLLECTIONS = {
  'claude-code': 'claude_code_rankings',
  'hermes-agent': 'hermes_agent_rankings',
  'openclaw': 'openclaw_rankings',
  'codex': 'codex_rankings'
};

exports.main = async (event, context) => {
  const db = cloud.database();
  const { recordId, source, agentType } = event;

  if (!recordId) {
    return { success: false, error: '缺少记录ID' };
  }

  try {
    // Agent类型的记录删除
    if (source === 'agent' && agentType) {
      const collectionName = AGENT_COLLECTIONS[agentType];
      if (collectionName) {
        await db.collection(collectionName)
          .where({ recordId })
          .remove();
      }
      return { success: true };
    }

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
