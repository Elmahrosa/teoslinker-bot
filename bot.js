import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs/promises";

const TG_TOKEN = process.env.TG_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;
const TEOS_BOT_KEY = process.env.TEOS_BOT_KEY;

const PAY_TO =
  process.env.PAY_TO || "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const PRICE_BASIC = Number(process.env.PRICE_BASIC || "0.25");

if (!TG_TOKEN) throw new Error("Missing TG_TOKEN");
if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");
if (!TEOS_BOT_KEY) throw new Error("Missing TEOS_BOT_KEY");

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

// ---- MCP call (trusted bypass header) ----
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

// ---- Start bot (polling + webhook clear) ----
const bot = new TelegramBot(TG_TOKEN, {
  polling: {
    autoStart: false,
    params: { timeout: 30 },
  },
});

async function start() {
  // Clear webhook (compatible with older node-telegram-bot-api builds)
  try {
    await bot.setWebHook("");
  } catch (e) {
    console.error("Webhook clear failed:", e?.message || e);
  }

  // Start polling
  bot.startPolling();
  console.log("Bot started polling ✅");
}

async function scanCode(chatId, telegramId, code) {
  const { db, user } = await getUser(String(telegramId));

  if (!user.is_paid && user.scans_used >= 5) {
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
    await bot.sendMessage(
      chatId,
      `❌ API error ${res.status}\n${txt.slice(0, 200)}`
    );
    return;
  }

  const data = await res.json();

  if (!user.is_paid) {
    user.scans_used = (user.scans_used || 0) + 1;
    db.users[String(telegramId)] = user;
    await saveDB(db);
  }

  await bot.sendMessage(
    chatId,
    `✅ Decision: ${data?.result?.decision || "UNKNOWN"}\n` +
      `⚠️ Risk: ${data?.result?.overallRisk || "Unknown"}\n` +
      `🎁 Scans left: ${scansLeft(user)}`
  );
}

// ---- Commands ----
bot.onText(/\/start/, async (msg) => {
  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
    `🏺 TEOS Risk Analyzer\n\nSend code here and I will scan it.\n\n🎁 Free scans: 5 total\nRemaining: ${scansLeft(user)}\n\nCommands:\n/balance\n/pay\n/help`
  );
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🧭 How to use:\n1) Send code as a message\n2) I return risk decision\n3) After 5 scans → /pay\n\nCommands:\n/balance\n/pay`
  );
});

bot.onText(/\/balance/, async (msg) => {
  const { user } = await getUser(String(msg.from.id));
  await bot.sendMessage(
    msg.chat.id,
    `📊 Status\nPaid: ${user.is_paid ? "YES" : "NO"}\nScans used: ${
      user.scans_used
    }\nScans left: ${scansLeft(user)}`
  );
});

bot.onText(/\/pay/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `💳 Payment\n\nSend ${PRICE_BASIC} USDC to:\n${PAY_TO}\n\nAfter payment we will enable unlimited scans (auto verification comes next).`
  );
});

// Default: scan any non-command message
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  try {
    await scanCode(msg.chat.id, msg.from.id, msg.text);
  } catch (e) {
    console.error(e);
    await bot.sendMessage(msg.chat.id, "Server error. Try again.");
  }
});

// Handle polling errors (409 etc.)
bot.on("polling_error", async (e) => {
  console.error("Polling error:", e?.message || e);

  if (String(e?.message || "").includes("409")) {
    // conflict happens if another instance is polling
    try {
      await bot.stopPolling();
    } catch {}

    setTimeout(() => {
      bot.startPolling();
    }, 5000);
  }
});

start().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
