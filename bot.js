import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";

const token = process.env.TG_TOKEN;
if (!token) {
  console.error("EFATAL: TG_TOKEN is missing. Set TG_TOKEN env var.");
  process.exit(1);
}

const API_BASE_URL = (process.env.API_BASE_URL || "https://app.teosegypt.com").replace(/\/+$/, "");
const ANALYZE_PATH = process.env.ANALYZE_PATH || "/analyze"; // لو endpoint مختلف غيّره من env

const bot = new TelegramBot(token, { polling: true });

// In-memory free usage (resets on restart)
const freeUsage = new Map();

const PAY_TO = "0x6CB857A62f6a55239D67C6bD1A8ed5671605566D";
const FREE_LIMIT = 5;

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
`🏺 *TEOS Risk Analyzer*

🔍 Analyze your code before execution.
🎁 You get *${FREE_LIMIT} FREE scans*.

📌 Just paste your code in a message.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
`🧩 *Commands*
/start — Start
/help — Help

📌 Paste code to analyze.

💳 After ${FREE_LIMIT} free scans:
Pay 0.25 USDC on Base to:
\`${PAY_TO}\`
then send TX hash.`,
    { parse_mode: "Markdown" }
  );
});
