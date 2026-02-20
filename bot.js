import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";
import "dotenv/config";

// ===== ENV =====
const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL; // https://app.teosegypt.com
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY; // demo/bypass key accepted by MCP for FREE tier scans
const ANALYZE_PATH = process.env.ANALYZE_PATH || "/analyze";
const HEALTH_PATH = process.env.HEALTH_PATH || "/health";

const OWNER_ID = Number(process.env.TEOS_OWNER_ID || "0");

// Free tier: 5 scans lifetime per Telegram account
const FREE_SCANS = Number(process.env.FREE_SCANS || "5");

// Rate limit: 2 minutes window, max 3 scans per window
const RL_WINDOW_MS = Number(process.env.RL_WINDOW_MS || String(2 * 60 * 1000));
const RL_MAX_REQ = Number(process.env.RL_MAX_REQ || "3");

// Pricing display (bot does NOT do billing)
const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_SCAN_MIN = Number(process.env.PRICE_SCAN_MIN || "0.25");
const PRICE_SCAN_MAX = Number(process.env.PRICE_SCAN_MAX || "1");

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

console.log("TEOS BOT VERSION 1.1.0 LOADED ✅");
console.log("API_BASE_URL:", API_BASE_URL);
console.log("ANALYZE_PATH:", ANALYZE_PATH);
console.log("OWNER_ID:", OWNER_ID || "not set");

// ===== DB (JSON) =====
const DB_FILE = "./data.json";
const DB_TMP = "./data.json.tmp";

async function loadDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    if (!db.users) db.users = {};
    return db;
  } catch {
    return { users: {} };
  }
}

async function saveDB(db) {
  await fs.writeFile(DB_TMP, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(DB_TMP, DB_FILE);
}

async function getUser(telegramId) {
  const db = await loadDB();
  if (!db.users[telegramId]) {
    db.users[telegramId] = {
      scans_used: 0,
      rl: { windowStart: 0, count: 0 },
    };
    await saveDB(db);
  } else {
    db.users[telegramId].scans_used ??= 0;
    db.users[telegramId].rl ??= { windowStart: 0, count: 0 };
  }
  return { db, user: db.users[telegramId] };
}

function scansLeft(user) {
  return Math.max(0, FREE_SCANS - (user.scans_used || 0));
}

function isOwnerId(telegramId) {
  return OWNER_ID && Number(telegramId) === OWNER_ID;
}

// ===== Rate limit =====
function checkRateLimit(user) {
  const now = Date.now();
  const rl = user.rl || { windowStart: 0, count: 0 };

  // reset window
  if (!rl.windowStart || now - rl.windowStart > RL_WINDOW_MS) {
    rl.windowStart = now;
    rl.count = 1;
    user.rl = rl;
    return true;
  }

  // deny
  if (rl.count >= RL_MAX_REQ) {
    user.rl = rl;
    return false;
  }

  // allow
  rl.count += 1;
  user.rl = rl;
  return true;
}

// ===== HTTP helpers =====
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ===== MCP call =====
async function callAnalyze(code) {
  const url = `${API_BASE_URL}${ANALYZE_PATH}`;
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-teos-bot-key": TEOS_BOT_KEY,
      },
      body: JSON.stringify({ code, mode: "basic", source: "telegram" }),
    },
    15000
  );
}

// ===== Bot init =====
const bot = new TelegramBot(TG_TOKEN, {
  polling: {
    autoStart: false,
    params: { timeout: 30 },
  },
});

async function start() {
  try {
    await bot.setWebHook("");
  } catch (e) {
    console.error("Webhook clear failed:", e?.message || e);
  }
  bot.startPolling();
  console.log("Bot started polling ✅");
}

// ===== Core scan logic =====
async function scanCode(chatId, telegramId, code) {
  const idStr = String(telegramId);
  const { db, user } = await getUser(idStr);

  // Founder access: unlimited, no rate limit, no quota
  if (isOwnerId(telegramId)) {
    await bot.sendMessage(chatId, "🔎 Scanning (Founder access)...");
    return doAnalyzeAndReply(chatId, code, "∞");
  }

  // Rate limit gate
  if (!checkRateLimit(user)) {
    db.users[idStr] = user;
    await saveDB(db);
    return bot.sendMessage(
      chatId,
      `⛔ Too many requests.\nPlease wait 2 minutes before scanning again.`
    );
  }

  // Free tier gate
  if ((user.scans_used || 0) >= FREE_SCANS) {
    db.users[idStr] = user;
    await saveDB(db);
    return bot.sendMessage(
      chatId,
      `⚠️ Free Tier limit reached (${FREE_SCANS}/${FREE_SCANS}).\n\n` +
        `Continue on TEOS MCP:\n${API_BASE_URL}/pricing\n\n` +
        `Pay-per-scan: ${PRICE_SCAN_MIN} → ${PRICE_SCAN_MAX} USDC per scan\n` +
        `Pay to: ${PAY_TO}\n\n` +
        `Sign up / get API access on web:\n${API_BASE_URL}`
    );
  }

  await bot.sendMessage(chatId, "🔎 Scanning...");

  const ok = await doAnalyzeAndReply(chatId, code, null);

  // Consume scan only on success
  if (ok) {
    user.scans_used = (user.scans_used || 0) + 1;
  }

  db.users[idStr] = user;
  await saveDB(db);

  // Post-scan remaining
  const left = scansLeft(user);
  await bot.sendMessage(chatId, `🎁 Scans left: ${left}`);
}

