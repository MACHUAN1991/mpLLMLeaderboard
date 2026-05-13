const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Agent类型对应的数据库集合
const AGENT_COLLECTIONS = {
  'claude-code': 'claude_code_rankings',
  'hermes-agent': 'hermes_agent_rankings',
  'openclaw': 'openclaw_rankings',
  'codex': 'codex_rankings'
}

exports.main = async (event, context) => {
  const agentType = event.agentType || 'claude-code'

  // 验证agent类型
  if (!AGENT_COLLECTIONS[agentType]) {
    return { success: false, error: 'Invalid agent type' }
  }

  const collectionName = AGENT_COLLECTIONS[agentType]

  try {
    // 获取最新的排行榜记录
    const records = await cloud.database().collection(collectionName)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get()

    console.log(`[${agentType}] Found ${records.data.length} records`);

    if (records.data.length === 0) {
      return { success: true, data: [], message: 'No data available', agentType }
    }

    return { success: true, data: records.data, agentType }

  } catch (error) {
    console.error(`[${agentType}] Error getting rankings:`, error)
    return { success: true, data: [], message: error.message, agentType }
  }
}