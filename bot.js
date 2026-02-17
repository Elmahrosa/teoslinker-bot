import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";
// Load environment variables from .env file for local development
import 'dotenv/config';

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL; // example: https://app.teosegypt.com
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_BASIC = Number(process.env.PRICE_BASIC || "0.25");

// Founder/admin bypass ID (set this in Koyeb / env)
const OWNER_ID = Number(process.env.TEOS_OWNER_ID || "0");

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

console.log("BOT VERSION 1.0.1 LOADED ✅");
console.log("OWNER_ID:", OWNER_ID || "not set");

// ---- Simple persistent store (JSON file) ----
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

// ---- Owner helper ----
// REMOVED TypeScript types from arguments
function isOwnerMsg(msg) {
  return OWNER_ID && msg?.from?.id === OWNER_ID;
}
function isOwnerId(telegramId) {
  return OWNER_ID && Number(telegramId) === OWNER_ID;
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

// ---- MCP call (trusted bypass header) ----
// IMPORTANT: confirm your real analyze path. If your API expects /api/v1/analyze, change ANALYZE_PATH.
const ANALYZE_PATH = "/analyze"; // change to "/api/v1/analyze" if needed
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

// ---- Start bot (polling + webhook clear) ----
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
async function scanCode(chatId, telegramId, code, msgObj = null) {
  const { db, user } = await getUser(String(telegramId));

  // Owner bypass: skip free-limit gate and do not increment scans
  if (isOwnerId(telegramId)) {
    await bot.sendMessage(chatId, "🔎 Scanning (Founder bypass)...");
    let res;
    try {
      res = await callAnalyze(code);
    } catch (e) {
      await bot.sendMessage(chatId, `❌ API timeout/offline.\n${String(e?.message || e)}`);
      return;
    }

    if (res.status === 402) {
      await bot.sendMessage(
        chatId,
        "❌ API returned 402 (Payment Required).\nFix TEOSMCP: allow x-teos-bot-key bypass OR disable requirePayment for bot."
      );
      return;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
      return;
    }

    const data = await res.json().catch(() => ({}));
    await bot.sendMessage(
      chatId,
      `✅ Decision: ${data?.result?.decision || "UNKNOWN"}\n` +
        `⚠️ Risk: ${data?.result?.overallRisk || "Unknown"}\n` +
        `🎁 Scans left: ∞ (Founder)`
    );
    return;
  }

  // Free limit gate for normal users
  if (!user.is_paid && user.scans_used >= 5) {
    await bot.sendMessage(
      chatId,
      `⚠️ Free limit reached.\n\n💳 Unlock unlimited scans:\nAmount: ${PRICE_BASIC} USDC\nPay to: ${PAY_TO}\n\nUse /pay`
    );
    return;
  }

  await bot.sendMessage(chatId, "🔎 Scanning...");

  let res;
  try {
    res = await callAnalyze(code);
  } catch (e) {
    await bot.sendMessage(chatId, `❌ API timeout/offline.\n${String(e?.message || e)}`);
    return;
  }

  if (res.status === 402) {
    // this means MCP did NOT accept the bot key bypass
    await bot.sendMessage(
      chatId,
      "❌ API returned 402 (Payment Required).\nFix TEOSMCP: allow x-teos-bot-key bypass OR disable requirePayment for bot."
    );
    return;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    await bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 400)}`);
    return;
  }

  const data = await res.json().catch(() => ({}));

  // increment scans and recompute left
  if (!user.is_paid) {
    user.scans_used = (user.scans_used || 0) + 1;
    db.users[String(telegramId)] = user;
    await saveDB(db);
  }
  const leftNow = scansLeft(user);

  await bot.sendMessage(
    chatId,
    `✅ Decision: ${data?.result?.decision || "UNKNOWN"}\n` +
      `⚠️ Risk: ${data?.result?.overallRisk || "Unknown"}\n` +
      `🎁 Scans left: ${leftNow}`
  );
}

// ---- Commands ----
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
  // Owner sees infinite
  if (isOwnerMsg(msg)) {
    await bot.sendMessage(msg.chat.id, `📊 Status\nPaid: YES\nScans used: ∞\nScans left: ∞ (Founder bypass active)`);
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
    `💳 Payment\n\nSend ${PRICE_BASIC} USDC to:\n${PAY_TO}\n\nAfter payment we will enable unlimited scans (auto verification comes next).`
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

// /scan <code> (supports single-line)
bot.onText(/^\/scan(?:\s+([\s\S]+))?$/m, async (msg, match) => {
  const code = (match?.[1] || "").trim();
  if (!code) {
    await bot.sendMessage(msg.chat.id, "Send like this:\n/scan eval(userInput)");
    return;
  }
  await scanCode(msg.chat.id, msg.from.id, code, msg);
});

// Default: scan any non-command text
bot.on("message", async (msg) => {
  const text = msg.text || "";
  if (!text) return;
  if (text.startsWith("/")) return;

  await scanCode(msg.chat.id, msg.from.id, text, msg);
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
