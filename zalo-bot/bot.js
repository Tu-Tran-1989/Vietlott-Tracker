/**
 * VIETLOTT ZALO BOT — daily result sender
 *
 * Run manually:          node bot.js
 * Force a specific type: node bot.js --type 645   (or 655)
 * Test without sending:  node bot.js --dry-run
 *
 * Normally triggered by Windows Task Scheduler every draw day at ~20:00.
 */

import { Zalo, ThreadType } from 'zca-js';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE  = path.join(__dirname, 'credentials.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const DATA_URLS = {
  '645': 'https://raw.githubusercontent.com/vietvudanh/vietlott-data/main/data/power645.jsonl',
  '655': 'https://raw.githubusercontent.com/vietvudanh/vietlott-data/main/data/power655.jsonl',
};

// Draw schedule: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
const DRAW_DAYS = {
  '645': new Set([1, 3, 5]),  // Mon, Wed, Fri
  '655': new Set([2, 4, 6]),  // Tue, Thu, Sat
};

const DAY_NAMES_VI = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];

// ── HELPERS ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateVI(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00');
  const day = DAY_NAMES_VI[d.getDay()];
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const yy  = d.getFullYear();
  return `${day}, ${dd}/${mm}/${yy}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function prizeTier(matched, bonusMatch) {
  if (matched === 6)               return { label: 'ĐẶC BIỆT 🏆', vnd: null };
  if (matched === 5 && bonusMatch) return { label: 'GIẢI NHẤT 🥇', vnd: null };
  if (matched === 5)               return { label: 'Giải Nhì 🥈',  vnd: '~10,000,000đ' };
  if (matched === 4)               return { label: 'Giải Ba 🥉',   vnd: '~300,000đ' };
  if (matched === 3)               return { label: 'Giải Tư ✨',   vnd: '~40,000đ' };
  return null;
}

async function fetchLatestResult(type) {
  const res  = await fetch(DATA_URLS[type]);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${type} data`);
  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);

  // Walk backwards to find the most recent record
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const rec = JSON.parse(lines[i]);
      if (rec.date && Array.isArray(rec.result)) return rec;
    } catch {}
  }
  throw new Error('No valid records found in JSONL');
}

function buildMessage(type, record, config) {
  const userNums = type === '645' ? (config.nums645 || []) : (config.nums655 || []);
  const winNums  = type === '655' ? record.result.slice(0, 6) : record.result.slice(0, 6);
  const bonus    = type === '655' ? (record.result[6] ?? null) : null;

  const winSet   = new Set(winNums.map(Number));
  const matched  = userNums.map(Number).filter(n => winSet.has(n)).length;
  const bonusMatch = bonus !== null && userNums.map(Number).includes(Number(bonus));
  const tier     = prizeTier(matched, bonusMatch);

  const typeName = type === '645' ? 'Power 6/45' : 'Power 6/55';
  const drawId   = record.id ? `#${String(record.id).padStart(5,'0')}` : '';

  // Format winning numbers (mark matches with ✅)
  const winLine = winNums
    .map(n => {
      const isMatch = userNums.map(Number).includes(Number(n));
      return isMatch ? `${pad(n)}✅` : `${pad(n)}`;
    })
    .join(' - ');

  const bonusLine = bonus !== null
    ? `  Số phụ: ${pad(bonus)}${bonusMatch ? '✅' : ''}\n`
    : '';

  // My numbers line
  const myLine = userNums.length
    ? userNums.map(n => winSet.has(Number(n)) ? `${pad(n)}✅` : `${pad(n)}`).join(' - ')
    : '(chưa cài đặt)';

  // Prize result
  let resultLine;
  if (!userNums.length) {
    resultLine = '⚙️  Chưa cài số — vào app để thiết lập.';
  } else if (tier) {
    resultLine = `🎉 Khớp ${matched}/6 → ${tier.label}${tier.vnd ? ` (${tier.vnd})` : ' — Jackpot!'}`;
  } else {
    resultLine = `😔 Khớp ${matched}/6 — Không trúng. Cố lên kỳ sau!`;
  }

  const isToday = record.date === todayStr();
  const dateLabel = isToday ? `Hôm nay, ${formatDateVI(record.date)}` : formatDateVI(record.date);

  return [
    `🎰 KẾT QUẢ VIETLOTT`,
    `📅 ${dateLabel} | ${typeName} ${drawId}`,
    ``,
    `🔢 Kết quả:`,
    `  ${winLine}`,
    bonusLine.trimEnd() ? bonusLine.trimEnd() : null,
    ``,
    `🎯 Số của nhóm:`,
    `  ${myLine}`,
    ``,
    resultLine,
    ``,
    `💸 Chi hôm nay: 10,000đ`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✨ Chúc may mắn kỳ tới!`,
  ].filter(l => l !== null).join('\n');
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun  = process.argv.includes('--dry-run');
  const forceType = process.argv.find(a => a.startsWith('--type=') || a === '--type')
    ? (process.argv.find(a => a.startsWith('--type='))?.split('=')[1]
      ?? process.argv[process.argv.indexOf('--type') + 1])
    : null;

  // ── Load config ──
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌  config.json not found. Run setup.js first.');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

  if (!config.groupId) {
    console.error('❌  groupId is empty in config.json. Run node setup.js to find it.');
    process.exit(1);
  }

  // ── Determine lottery type for today ──
  const today   = new Date();
  const weekday = today.getDay();

  let type = forceType;
  if (!type) {
    if (DRAW_DAYS['645'].has(weekday)) type = '645';
    else if (DRAW_DAYS['655'].has(weekday)) type = '655';
    else {
      console.log(`ℹ️  Hôm nay (${DAY_NAMES_VI[weekday]}) không có kỳ xổ số. Bot không gửi gì.`);
      process.exit(0);
    }
  }

  console.log(`📡  Fetching latest ${type === '645' ? '6/45' : '6/55'} result…`);

  // ── Fetch latest result ──
  let record;
  try {
    record = await fetchLatestResult(type);
  } catch (err) {
    console.error('❌  Failed to fetch data:', err.message);
    process.exit(1);
  }

  console.log(`✅  Got result for ${record.date}: [${record.result.join(', ')}]`);

  // ── Build message ──
  const message = buildMessage(type, record, config);

  console.log('\n─── MESSAGE PREVIEW ──────────────────────────────────');
  console.log(message);
  console.log('──────────────────────────────────────────────────────\n');

  if (isDryRun) {
    console.log('🧪  Dry-run mode — message NOT sent.');
    process.exit(0);
  }

  // ── Login to Zalo ──
  if (!fs.existsSync(CRED_FILE)) {
    console.error('❌  credentials.json not found. Run node setup.js first.');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  const zalo  = new Zalo();
  let api;

  console.log('🔐  Logging into Zalo…');
  try {
    api = await zalo.loginCredentials(creds);
    console.log('✅  Logged in.\n');
  } catch (err) {
    console.error('❌  Login failed:', err.message);
    console.error('    Run node setup.js --reauth to refresh your session.');
    process.exit(1);
  }

  // ── Send message ──
  try {
    await api.sendMessage({ msg: message }, config.groupId, ThreadType.Group);
    console.log(`✅  Message sent to group ${config.groupId}`);
  } catch (err) {
    console.error('❌  Failed to send message:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
