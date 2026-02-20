 import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";
import "dotenv/config";

/**
 * =========================
 * ENV
 * =========================
 * Required:
 * - TG_TOKEN
 * - API_BASE_URL        (example: https://app.teosegypt.com)
 * - TEOS_BOT_KEY        (shared secret that MCP accepts via x-teos-bot-key)
 *
 * Optional:
 * - ANALYZE_PATH        (default: /analyze)
 * - HEALTH_PATH         (default: /health)
 * - PAY_TO              (default: your wallet)
 * - PRICE_BASIC         (default: 0.25)
 * - TEOS_OWNER_ID       (telegram numeric id to bypass limits)
 * - FREE_SCANS          (default: 5)
 * - RATE_LIMIT_SECONDS  (default: 120)
 */

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const ANALYZE_PATH = process.env.ANALYZE_PATH || "/analyze";
const HEALTH_PATH = process.env.HEALTH_PATH || "/health";

const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_BASIC = Number(process.env.PRICE_BASIC || "0.25");

const OWNER_ID = Number(process.env.TEOS_OWNER_ID || "0");

const FREE_SCANS = Number(process.env.FREE_SCANS || "5");
const RATE_LIMIT_SECONDS = Number(process.env.RATE_LIMIT_SECONDS || "120");

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

console.log("BOT VERSION 1.1.0 LOADED ✅");
console.log("API_BASE_URL:", API_BASE_URL);
console.log("ANALYZE_PATH:", ANALYZE_PATH);
console.log("OWNER_ID:", OWNER_ID || "not set");
console.log("FREE_SCANS:", FREE_SCANS);
console.log("RATE_LIMIT_SECONDS:", RATE_LIMIT_SECONDS);

/**
 * =========================
 * STORAGE (JSON)
 * =========================
 * data.json structure:
 * { users: { [telegramId]: { scans_used: number, is_paid: boolean, last_scan_ts?: number } } }
 *
 * NOTE: On Koyeb, filesystem can reset after redeploy.
 * For production, attach a Volume later. For now it's OK for MVP.
 */
const DB_FILE = "./data.json";

async function loadDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

async function saveDB(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

async function getUser(telegramId) {
  const db = await loadDB();
  if (!db.users[telegramId]) {
    db.users[telegramId] = { scans_used: 0, is_paid: false, last_scan_ts: 0 };
    await saveDB(db);
  }
  return { db, user: db.users[telegramId] };
}

function scansLeft(user) {
  if (user.is_paid) return "∞";
  const left = Math.max(0, FREE_SCANS - (user.scans_used || 0));
  return String(left);
}

/**
 * =========================
 * OWNER HELPERS
 * =========================
 */
function isOwnerId(telegramId) {
  return OWNER_ID && Number(telegramId) === OWNER_ID;
}
function isOwnerMsg(msg) {
  return OWNER_ID && msg?.from?.id === OWNER_ID;
}

/**
 * =========================
 * RATE LIMIT (2 minutes default)
 * =========================
 * Uses per-user last_scan_ts stored in data.json
 */
async function checkRateLimit(telegramId) {
  // Owner bypass
  if (isOwnerId(telegramId)) return { ok: true, waitSeconds: 0 };

  const { db, user } = await getUser(String(telegramId));
  const now = Date.now();
  const last = Number(user.last_scan_ts || 0);

  const elapsed = Math.floor((now - last) / 1000);
  if (last && elapsed < RATE_LIMIT_SECONDS) {
    return { ok: false, waitSeconds: RATE_LIMIT_SECONDS - elapsed };
  }

  user.last_scan_ts = now;
  db.users[String(telegramId)] = user;
  await saveDB(db);

  return { ok: true, waitSeconds: 0 };
}

/**
 * =========================
 * HTTP HELPERS
 * =========================
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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
      body: JSON.stringify({ code, mode: "basic" }),
    },
    15000
  );
}

/**
 * =========================
 * BOT INIT
 * =========================
 */
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

/**
 * =========================
 * CORE SCAN LOGIC
 * =========================
 */
async function scanCode(chatId, telegramId, code) {
  // 1) Rate limit (per user)
  const rl = await checkRateLimit(telegramId);
  if (!rl.ok) {
    const mins = Math.ceil(rl.waitSeconds / 60);
    return bot.sendMessage(
      chatId,
      `⛔ Too many requests.\nPlease wait ${mins} minute(s) before scanning again.`
    );
  }

  // 2) Load user
  const { db, user } = await getUser(String(telegramId));

  // 3) Owner bypass (no scan count + ignores free limit)
  if (isOwnerId(telegramId)) {
    await bot.sendMessage(chatId, "🔎 Scanning (Founder bypass)...");
    let res;

    try {
      res = await callAnalyze(code);
    } catch (e) {
      return bot.sendMessage(
        chatId,
        `❌ API timeout/offline.\n${String(e?.message || e)}`
      );
    }

    if (res.status === 402) {
      return bot.sendMessage(
        chatId,
        "❌ API returned 402 (Payment Required).\nFix MCP: allow x-teos-bot-key bypass for bot."
      );
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
    }

    const data = await res.json().catch(() => ({}));
    const decision = data?.result?.decision || "UNKNOWN";
    const risk = data?.result?.overallRisk || "Unknown";
    const reason = data?.result?.reason || data?.result?.summary || "";

    return bot.sendMessage(
      chatId,
      `✅ Decision: ${decision}\n` +
        `⚠️ Risk: ${risk}\n` +
        (reason ? `🧠 Reason: ${String(reason).slice(0, 500)}\n` : "") +
        `🎁 Scans left: ∞ (Founder)`
    );
  }

  // 4) Free limit gate
  if (!user.is_paid && (user.scans_used || 0) >= FREE_SCANS) {
    return bot.sendMessage(
      chatId,
      `⚠️ Free limit reached.\n\n💳 Unlock unlimited scans:\n` +
        `Amount: ${PRICE_BASIC} USDC\n` +
        `Pay to: ${PAY_TO}\n\nUse /pay`
    );
  }

  // 5) Call MCP
  await bot.sendMessage(chatId, "🔎 Scanning...");

  let res;
  try {
    res = await callAnalyze(code);
  } catch (e) {
    return bot.sendMessage(
      chatId,
      `❌ API timeout/offline.\n${String(e?.message || e)}`
    );
  }

  if (res.status === 402) {
    return bot.sendMessage(
      chatId,
      "❌ API returned 402 (Payment Required).\nFix MCP: allow x-teos-bot-key bypass for bot OR disable requirePayment for bot requests."
    );
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
  }

  const data = await res.json().catch(() => ({}));
  const decision = data?.result?.decision || "UNKNOWN";
  const risk = data?.result?.overallRisk || "Unknown";
  const reason = data?.result?.reason || data?.result?.summary || "";

  // 6) Increment scans
  if (!user.is_paid) {
    user.scans_used = (user.scans_used || 0) + 1;
    db.users[String(telegramId)] = user;
    await saveDB(db);
  }

  const leftNow = scansLeft(user);

  return bot.sendMessage(
    chatId,
    `✅ Decision: ${decision}\n` +
      `⚠️ Risk: ${risk}\n` +
      (reason ? `🧠 Reason: ${String(reason).slice(0, 500)}\n` : "") +
      `🎁 Scans left: ${leftNow}\n\n` +
      `Powered by TEOS MCP:\n${API_BASE_URL}`
  );
}

/**
 * =========================
 * COMMANDS
 * =========================
 */
bot.onText(/^\/start$/, async (msg) => {
  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
    `🏺 TEOS MCP — Agent Code Risk Scanner

Protect autonomous systems before they deploy.

⚠️ Detect:
• Prompt injection
• Secret leaks
• Unsafe eval()
• Agent autonomy risks
• Tool misuse patterns

🎁 Free scans: ${FREE_SCANS}
Remaining: ${scansLeft(user)}

📌 How to use:
1) Paste any code snippet OR use /scan <code>
2) Receive risk classification
3) Fix vulnerabilities before production

Type /help for detailed usage guide.`
  );
});

