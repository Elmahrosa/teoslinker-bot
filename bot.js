 import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";
import "dotenv/config";

/**
 * TEOS Risk Analyzer Bot (Free Tier funnel)
 * - 5 free scans per account (lifetime)
 * - After that: pay-per-scan messaging (pricing list)
 * - Founder bypass (OWNER_ID) can scan unlimited without consuming quota
 * - Rate limiting per user (anti-spam)
 * - Stable DB with atomic writes
 */

// ---- ENV ----
const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL; // e.g. https://app.teosegypt.com
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY; // bot bypass key for MCP
const ANALYZE_PATH = process.env.ANALYZE_PATH || "/analyze";

const OWNER_ID = Number(process.env.TEOS_OWNER_ID || "0");

const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";

// pricing (pay-per-scan UX)
const PRICE_SCAN_MIN = Number(process.env.PRICE_SCAN_MIN || "0.25"); // example: 0.25 USDC per scan
const PRICE_SCAN_MAX = Number(process.env.PRICE_SCAN_MAX || "1"); // example: up to 1 USDC for heavy/advanced tiers

// free scans per Telegram account (lifetime)
const FREE_SCANS = Number(process.env.FREE_SCANS || "5");

// rate limiting
const RL_WINDOW_MS = Number(process.env.RL_WINDOW_MS || String(2 * 60 * 1000)); // 2 minutes
const RL_MAX_REQ = Number(process.env.RL_MAX_REQ || "3"); // allow 3 scans per window

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

console.log("TEOS BOT VERSION 1.1.0 LOADED ✅");
console.log("API_BASE_URL:", API_BASE_URL);
console.log("ANALYZE_PATH:", ANALYZE_PATH);
console.log("OWNER_ID:", OWNER_ID || "not set");

// ---- DB (JSON) ----
// NOTE: On Koyeb, file system can reset between deploys.
// For production persistence, attach a volume later.
// For now it is fine for funnel/free-tier.
const DB_FILE = "./data.json";
const DB_TMP = "./data.json.tmp";

async function loadDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = {};
    return parsed;
  } catch {
    return { users: {} };
  }
}

async function saveDB(db) {
  // atomic write
  await fs.writeFile(DB_TMP, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(DB_TMP, DB_FILE);
}

async function getUser(telegramId) {
  const db = await loadDB();
  if (!db.users[telegramId]) {
    db.users[telegramId] = {
      scans_used: 0,
      is_paid: false, // reserved for future auto-pay verification
      rl: { windowStart: 0, count: 0 },
    };
    await saveDB(db);
  } else {
    // backfill fields
    db.users[telegramId].scans_used ??= 0;
    db.users[telegramId].is_paid ??= false;
    db.users[telegramId].rl ??= { windowStart: 0, count: 0 };
  }
  return { db, user: db.users[telegramId] };
}

function scansLeft(user) {
  if (user.is_paid) return "∞";
  return Math.max(0, FREE_SCANS - (user.scans_used || 0));
}

function isOwnerId(telegramId) {
  return OWNER_ID && Number(telegramId) === OWNER_ID;
}

function isOwnerMsg(msg) {
  return OWNER_ID && msg?.from?.id === OWNER_ID;
}

// ---- Rate Limit (per user) ----
function checkRateLimit(user) {
  const now = Date.now();
  const rl = user.rl || { windowStart: 0, count: 0 };

  if (!rl.windowStart || now - rl.windowStart > RL_WINDOW_MS) {
    rl.windowStart = now;
    rl.count = 1;
    user.rl = rl;
    return true;
  }

  if (rl.count >= RL_MAX_REQ) {
    user.rl = rl;
    return false;
  }

  rl.count += 1;
  user.rl = rl;
  return true;
}

// ---- HTTP helpers ----
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ---- MCP call ----
async function callAnalyze(code) {
  const url = `${API_BASE_URL}${ANALYZE_PATH}`;
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-teos-bot-key": TEOS_BOT_KEY, // bot bypass on MCP
      },
      body: JSON.stringify({ code, mode: "basic" }),
    },
    15000
  );
}

// ---- Telegram bot ----
const bot = new TelegramBot(TG_TOKEN, {
  polling: {
    autoStart: false,
    params: { timeout: 30 },
  },
});

async function start() {
  // Clear webhook (safe for polling)
  try {
    await bot.setWebHook("");
  } catch (e) {
    console.error("Webhook clear failed:", e?.message || e);
  }

  bot.startPolling();
  console.log("Bot started polling ✅");
}

// ---- Core scan logic ----
async function scanCode(chatId, telegramId, code) {
  const idStr = String(telegramId);
  const { db, user } = await getUser(idStr);

  // Owner bypass: unlimited + no rate limit + no quota
  if (isOwnerId(telegramId)) {
    await bot.sendMessage(chatId, "🔎 Scanning (Founder access)...");
    return await doAnalyzeAndReply(chatId, code, "∞ (Founder)", null);
  }

  // ✅ Rate limit check (THIS is where your snippet belongs)
  if (!checkRateLimit(user)) {
    db.users[idStr] = user;
    await saveDB(db);
    return bot.sendMessage(
      chatId,
      "⛔ Too many requests. Please wait 2 minutes before scanning again."
    );
  }

  // Free tier gate
  if (!user.is_paid && user.scans_used >= FREE_SCANS) {
    db.users[idStr] = user;
    await saveDB(db);

    return bot.sendMessage(
      chatId,
      `⚠️ Free Tier limit reached.\n\n` +
        `💳 Pay-per-scan pricing:\n` +
        `• ${PRICE_SCAN_MIN} → ${PRICE_SCAN_MAX} USDC per scan (depending on tier)\n\n` +
        `Pay to:\n${PAY_TO}\n\n` +
        `Type /pricing to see tiers.\n` +
        `Type /pay for payment instructions.`
    );
  }

  await bot.sendMessage(chatId, "🔎 Scanning...");

  const ok = await doAnalyzeAndReply(chatId, code, null, user);

  // increment quota only if analyze succeeded & user not paid
  if (ok && !user.is_paid) {
    user.scans_used = (user.scans_used || 0) + 1;
    db.users[idStr] = user;
    await saveDB(db);
  } else {
    // still persist rate-limit window changes
    db.users[idStr] = user;
    await saveDB(db);
  }
}

