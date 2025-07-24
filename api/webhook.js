// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(token);

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        const { body } = req;

        if (body && body.update_id) {
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
                        await bot.sendMessage(adminChatId, messageToAdmin);
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.');
                        console.log(`[SUCCESS] Text message processed from ${userName} in chat ${chatId}`); // Success log
                    } catch (error) {
                        console.error(`[ERROR] FatalError processing text message from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message); // Detailed error log
                    }
                }
                // Handle photo message
                else if (msg.photo) {
                    const fileId = msg.photo[msg.photo.length - 1].file_id;
                    const caption = msg.caption ? `\nCaption: "${msg.caption}"` : '';
                    messageToAdmin += ` (Photo Proof)${caption}`;

                    try {
                        await bot.sendPhoto(adminChatId, fileId, { caption: messageToAdmin });
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.');
                        console.log(`[SUCCESS] Photo message processed from ${userName} in chat ${chatId}`); // Success log
                    } catch (error) {
                        console.error(`[ERROR] FatalError processing photo message from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message); // Detailed error log
                    }
                }
            }
        }
        res.status(200).send('OK');
    } else {
        res.status(405).send('Method Not Allowed');
    }
};