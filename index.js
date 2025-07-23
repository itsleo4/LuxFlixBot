import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const adminId = process.env.ADMIN_CHAT_ID;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome to LuxFlix 🔥\nPlease send your payment proof (screenshot or text) here.");
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || '';
  const isPaymentProof = msg.photo || messageText.toLowerCase().includes("paid");

  // Skip bot's own start message
  if (msg.text === '/start') return;

  if (isPaymentProof) {
    bot.forwardMessage(adminId, chatId, msg.message_id);
    bot.sendMessage(chatId, "✅ Payment proof received!\nPlease wait for admin approval.");
  }
});