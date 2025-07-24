// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');

// Access the bot token and admin chat ID from Vercel's environment variables
const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

// Create a new bot instance, but WITHOUT polling
// The TelegramBot constructor will still work without the polling option
const bot = new TelegramBot(token);

// This is the Vercel (or serverless function) entry point
// It handles the incoming HTTP POST request from Telegram
module.exports = async (req, res) => {
    // Ensure it's a POST request (Telegram sends POST requests for webhooks)
    if (req.method === 'POST') {
        const { body } = req; // The incoming request body contains the Telegram update

        // Basic check if the body contains a Telegram update
        if (body && body.update_id) {
            // Determine the type of message and process it
            if (body.message) {
                const msg = body.message;
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                const userName = msg.from.username ? `@${msg.from.username}` : `User ID: ${userId}`;
                const firstName = msg.from.first_name || 'N/A';
                const lastName = msg.from.last_name || 'N/A';

                let messageToAdmin = `LuxFlix Payment Proof from ${userName} (Name: ${firstName} ${lastName})\n`;

                // Handle text message
                if (msg.text) {
                    messageToAdmin += `User Message: "${msg.text}"`;
                    try {
                        await bot.sendMessage(adminChatId, messageToAdmin); // Forward to admin
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.'); // Auto-reply to user
                    } catch (error) {
                        console.error('Error handling text message:', error);
                    }
                }
                // Handle photo message
                else if (msg.photo) {
                    const fileId = msg.photo[msg.photo.length - 1].file_id; // Get the highest resolution photo
                    const caption = msg.caption ? `\nCaption: "${msg.caption}"` : '';
                    messageToAdmin += ` (Photo Proof)${caption}`;

                    try {
                        await bot.sendPhoto(adminChatId, fileId, { caption: messageToAdmin }); // Forward photo to admin
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.'); // Auto-reply to user
                    } catch (error) {
                        console.error('Error handling photo message:', error);
                    }
                }
                // You can add more conditions here for other message types (e.g., audio, document) if needed
            }
            // If it's not a message, it could be other update types (e.g., callback query from buttons, which we'll add later)
            // For now, we only care about 'message' updates
        }

        // Important: Respond to Telegram with a 200 OK to acknowledge receipt of the update
        // Without this, Telegram will keep retrying to send the update.
        res.status(200).send('OK');
    } else {
        // If it's not a POST request, respond with Method Not Allowed
        res.status(405).send('Method Not Allowed');
    }
};