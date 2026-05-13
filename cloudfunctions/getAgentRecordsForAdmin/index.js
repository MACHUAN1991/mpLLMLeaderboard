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
  try {
    const allRecords = [];

    // 获取所有Agent类型的记录
    for (const [agentType, collectionName] of Object.entries(AGENT_COLLECTIONS)) {
      try {
        const records = await cloud.database().collection(collectionName)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();

        console.log(`[${agentType}] Found ${records.data.length} records`);

        for (const record of records.data) {
          allRecords.push({
            ...record,
            source: 'agent',
            agentType,
            displaySource: agentType
          });
        }
      } catch (e) {
        console.warn(`[${agentType}] Error fetching records:`, e.message);
      }
    }

    console.log('Total agent records:', allRecords.length);

    // 按时间排序
    allRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return { success: true, data: allRecords };

  } catch (error) {
    console.error('Error getting agent records:', error);
    return { success: false, error: error.message };
  }
};