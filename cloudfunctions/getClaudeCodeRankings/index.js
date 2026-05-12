const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const db = cloud.database()

  try {
    // 获取最新的排行榜记录
    const records = await db.collection('claude_code_rankings')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get()

    if (records.data.length === 0) {
      return { success: true, data: [], message: 'No data available' }
    }

    return { success: true, data: records.data }

  } catch (error) {
    console.error('Error getting Claude Code rankings:', error)
    return { success: false, error: error.message }
  }
}