async function doAnalyzeAndReply(chatId, code, forcedLeftText = null) {
  let res;
  try {
    res = await callAnalyze(code);
  } catch (e) {
    await bot.sendMessage(chatId, `❌ API timeout/offline.\n${String(e?.message || e)}`);
    return false;
  }

  if (res.status === 402) {
    await bot.sendMessage(
      chatId,
      `❌ API returned 402 (Payment Required).\n` +
        `Server is not accepting bot bypass key.\n` +
        `Fix MCP to allow x-teos-bot-key for Free Tier scans.`
    );
    return false;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    await bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
    return false;
  }

  const data = await res.json().catch(() => ({}));

  const decision = data?.result?.decision || "UNKNOWN";
  const risk = data?.result?.overallRisk || "Unknown";
  const summary =
    data?.result?.summary ||
    data?.result?.reason ||
    (data?.result?.findings?.length
      ? `Found ${data.result.findings.length} issue(s).`
      : "No details provided.");

  const decisionEmoji = decision === "ALLOW" ? "✅" : decision === "WARN" ? "⚠️" : "⛔";

  await bot.sendMessage(
    chatId,
    `${decisionEmoji} Decision: ${decision}\n` +
      `⚠️ Risk: ${String(risk).toUpperCase()}\n` +
      `🧾 Summary: ${String(summary).slice(0, 700)}\n\n` +
      `Web: ${API_BASE_URL}`
  );

  if (forcedLeftText) {
    await bot.sendMessage(chatId, `🎁 Scans left: ${forcedLeftText}`);
  }

  return true;
}

// ===== Commands =====
bot.onText(/^\/start$/, async (msg) => {
  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
`🏺 TEOS MCP — Agent Code Risk Scanner

🎁 Free Tier: ${FREE_SCANS} scans per account (lifetime)
Remaining: ${scansLeft(user)}

Use:
• /scan <code>
• or paste code directly

Commands:
• /help
• /balance
• /pricing
• /ping`
  );
});

bot.onText(/^\/help$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
`🧠 How to use

/scan <code>  → Scan code
Paste code     → Scan without command

/balance       → Free Tier usage
/pricing       → Pricing page
/ping          → API status`
  );
});

bot.onText(/^\/balance$/, async (msg) => {
  if (isOwnerId(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, `📊 Founder access: ∞ scans`);
  }
  const { user } = await getUser(String(msg.from.id));
  return bot.sendMessage(
    msg.chat.id,
    `📊 Free Tier usage: ${user.scans_used}/${FREE_SCANS}\nScans left: ${scansLeft(user)}`
  );
});

bot.onText(/^\/pricing$/, async (msg) => {
  return bot.sendMessage(
    msg.chat.id,
    `💳 Pricing\n${API_BASE_URL}/pricing\n\nPay-per-scan: ${PRICE_SCAN_MIN} → ${PRICE_SCAN_MAX} USDC per scan\nPay to: ${PAY_TO}`
  );
});

bot.onText(/^\/ping$/, async (msg) => {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}${HEALTH_PATH}`, { method: "GET" }, 8000);
    const txt = await res.text().catch(() => "");
    return bot.sendMessage(msg.chat.id, `✅ API ping: ${res.status}\n${txt.slice(0, 300)}`);
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ API ping failed: ${String(e?.message || e)}`);
  }
});

// /scan <code>
bot.onText(/^\/scan(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const code = (match?.[1] || "").trim();
  if (!code) return bot.sendMessage(msg.chat.id, "Usage:\n/scan eval(userInput)");
  return scanCode(msg.chat.id, msg.from.id, code);
});

// Default: scan any non-command text
bot.on("message", async (msg) => {
  const text = msg.text || "";
  if (!text) return;
  if (text.startsWith("/")) return;
  return scanCode(msg.chat.id, msg.from.id, text);
});

bot.on("polling_error", (e) => console.error("Polling error:", e?.message || e));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

start().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
