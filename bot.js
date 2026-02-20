const rateLimits = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 2 * 60 * 1000; // 2 minutes
  const maxRequests = 5;

  if (!rateLimits.has(userId)) {
    rateLimits.set(userId, []);
  }

  const timestamps = rateLimits.get(userId)
    .filter(ts => now - ts < windowMs);

  if (timestamps.length >= maxRequests) {
    return false;
  }

  timestamps.push(now);
  rateLimits.set(userId, timestamps);
  return true;
}
import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";
import "dotenv/config";

/**
 * TEOS Risk Analyzer Bot
 * Telegram thin-client for TEOS MCP
 * - Calls TEOS MCP /analyze
 * - 5 free scans per user
 * - Paid unlock (manual grant for now; auto on-chain verify later)
 */

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL; // e.g. https://app.teosegypt.com
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_BASIC = Number(process.env.PRICE_BASIC || "0.25");

// Admin / Founder Telegram ID (set in env)
const OWNER_ID = Number(process.env.TEOS_OWNER_ID || "0");

// MCP path
const ANALYZE_PATH = process.env.ANALYZE_PATH || "/analyze";

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

console.log("BOT VERSION 1.1.0 LOADED ✅");
console.log("API_BASE_URL:", API_BASE_URL);
console.log("ANALYZE_PATH:", ANALYZE_PATH);
console.log("OWNER_ID:", OWNER_ID || "not set");

// ----------------- Simple persistent store -----------------
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
    db.users[telegramId] = { scans_used: 0, is_paid: false };
    await saveDB(db);
  }
  return { db, user: db.users[telegramId] };
}

function scansLeft(user) {
  if (user.is_paid) return "∞";
  return Math.max(0, 5 - (user.scans_used || 0));
}

function isOwnerMsg(msg) {
  return OWNER_ID && msg?.from?.id === OWNER_ID;
}
function isOwnerId(telegramId) {
  return OWNER_ID && Number(telegramId) === OWNER_ID;
}

// ----------------- HTTP helpers -----------------
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ----------------- MCP call -----------------
async function callAnalyze(code, telegramId) {
  const url = `${API_BASE_URL}${ANALYZE_PATH}`;
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-teos-bot-key": TEOS_BOT_KEY,
        // Optional metadata for logging / rate limiting server-side
        "x-teos-telegram-id": String(telegramId || ""),
      },
      body: JSON.stringify({ code, mode: "basic" }),
    },
    15000
  );
}

// ----------------- Result normalization -----------------
function normalizeRisk(data) {
  return String(data?.result?.overallRisk || "unknown").toLowerCase();
}

function normalizeDecision(data) {
  const direct = String(data?.result?.decision || "").toUpperCase();
  if (direct && direct !== "UNKNOWN") return direct;

  const risk = normalizeRisk(data);
  if (risk === "critical") return "BLOCK";
  if (risk === "high") return "WARN";
  if (risk === "medium") return "REVIEW";
  if (risk === "low" || risk === "info") return "ALLOW";
  return "REVIEW";
}

function pickReason(data) {
  // Try common fields; fallback to categories if present
  const top =
    data?.result?.topFinding ||
    data?.result?.reason ||
    data?.result?.summary ||
    null;

  if (top) return String(top).slice(0, 120);

  const cats = data?.result?.categories || data?.result?.tags || [];
  if (Array.isArray(cats) && cats.length) return `Detected: ${String(cats[0])}`;
  return "Detected risk patterns in code.";
}

function decisionEmoji(decision) {
  if (decision === "BLOCK") return "⛔";
  if (decision === "WARN") return "⚠️";
  if (decision === "REVIEW") return "👀";
  if (decision === "ALLOW") return "✅";
  return "✅";
}

// ----------------- Start bot -----------------
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

