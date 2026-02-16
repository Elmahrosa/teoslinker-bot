import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";

const token = process.env.TG_TOKEN;
if (!token) {
  console.error("EFATAL: TG_TOKEN is missing. Set TG_TOKEN env var.");
  process.exit(1);
}

const API_BASE_URL = process.env.API_BASE_URL || "https://app.teosegypt.com";
const bot = new TelegramBot(token, { polling: true });

// In-memory free usage (resets on restart)
const freeUsage = new Map();

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
`🏺 *TEOS Risk Analyzer*

🔍 Analyze your code before execution.
🎁 You get *5 FREE scans*.

Send your code now (paste it as a message).`,
    { parse_mode: "Markdown" }
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  const used = freeUsage.get(userId) || 0;

  if (used >= 5) {
    return bot.sendMessage(
      chatId,
`⚠️ Free limit reached.

To continue:
Pay 0.25 USDC on Base to:
0x6CB857A62f6a55239D67C6bD1A8ed5671605566D

Then send your TX hash.`,
    );
  }

  try {
    const res = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: msg.text, mode: "basic" })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    freeUsage.set(userId, used + 1);

    const decision = data?.result?.decision ?? data?.decision ?? "ERROR";
    const risk = data?.result?.overallRisk ?? data?.overallRisk ?? "Unknown";

    await bot.sendMessage(
      chatId,
`✅ Decision: *${decision}*
⚠️ Risk: *${risk}*
🎁 Free scans left: *${5 - (used + 1)}*`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Analyze error:", e);
    await bot.sendMessage(chatId, "Server error while analyzing. Try again.");
  }
});
