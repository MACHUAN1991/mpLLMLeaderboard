const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const db = cloud.database()

  try {
    // 获取最近14天的记录
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000

    const records = await db.collection('claude_code_rankings')
      .where({
        timestamp: db.command.gte(fourteenDaysAgo)
      })
      .orderBy('timestamp', 'asc')
      .limit(100)
      .get()

    if (records.data.length === 0) {
      return { success: true, data: { dates: [], models: {} } }
    }

    // 构建趋势数据
    const dates = []
    const models = {}

    for (const record of records.data) {
      // 统一日期格式: 2026-05-12 -> 2026.5.12
      let date = record.date || ''
      if (date.includes('-')) {
        const parts = date.split('-')
        date = `${parts[0]}.${parseInt(parts[1])}.${parseInt(parts[2])}`
      }
      dates.push(date)

      for (const item of record.rankings) {
        if (!models[item.model]) {
          models[item.model] = {
            modelName: item.modelName,
            provider: item.provider,
            data: []
          }
        }
        models[item.model].data.push({
          date: date,
          rank: item.rank,
          totalTokens: item.totalTokens,
          percentage: item.percentage
        })
      }
    }

    // 按最新排名排序
    const sortedModels = Object.entries(models)
      .map(([model, info]) => ({
        model,
        ...info,
        latestRank: info.data[info.data.length - 1]?.rank || 999
      }))
      .sort((a, b) => a.latestRank - b.latestRank)
      .slice(0, 15)  // 只返回前15个模型

    const result = {}
    for (const item of sortedModels) {
      result[item.model] = item
    }

    return { success: true, data: { dates, models: result } }

  } catch (error) {
    console.error('Error getting Claude Code trend data:', error)
    return { success: false, error: error.message }
  }
}