bot.onText(/^\/help$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🧠 How To Use TEOS MCP

✅ Fast scan:
  /scan <your code>

✅ Or paste code directly as a normal message (no /)

Example:
  /scan eval(userInput)

Commands:
/start - Start bot
/help - Usage guide
/scan - Scan code
/ping - Check API status
/balance - View scan usage
/pay - Unlock unlimited scans`
  );
});

bot.onText(/^\/balance$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    return bot.sendMessage(
      msg.chat.id,
      `📊 Status\nPaid: YES\nScans used: ∞\nScans left: ∞ (Founder bypass active)`
    );
  }

  const { user } = await getUser(String(msg.from.id));
  return bot.sendMessage(
    msg.chat.id,
    `📊 Status\nPaid: ${user.is_paid ? "YES" : "NO"}\nScans used: ${
      user.scans_used || 0
    }\nScans left: ${scansLeft(user)}`
  );
});

bot.onText(/^\/pay$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    return bot.sendMessage(msg.chat.id, "Founder bypass active — no payment required.");
  }

  return bot.sendMessage(
    msg.chat.id,
    `💳 Payment

Send ${PRICE_BASIC} USDC to:
${PAY_TO}

After payment we will enable unlimited scans (auto verification comes next).`
  );
});

bot.onText(/^\/ping$/, async (msg) => {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}${HEALTH_PATH}`,
      { method: "GET" },
      8000
    );
    const txt = await res.text().catch(() => "");
    return bot.sendMessage(msg.chat.id, `✅ API ping: ${res.status}\n${txt.slice(0, 500)}`);
  } catch (e) {
    return bot.sendMessage(msg.chat.id, `❌ API ping failed: ${String(e?.message || e)}`);
  }
});

// /scan <code> (supports multiline)
bot.onText(/^\/scan(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const code = (match?.[1] || "").trim();
  if (!code) {
    return bot.sendMessage(msg.chat.id, "Send like this:\n/scan eval(userInput)");
  }
  return scanCode(msg.chat.id, msg.from.id, code);
});

// Default: scan any non-command text
bot.on("message", async (msg) => {
  const text = msg.text || "";
  if (!text) return;
  if (text.startsWith("/")) return; // commands handled above
  return scanCode(msg.chat.id, msg.from.id, text);
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