# LLM Leaderboard Analyzer

微信小程序 - Arena 大模型排名截图解析工具

## 功能

- 上传 Arena/LMSYS 排行榜截图
- AI 自动识别图片中的排名信息
- 提取模型名称、排名、分数、厂商等数据
- 以可视化方式展示解析结果

## 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   微信小程序    │ ──► │   微信云开发    │ ──► │   MiniMax API   │
│   (上传/展示)   │     │   (云函数/存储)  │     │   (图片理解)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 项目结构

```
mpLLMLeaderboard/
├── cloudfunctions/
│   └── analyzeImage/      # AI 图片分析云函数
│       ├── index.js
│       └── package.json
├── miniprogram/
│   ├── pages/
│   │   ├── index/          # 首页（上传图片）
│   │   └── result/          # 结果展示页
│   ├── app.js
│   └── app.json
├── project.config.json
└── README.md
```

## 配置步骤

### 1. 配置云开发环境

编辑 `miniprogram/app.js`，替换为你的云开发环境 ID：

```javascript
wx.cloud.init({
  env: 'your-env-id', // 例如：mp-xxxxx-1a2b3c
  traceUser: true,
});
```

### 2. 配置 MiniMax API Key

编辑 `cloudfunctions/analyzeImage/index.js`，替换 API Key：

```javascript
const MINIMAX_API_KEY = 'YOUR_MINIMAX_API_KEY';
```

获取方式：登录 MiniMax 平台 → API Keys

### 3. 安装云函数依赖

在 `cloudfunctions/analyzeImage/` 目录下安装依赖：

```bash
cd cloudfunctions/analyzeImage
npm install
```

### 4. 部署云函数

在微信开发者工具中：
1. 右键 `cloudfunctions/analyzeImage` 文件夹
2. 选择「上传并部署」
3. 选择「上传并部署（云端安装依赖）」

### 5. 配置小程序 AppID

编辑 `project.config.json`，替换为你的小程序 AppID：

```json
{
  "appid": "your-appid"
}
```

## 使用说明

1. 打开小程序首页
2. 点击「选择图片」上传 Arena 截图
3. 点击「开始解析」上传并分析
4. 等待 AI 解析完成，自动跳转到结果页
5. 查看解析出的排名信息

## 注意事项

- 需要开通微信云开发
- 需要拥有 MiniMax API Key
- 图片建议清晰、完整露出排名区域
- 云函数调用可能有冷启动延迟

## 开发

```bash
# 安装 mmx-cli (可选，用于本地测试)
npm install -g mmx-cli

# 登录 MiniMax
mmx auth login --api-key YOUR_API_KEY

# 本地测试图片理解
mmx vision describe --image /path/to/image.png
```
