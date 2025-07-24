// index.js

import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

// Load environment variables from .env file during local development.
// On Render, these variables are directly accessible from its environment.
dotenv.config();

// Get the bot token from environment variables
const botToken = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_CHAT_ID;

// Basic validation for critical environment variables
if (!botToken) {
    console.error('Error: BOT_TOKEN environment variable is not set.');
    process.exit(1); // Exit the process if token is missing
}
if (!adminId) {
    console.error('Error: ADMIN_CHAT_ID environment variable is not set.');
    process.exit(1); // Exit the process if admin ID is missing
}

// Initialize the bot with long polling
const bot = new TelegramBot(botToken, { polling: true });

console.log('LuxFlixBot is running in Long Polling mode...');
console.log(`Admin ID: ${adminId}`); // For debugging, remove in production if sensitive

// Listen for the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome to LuxFlix 🔥\nPlease send your payment proof (screenshot or text) here.");
});

// Listen for any message
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || '';
  // Check if it's a photo or contains "paid" (case-insensitive)
  const isPaymentProof = msg.photo || messageText.toLowerCase().includes("paid");

  // Skip the bot's own /start message to avoid infinite loops or re-forwarding
  if (msg.text === '/start') {
      return;
  }

  if (isPaymentProof) {
    // Forward the payment proof message to the admin
    // Ensure adminId is correctly parsed as a number if it's coming from an env var as string
    const numericAdminId = parseInt(adminId, 10);
    if (isNaN(numericAdminId)) {
        console.error(`Error: ADMIN_CHAT_ID "${adminId}" is not a valid number.`);
        bot.sendMessage(chatId, "An internal error occurred. Admin ID is misconfigured.");
        return;
    }

    bot.forwardMessage(numericAdminId, chatId, msg.message_id)
        .then(() => {
            bot.sendMessage(chatId, "✅ Payment proof received!\nPlease wait for admin approval.");
            console.log(`Payment proof from ${chatId} forwarded to admin ${numericAdminId}.`);
        })
        .catch(error => {
            console.error(`Error forwarding message from ${chatId} to admin ${numericAdminId}:`, error.message);
            bot.sendMessage(chatId, "Failed to forward your payment proof. Please try again or contact support.");
        });
  } else {
    // Optional: Reply to other messages if you want
    console.log(`Received non-payment message from ${chatId}: "${msg.text || '[No text]'}"`);
    // bot.sendMessage(chatId, "Thank you for your message. I am looking for payment proofs.");
  }
});

// --- Error Handling (Good Practice) ---
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
    // Implement logic to retry or alert if polling fails repeatedly
});

bot.on('error', (error) => {
    console.error('General bot error:', error.code, error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // This is a serious error, usually indicates a bug.
    // For production, you might want to restart the process.
    process.exit(1);
});