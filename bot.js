import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import Database from "better-sqlite3";

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

const bot = new TelegramBot(TG_TOKEN, { polling: true });

const db = new Database("bot.db");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  scans_used INTEGER DEFAULT 0,
  is_paid INTEGER DEFAULT 0
);
`);

const getUser = db.prepare("SELECT * FROM users WHERE telegram_id=?");
const createUser = db.prepare("INSERT OR IGNORE INTO users (telegram_id) VALUES (?)");
const incScan = db.prepare("UPDATE users SET scans_used=scans_used+1 WHERE telegram_id=?");

function ensureUser(id) {
  createUser.run(id);
  return getUser.get(id);
}

function scansLeft(u) {
  if (u.is_paid) return "∞";
  return Math.max(0, 5 - (u.scans_used || 0));
}

async function scanCode(chatId, userId, code) {
  const u = ensureUser(userId);

  if (!u.is_paid && u.scans_used >= 5) {
    await bot.sendMessage(chatId,
      "⚠️ Free limit reached.\n\nUnlock unlimited scans for 0.25 USDC.\nUse /pay"
    );
    return;
  }

  const res = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-teos-bot-key": TEOS_BOT_KEY
    },
    body: JSON.stringify({ code, mode: "basic" })
  });

  if (!res.ok) {
    await bot.sendMessage(chatId, `❌ API error ${res.status}`);
    return;
  }

  const data = await res.json();

  if (!u.is_paid) incScan.run(userId);

  const u2 = ensureUser(userId);

  await bot.sendMessage(chatId,
    `✅ Decision: ${data?.result?.decision}\n` +
    `⚠️ Risk: ${data?.result?.overallRisk}\n` +
    `🎁 Scans left: ${scansLeft(u2)}`
  );
}

bot.onText(/\/start/, async (msg) => {
  const u = ensureUser(msg.from.id);
  await bot.sendMessage(msg.chat.id,
    `🏺 TEOS Risk Analyzer\n\nSend code to scan.\nFree scans left: ${scansLeft(u)}`
  );
});

bot.onText(/\/pay/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "💳 Send 0.25 USDC to:\n0x6CB857A62f6a55239D67C6bD1A8ed5671605566D\n\nAfter payment I will unlock you."
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  await scanCode(msg.chat.id, msg.from.id, msg.text);
});
