/**
 * AA 来源数据格式化工具
 * 固定价格单位为 "$x/1M Tokens"
 * 固定速度单位为 "x/Tokens"
 * 固定上下文长度单位为 "K" 或 "M"
 */

// 价格格式化：提取数值，统一为 $x/1M Tokens
function formatPrice(price) {
  if (!price || price === 'null' || price === '-') return '-';

  const str = String(price).trim();

  // 已是目标格式
  if (/^\$[\d.]+\/1?M\s*Tokens?$/i.test(str)) return str;

  // 免费类
  if (/免费|free|Free/i.test(str)) return '免费';

  // 提取数字部分
  const numMatch = str.match(/[\d.]+/);
  if (!numMatch) return str;
  const num = parseFloat(numMatch[0]);
  if (isNaN(num)) return str;

  return `$${num}/1M Tokens`;
}

// 速度格式化：提取数值，统一为 x/Tokens
function formatSpeed(speed) {
  if (!speed || speed === 'null' || speed === '-') return '-';

  const str = String(speed).trim();

  // 已是目标格式
  if (/^[\d.]+\/Tokens?$/i.test(str)) return str;

  // 提取数字部分
  const numMatch = str.match(/[\d.]+/);
  if (!numMatch) return str;
  const num = parseFloat(numMatch[0]);
  if (isNaN(num)) return str;

  return `${num}/Tokens`;
}

// 上下文长度格式化：统一为 K 或 M
function formatContextLength(ctx) {
  if (!ctx || ctx === 'null' || ctx === '-') return '-';

  const str = String(ctx).trim();

  // 已是目标格式（如 "128K", "1M"）
  if (/^[\d.]+\s*[KkMm]$/.test(str)) return str.toUpperCase();

  // "无限" / "Unlimited" 等
  if (/无限|infinite|unlimited/i.test(str)) return '无限';

  // 提取数字
  const numMatch = str.match(/([\d.]+)/);
  if (!numMatch) return str;
  let num = parseFloat(numMatch[1]);
  if (isNaN(num)) return str;

  // 如果原始文本包含 M/m 后缀
  if (/[Mm]/.test(str.replace(numMatch[0], '').trim())) {
    return `${num}M`;
  }

  // 如果原始文本包含 K/k 后缀
  if (/[Kk]/.test(str.replace(numMatch[0], '').trim())) {
    return `${num}K`;
  }

  // 纯数字：大于 10000 视为 tokens，转换为 K/M
  if (num >= 1000000) {
    return `${num / 1000000}M`;
  } else if (num >= 1000) {
    return `${num / 1000}K`;
  }

  return `${num}K`;
}

module.exports = {
  formatPrice,
  formatSpeed,
  formatContextLength
};