async function doAnalyzeAndReply(chatId, code, forcedScansLeftText = null, user = null) {
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
      "❌ API returned 402 (Payment Required).\n" +
        "Fix TEOS MCP: allow x-teos-bot-key bypass for bot requests."
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
  const reason =
    data?.result?.reason ||
    data?.result?.summary ||
    (data?.result?.findings?.length ? `Found ${data.result.findings.length} issue(s).` : "No details provided.");

  const leftNow =
    forcedScansLeftText ??
    (user ? scansLeft(user) : "—");

  // Emoji map
  const decisionEmoji = decision === "ALLOW" ? "✅" : decision === "WARN" ? "⚠️" : "⛔";
  const riskEmoji = risk?.toLowerCase() === "critical" ? "🚨" : risk?.toLowerCase() === "high" ? "⚠️" : "🧠";

  await bot.sendMessage(
    chatId,
    `${decisionEmoji} Decision: ${decision}\n` +
      `${riskEmoji} Risk: ${String(risk).toUpperCase()}\n` +
      `🧾 Reason: ${String(reason).slice(0, 700)}\n` +
      `🎁 Scans left: ${leftNow}\n\n` +
      `Powered by TEOS MCP:\n${API_BASE_URL}`
  );

  return true;
}

// ---- Commands ----
bot.onText(/^\/start$/, async (msg) => {
  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
`🏺 TEOS MCP — Agent Code Risk Scanner (Free Tier)

Protect autonomous systems before they deploy.

Detect:
• Prompt injection
• Secret leaks
• Unsafe eval()
• Agent autonomy risks
• Tool misuse patterns

🎁 Free Tier: ${FREE_SCANS} scans per account (lifetime)
Remaining: ${scansLeft(user)}

How to use:
1) Paste code snippet OR /scan <code>
2) Receive decision + risk
3) Fix before production

Type /help for full guide.`
  );
});

bot.onText(/^\/help$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
`🧠 How To Use TEOS MCP (Telegram)

✅ Fast scan:
  /scan <your code>

✅ Or paste code directly (no /)

Examples:
  /scan eval(userInput)
  paste: import { exec } from "child_process";

Commands:
/start   - Start bot
/help    - Usage guide
/scan    - Scan code
/ping    - Check API status
/balance - View Free Tier usage
/pricing - View tiers
/pay     - Payment instructions`
  );
});

bot.onText(/^\/pricing$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
`💳 Pricing (Pay-per-scan)

Free Tier:
• ${FREE_SCANS} scans per account (lifetime)

After Free Tier:
• ${PRICE_SCAN_MIN} → ${PRICE_SCAN_MAX} USDC per scan (depending on tier / mode)

Pay to:
${PAY_TO}

Note: Monthly/Yearly subscriptions are available on the main TEOS platform (TeosPump/TeosMcp).`
  );
});

bot.onText(/^\/balance$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    await bot.sendMessage(
      msg.chat.id,
      `📊 Status\nAccess: FOUNDER\nScans used: ∞\nScans left: ∞`
    );
    return;
  }

  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
    `📊 Status\nFree Tier used: ${user.scans_used}/${FREE_SCANS}\nScans left: ${scansLeft(user)}`
  );
});

bot.onText(/^\/pay$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    await bot.sendMessage(msg.chat.id, "Founder access — no payment required.");
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    `💳 Payment Instructions\n\n` +
      `Send ${PRICE_SCAN_MIN} USDC (or more based on tier) to:\n` +
      `${PAY_TO}\n\n` +
      `Then use /pricing to choose your tier.\n` +
      `Auto-verification can be added next.`
  );
});

bot.onText(/^\/ping$/, async (msg) => {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/health`, { method: "GET" }, 8000);
    const txt = await res.text().catch(() => "");
    await bot.sendMessage(msg.chat.id, `✅ API ping: ${res.status}\n${txt.slice(0, 300)}`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ API ping failed: ${String(e?.message || e)}`);
  }
});

// /scan <code>
bot.onText(/^\/scan(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const code = (match?.[1] || "").trim();
  if (!code) {
    await bot.sendMessage(msg.chat.id, "Send like this:\n/scan eval(userInput)");
    return;
  }
  await scanCode(msg.chat.id, msg.from.id, code);
});

// Default: scan any non-command text
bot.on("message", async (msg) => {
  const text = msg.text || "";
  if (!text) return;
  if (text.startsWith("/")) return;
  await scanCode(msg.chat.id, msg.from.id, text);
});

// Polling errors
bot.on("polling_error", (e) => {
  console.error("Polling error:", e?.message || e);
});

// Safety: don't die silently
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

start().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
