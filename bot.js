import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";

const token = process.env.TG_TOKEN;
if (!token) {
  console.error("EFATAL: TG_TOKEN is missing. Set TG_TOKEN env var.");
  process.exit(1);
}

const API_BASE_URL = process.env.API_BASE_URL || "https://app.teosegypt.com";

// Polling only (no webhook)
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

  // Avoid counting very short noise
  const codeText = msg.text.trim();
  if (codeText.length < 5) {
    return bot.sendMessage(chatId, "Send a code snippet (at least 5 chars).");
  }

  const used = freeUsage.get(userId) || 0;

  if (used >= 5) {
    return bot.sendMessage(
      chatId,
`⚠️ Free limit reached.

To continue:
Pay 0.25 USDC on Base to:
\`0x6CB857A62f6a55239D67C6bD1A8ed5671605566D\`

Then send your TX hash.`,
      { parse_mode: "Markdown" }
    );
  }

  try {
    const res = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeText, mode: "basic" }),
    });

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    // If API failed, do NOT consume a free scan
    if (!res.ok) {
      const hint = (data?.error || data?.message || raw || "").toString().slice(0, 500);
      return bot.sendMessage(
        chatId,
`❌ Analyze API error (${res.status})

${hint || "No details."}`
      );
    }

    // Consume free scan only on success
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

// Helpful: log polling errors (409/401 show here)
bot.on("polling_error", (err) => {
  console.error("polling_error:", err?.message || err);
});
