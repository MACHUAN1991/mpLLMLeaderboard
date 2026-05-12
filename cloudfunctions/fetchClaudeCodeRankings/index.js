const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const CLAUDE_CODE_URL = 'https://openrouter.ai/apps/claude-code'

exports.main = async (event, context) => {
  try {
    // 1. 爬取页面
    const response = await axios.get(CLAUDE_CODE_URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    const html = response.data
    console.log('HTML length:', html.length)

    // 2. 提取appModelAnalytics数组
    // 数据格式: appModelAnalytics\":[{\"date\":\"2026-05-12\",\"model_permaslug\":\"...\",\"total_tokens\":...}]
    const startIndex = html.indexOf('appModelAnalytics')
    if (startIndex === -1) {
      return { success: false, error: 'appModelAnalytics not found in page' }
    }

    // 从appModelAnalytics开始提取数组内容
    const arrayStart = html.indexOf('[', startIndex)
    if (arrayStart === -1) {
      return { success: false, error: 'Array start not found' }
    }

    // 找到数组结束位置
    let depth = 0
    let arrayEnd = arrayStart
    for (let i = arrayStart; i < html.length; i++) {
      if (html[i] === '[') depth++
      if (html[i] === ']') depth--
      if (depth === 0) {
        arrayEnd = i + 1
        break
      }
    }

    const arrayStr = html.substring(arrayStart, arrayEnd)
    console.log('Array string length:', arrayStr.length)

    // 解析JSON（需要先处理转义）
    let analytics
    try {
      analytics = JSON.parse(arrayStr.replace(/\\"/g, '"'))
    } catch (e) {
      console.log('JSON parse error:', e.message)
      // 尝试直接解析（可能不需要处理转义）
      try {
        analytics = JSON.parse(arrayStr)
      } catch (e2) {
        console.log('JSON parse error 2:', e2.message)
        return { success: false, error: 'Failed to parse JSON data' }
      }
    }

    if (!analytics || analytics.length === 0) {
      return { success: false, error: 'No data extracted' }
    }

    console.log('Extracted', analytics.length, 'models')
    return await saveRankings(analytics)

  } catch (error) {
    console.error('Error fetching Claude Code rankings:', error)
    return { success: false, error: error.message }
  }
}

async function saveRankings(analytics) {
  const db = cloud.database()

  // 3. 按token使用量排序
  analytics.sort((a, b) => b.total_tokens - a.total_tokens)

  // 4. 计算总token
  const totalTokens = analytics.reduce((sum, item) => sum + item.total_tokens, 0)

  // 5. 标准化数据
  const rankings = analytics.map((item, index) => {
    const parts = item.model_permaslug.split('/')
    const provider = parts[0]
    const modelSlug = parts.slice(1).join('/')

    return {
      rank: index + 1,
      model: item.model_permaslug,
      provider,
      modelName: formatModelName(modelSlug),
      totalTokens: item.total_tokens,
      totalTokensFormatted: formatTokens(item.total_tokens),
      percentage: ((item.total_tokens / totalTokens) * 100).toFixed(2)
    }
  })

  // 6. 生成记录
  const recordId = generateUUID()
  // 统一日期格式: 2026-05-12 -> 2026.5.12
  const rawDate = analytics[0]?.date || new Date().toISOString().split('T')[0]
  const dateParts = rawDate.split('-')
  const date = `${dateParts[0]}.${parseInt(dateParts[1])}.${parseInt(dateParts[2])}`

  // 7. 保存到数据库
  await db.collection('claude_code_rankings').add({
    data: {
      recordId,
      date,
      timestamp: Date.now(),
      totalModels: rankings.length,
      totalTokens,
      totalTokensFormatted: formatTokens(totalTokens),
      top3: rankings.slice(0, 3),
      status: 'completed',
      rankings
    }
  })

  // 8. 清理旧数据（保留最近14天）
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
  try {
    const oldRecords = await db.collection('claude_code_rankings')
      .where({
        timestamp: db.command.lt(fourteenDaysAgo)
      })
      .get()

    for (const record of oldRecords.data) {
      await db.collection('claude_code_rankings').doc(record._id).remove()
    }
  } catch (e) {
    console.log('Clean old data error:', e)
  }

  return { success: true, recordId, totalModels: rankings.length, date }
}

function formatModelName(slug) {
  // claude-4.7-opus-20260416 -> Claude 4.7 Opus
  // deepseek-v4-pro-20260423 -> Deepseek V4 Pro
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/\d{8}$/, '')  // 移除日期后缀
    .trim()
}

function formatTokens(tokens) {
  if (tokens >= 1e12) return (tokens / 1e12).toFixed(1) + 'T'
  if (tokens >= 1e9) return (tokens / 1e9).toFixed(1) + 'B'
  if (tokens >= 1e6) return (tokens / 1e6).toFixed(1) + 'M'
  if (tokens >= 1e3) return (tokens / 1e3).toFixed(1) + 'K'
  return tokens.toString()
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
