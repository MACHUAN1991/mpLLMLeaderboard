const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Agent类型对应的OpenRouter路径
const AGENT_URLS = {
  'claude-code': 'https://openrouter.ai/apps/claude-code',
  'hermes-agent': 'https://openrouter.ai/apps/hermes-agent',
  'openclaw': 'https://openrouter.ai/apps/openclaw',
  'codex': 'https://openrouter.ai/apps/codex'
}

// Agent类型对应的数据库集合
const AGENT_COLLECTIONS = {
  'claude-code': 'claude_code_rankings',
  'hermes-agent': 'hermes_agent_rankings',
  'openclaw': 'openclaw_rankings',
  'codex': 'codex_rankings'
}

exports.main = async (event, context) => {
  console.log('定时任务开始执行...')

  const results = []

  for (const [agentType, url] of Object.entries(AGENT_URLS)) {
    const collectionName = AGENT_COLLECTIONS[agentType]
    console.log(`[${agentType}] 开始抓取...`)

    try {
      // 爬取页面
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      const html = response.data
      console.log(`[${agentType}] HTML length:`, html.length)

      // 提取appModelAnalytics数组
      const startIndex = html.indexOf('appModelAnalytics')
      if (startIndex === -1) {
        console.log(`[${agentType}] appModelAnalytics not found, skipping`)
        results.push({ agentType, success: false, error: 'appModelAnalytics not found' })
        continue
      }

      const arrayStart = html.indexOf('[', startIndex)
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

      let analytics
      try {
        analytics = JSON.parse(arrayStr.replace(/\\"/g, '"'))
      } catch (e) {
        try {
          analytics = JSON.parse(arrayStr)
        } catch (e2) {
          console.log(`[${agentType}] JSON parse error`)
          results.push({ agentType, success: false, error: 'JSON parse error' })
          continue
        }
      }

      if (!analytics || analytics.length === 0) {
        results.push({ agentType, success: false, error: 'No data extracted' })
        continue
      }

      // 按token使用量排序
      analytics.sort((a, b) => b.total_tokens - a.total_tokens)

      // 计算总token
      const totalTokens = analytics.reduce((sum, item) => sum + item.total_tokens, 0)

      // 标准化数据
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

      // 生成记录
      const recordId = generateUUID()
      const rawDate = analytics[0]?.date || new Date().toISOString().split('T')[0]
      const dateParts = rawDate.split('-')
      const date = `${dateParts[0]}.${parseInt(dateParts[1])}.${parseInt(dateParts[2])}`

      // 保存到数据库
      await cloud.database().collection(collectionName).add({
        data: {
          recordId,
          agentType,
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

      // 清理旧数据（保留最近14天）
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
      try {
        const oldRecords = await cloud.database().collection(collectionName)
          .where({ timestamp: cloud.database().command.lt(fourteenDaysAgo) })
          .get()
        for (const record of oldRecords.data) {
          await cloud.database().collection(collectionName).doc(record._id).remove()
        }
      } catch (e) {
        console.log(`[${agentType}] Clean old data error:`, e)
      }

      console.log(`[${agentType}] 抓取成功: ${rankings.length}个模型`)
      results.push({ agentType, success: true, totalModels: rankings.length, date })

    } catch (error) {
      console.error(`[${agentType}] 抓取失败:`, error)
      results.push({ agentType, success: false, error: error.message })
    }
  }

  console.log('定时任务执行完成:', results)
  return { success: true, results }
}

function formatModelName(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/\d{8}$/, '')
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