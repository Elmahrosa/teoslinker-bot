import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import Database from "better-sqlite3";

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const PAY_TO =
  process.env.PAY_TO ||
  "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_BASIC = Number(process.env.PRICE_BASIC || "0.25");

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

const bot = new TelegramBot(TG_TOKEN, { polling: true });

// ---- DB (persistent free scans) ----
const db = new Database("bot.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    scans_used INTEGER NOT NULL DEFAULT 0,
    is_paid INTEGER NOT NULL DEFAULT 0
  );
`);

const getUser = db.prepare("SELECT * FROM users WHERE telegram_id=?");
const createUser = db.prepare(
  "INSERT OR IGNORE INTO users (telegram_id) VALUES (?)"
);
const incScan = db.prepare(
  "UPDATE users SET scans_used=scans_used+1 WHERE telegram_id=?"
);

function ensureUser(id) {
  createUser.run(id);
  return getUser.get(id);
}

function scansLeft(u) {
  if (u.is_paid) return "∞";
  return Math.max(0, 5 - (u.scans_used || 0));
}

// ---- MCP API call (trusted) ----
async function callAnalyze(code) {
  return fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-teos-bot-key": TEOS_BOT_KEY,
    },
    body: JSON.stringify({ code, mode: "basic" }),
  });
}

async function scanCode(chatId, userId, code) {
  const u = ensureUser(userId);

  if (!u.is_paid && u.scans_used >= 5) {
    await bot.sendMessage(
      chatId,
      `⚠️ Free limit reached.\n\n💳 Unlock unlimited scans:\nAmount: ${PRICE_BASIC} USDC\nPay to: ${PAY_TO}\n\nUse /pay`
    );
    return;
  }

  const res = await callAnalyze(code);

  if (res.status === 402) {
    await bot.sendMessage(
      chatId,
      "❌ API returned 402. Check TEOS_BOT_KEY on BOTH services + redeploy MCP."
    );
    return;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    await bot.sendMessage(chatId, `❌ API error ${res.status}\n${txt.slice(0, 200)}`);
    return;
  }

  const data = await res.json();

  if (!u.is_paid) incScan.run(userId);

  const u2 = ensureUser(userId);
  const decision = data?.result?.decision || "UNKNOWN";
  const risk = data?.result?.overallRisk || "Unknown";

  await bot.sendMessage(
    chatId,
    `✅ Decision: ${decision}\n⚠️ Risk: ${risk}\n🎁 Scans left: ${scansLeft(u2)}`
  );
}

// ---- Commands ----
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from?.id;
  if (!userId) return;

  const u = ensureUser(userId);
  await bot.sendMessage(
    msg.chat.id,
    `🏺 TEOS Risk Analyzer\n\nSend code here and I will scan it.\n\n🎁 Free scans: 5 total\nRemaining: ${scansLeft(u)}\n\nCommands:\n/balance\n/pay\n/help`
  );
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🧭 How to use:\n\n1) Send code as a message\n2) I return risk decision\n3) After 5 scans → /pay\n\nCommands:\n/balance\n/pay`
  );
});

bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from?.id;
  if (!userId) return;

  const u = ensureUser(userId);
  await bot.sendMessage(
    msg.chat.id,
    `📊 Status\nPaid: ${u.is_paid ? "YES" : "NO"}\nScans used: ${u.scans_used}\nScans left: ${scansLeft(u)}`
  );
});

bot.on
