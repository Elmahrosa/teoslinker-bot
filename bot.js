 import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import crypto from "crypto";

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL; // example: https://app.teosegypt.com
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const PAY_TO = process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
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
    is_paid INTEGER NOT NULL DEFAULT 0,
    paid_until TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    payment_id TEXT PRIMARY KEY,
    telegram_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    created_at TEXT NOT NULL
  );
`);

const getUser = db.prepare("SELECT * FROM users WHERE telegram_id = ?");
const createUser = db.prepare("INSERT OR IGNORE INTO users (telegram_id) VALUES (?)");
const incScans = db.prepare("UPDATE users SET scans_used = scans_used + 1 WHERE telegram_id = ?");
const markPaid = db.prepare("UPDATE users SET is_paid = 1 WHERE telegram_id = ?");
const createPayment = db.prepare(`
  INSERT INTO payments (payment_id, telegram_id, amount, status, created_at)
  VALUES (?, ?, ?, 'pending', ?)
`);
const attachTx = db.prepare("UPDATE payments SET tx_hash=?, status='submitted' WHERE payment_id=?");

function ensureUser(id) {
  createUser.run(id);
  return getUser.get(id);
}

function scansLeft(u) {
  if (u.is_paid) return "∞";
  return Math.max(0, 5 - (u.scans_used || 0));
}

// ---- API call (trusted) ----
async function callAnalyze(code) {
  return fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-teos-bot-key": TEOS_BOT_KEY
    },
    body: JSON.stringify({ code, mode: "basic" })
  });
}

async function doScan(chatId, userId, code) {
  const u = ensureUser(userId);

  if (!u.is_paid && (u.scans_used || 0) >= 5) {
    await bot.sendMessage(
      chatId,
      `⚠️ Free limit reached.\n\nUnlock unlimited scans:\n💳 ${PRICE_BASIC} USDC\n📍 Pay to: ${PAY_TO}\n\nUse /pay to get a Payment ID.`,
    );
    return;
  }

  const res = await callAnalyze(code);

  if (res.status === 402) {
    await bot.sendMessage(chatId, "❌ API still returns 402. Check TEOS_BOT_KEY env on both services.");
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await bot.sendMessage(chatId, `❌ API error (${res.status}). ${text.slice(0, 300)}`);
    return;
  }

  const data = await res.json();

  if (!u.is_paid) incScans.run(userId);

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
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  const u = ensureUser(userId);

  await bot.sendMessage(
    chatId,
    `🏺 TEOS Risk Analyzer\n\nSend code here and I will scan it.\n\n🎁 Free scans: 5 total\nRemaining: ${scansLeft(u)}\n\nCommands:\n/balance\n/pay\n/help`
  );
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `How to use:\n1) Paste code (any message)\n2) I scan it and show risks\n3) After 5 scans → /pay\n\nCommands:\n/balance\n/pay\n/paid <paymentId> <txHash>`
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

bot.onText(/\/pay/, async (msg) => {
  const userId = msg.from?.id;
  if (!userId) return;

  ensureUser(userId);

  const paymentId = crypto.randomBytes(6).toString("hex");
  createPayment.run(paymentId, userId, PRICE_BASIC, new Date().toISOString());

  await bot.sendMessage(
    msg.chat.id,
    `💳 Payment Info\n\nAmount: ${PRICE_BASIC} USDC\nPay to: ${PAY_TO}\nPayment ID: ${paymentId}\n\nAfter payment send:\n/paid ${paymentId} 0xYOUR_TX_HASH\n\n(Phase 1: manual verification)`
  );
});

// Phase 1 manual: user submits tx, you verify and then you can markPaid in DB later
bot.onText(/\/paid\s+([a-f0-9]+)\s+(0x[a-fA-F0-9]{64})/, async (msg, match) => {
  const userId = msg.from?.id;
  if (!userId) return;

  const paymentId = match?.[1];
  const txHash = match?.[2];

  attachTx.run(txHash, paymentId);

  await bot.sendMessage(
    msg.chat.id,
    `✅ Received.\nPayment ID: ${paymentId}\nTxHash: ${txHash}\n\nI will verify and unlock you.`
  );
});

// Default behavior: scan any normal message
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  try {
    await doScan(chatId, userId, msg.text);
  } catch (e) {
    console.error(e);
    await bot.sendMessage(chatId, "Server error. Try again.");
  }
});

bot.on("polling_error", (e) => console.error("Polling error:", e.message));