// ----------------- Core scan logic -----------------
async function scanCode(chatId, telegramId, code) {
  const { db, user } = await getUser(String(telegramId));

  // Founder bypass: no limit, no increment
  if (isOwnerId(telegramId)) {
    await bot.sendMessage(chatId, "🔎 Scanning (Founder bypass)...");
    return await doAnalyzeAndReply(chatId, telegramId, code, user, db, true);
  }

  // Free limit gate
  if (!user.is_paid && user.scans_used >= 5) {
    await bot.sendMessage(
      chatId,
      `⚠️ Free limit reached.\n\n💳 Unlock unlimited scans on Base:\nAmount: ${PRICE_BASIC} USDC\n\nUse /pay to see payment details.\nIf you already paid, message admin with your TX hash.`
    );
    return;
  }

  await bot.sendMessage(chatId, "🔎 Scanning...");
  await doAnalyzeAndReply(chatId, telegramId, code, user, db, false);
}

async function doAnalyzeAndReply(chatId, telegramId, code, user, db, isFounder) {
  let res;
  try {
    res = await callAnalyze(code, telegramId);
  } catch (e) {
    await bot.sendMessage(
      chatId,
      `❌ API timeout/offline.\n${String(e?.message || e)}`
    );
    return;
  }

  if (res.status === 402) {
    await bot.sendMessage(
      chatId,
      "❌ API returned 402 (Payment Required).\nFix TEOS MCP: allow x-teos-bot-key bypass OR disable requirePayment for bot."
    );
    return;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    await bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
    return;
  }

  const data = await res.json().catch(() => ({}));

  // increment scans if normal user and not paid
  if (!isFounder && !user.is_paid) {
    user.scans_used = (user.scans_used || 0) + 1;
    db.users[String(telegramId)] = user;
    await saveDB(db);
  }

  const decision = normalizeDecision(data);
  const risk = normalizeRisk(data);
  const reason = pickReason(data);

  const leftNow = isFounder ? "∞ (Founder)" : scansLeft(user);

  await bot.sendMessage(
    chatId,
    `${decisionEmoji(decision)} Decision: ${decision}\n` +
      `⚠️ Risk: ${risk.toUpperCase()}\n` +
      `🧠 Reason: ${reason}\n` +
      `🎁 Scans left: ${leftNow}\n\n` +
      `Powered by TEOS MCP: ${API_BASE_URL}`
  );
}

// ----------------- Commands -----------------
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

🎁 Free scans: 5
Remaining: ${scansLeft(user)}

📌 How to use:
1) Paste any code snippet OR use /scan <code>
2) Receive ALLOW / WARN / BLOCK decision
3) Fix risks before production

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
/pay - Payment info
/grant - (Admin) unlock user
`
  );
});

bot.onText(/^\/balance$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    await bot.sendMessage(
      msg.chat.id,
      `📊 Status\nPaid: YES\nScans used: ∞\nScans left: ∞ (Founder bypass active)`
    );
    return;
  }

  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
    `📊 Status\nPaid: ${user.is_paid ? "YES" : "NO"}\nScans used: ${user.scans_used}\nScans left: ${scansLeft(user)}`
  );
});

bot.onText(/^\/pay$/, async (msg) => {
  if (isOwnerMsg(msg)) {
    await bot.sendMessage(msg.chat.id, "Founder bypass active — no payment required.");
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    `💳 Payment (Base / USDC)\n\nSend ${PRICE_BASIC} USDC to:\n${PAY_TO}\n\nAfter payment: send your TX hash to admin to unlock (auto verification coming next).`
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

// Admin manual unlock: /grant <telegramId>
bot.onText(/^\/grant(?:\s+(\d+))?$/m, async (msg, match) => {
  if (!isOwnerMsg(msg)) return;

  const target = (match?.[1] || "").trim();
  if (!target) {
    await bot.sendMessage(msg.chat.id, "Usage: /grant <telegramId>");
    return;
  }

  const { db, user } = await getUser(String(target));
  user.is_paid = true;
  db.users[String(target)] = user;
  await saveDB(db);

  await bot.sendMessage(msg.chat.id, `✅ Granted unlimited scans to user ${target}`);
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

process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

start().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});