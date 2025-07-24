const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config(); // Load environment variables from .env file

// Access the bot token from the environment variables
const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID; // Your admin chat ID

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Listen for the /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Welcome to LuxFlix Payment Support! Please send your payment proof (text and/or photo) here.');
});

// Listen for any incoming message (text or photo)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username ? `@${msg.from.username}` : `User ID: ${userId}`;
    const firstName = msg.from.first_name || 'N/A';
    const lastName = msg.from.last_name || 'N/A';

    let messageToAdmin = `LuxFlix Payment Proof from ${userName} (Name: ${firstName} ${lastName})\n`;

    // Check for text message
    if (msg.text) {
        messageToAdmin += `User Message: "${msg.text}"`;
        // Forward text message to admin
        bot.sendMessage(adminChatId, messageToAdmin);
    }

    // Check for photo message
    if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id; // Get the highest resolution photo
        const caption = msg.caption ? `\nCaption: "${msg.caption}"` : '';
        messageToAdmin += ` (Photo Proof)${caption}`;

        // Forward photo to admin with caption
        bot.sendPhoto(adminChatId, fileId, { caption: messageToAdmin });
    }

    // Auto-reply to the user
    bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.');

    console.log(`Received message from ${userName} in chat ${chatId}`);
});

// Handle errors to prevent the bot from crashing
bot.on('polling_error', (err) => console.error(`Polling error: ${err.code} - ${err.message}`));

console.log('LuxFlix Bot is running locally...');