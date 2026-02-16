import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import http from "http";

const token = process.env.TG_TOKEN;
const PORT = process.env.PORT || 8000;

if (!token) {
  console.error("Telegram token missing!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

/* ===== HEALTH SERVER FOR KOYEB ===== */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot running");
}).listen(PORT, () => {
  console.log("Health server running on port", PORT);
});
/* ==================================== */

const freeUsage = {};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `
🏺 TEOS Risk Analyzer

🔍 Analyze your code before execution.
🎁 You get 5 FREE scans.

Send your code now.
  `);
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  if (!freeUsage[userId]) freeUsage[userId] = 0;

  if (freeUsage[userId] >= 5) {
    return bot.sendMessage(msg.chat.id, `
⚠️ Free limit reached.

Pay 0.25 USDC on Base:
0x6CB857A62f6a55239D67C6bD1A8ed5671605566D
    `);
  }

  try {
    const response = await fetch("https://app.teosegypt.com/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: msg.text,
        mode: "basic"
      })
    });

    const data = await response.json();
    freeUsage[userId]++;

    bot.sendMessage(msg.chat.id, `
Decision: ${data.result?.decision || "ERROR"}
Risk: ${data.result?.overallRisk || "Unknown"}

Free scans left: ${5 - freeUsage[userId]}
    `);

  } catch (err) {
    bot.sendMessage(msg.chat.id, "Server error.");
  }
});
