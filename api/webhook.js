// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');
const Busboy = require('busboy'); // For parsing multipart/form-data
const stream = require('stream'); // Node.js stream module

// Access the bot token and admin chat ID from Vercel's environment variables
const token = process.env.bottken;
const adminChatId = process.env.adminchatid;

const bot = new TelegramBot(token);

// Function to send a photo to Telegram from a buffer
async function sendPhotoFromBuffer(chatId, photoBuffer, caption, mimeType) {
    const fileOptions = {
        filename: 'payment_proof.png', // Default filename
        contentType: mimeType || 'image/png' // Use provided mimeType or default
    };
    return bot.sendPhoto(chatId, photoBuffer, { caption: caption }, fileOptions);
}

// Vercel's specific configuration to ensure raw body is available for busboy
// This is critical for multipart/form-data parsing
export const config = {
    api: {
        bodyParser: false, // Disable Vercel's default body parser
    },
};

module.exports = async (req, res) => {
    console.log(`Incoming request method: ${req.method}`);
    console.log(`Incoming request Content-Type: ${req.headers['content-type']}`);

    // --- Handle Telegram Webhook Updates (application/json) ---
    if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].startsWith('application/json')) {
        const { body } = req; // Vercel will parse JSON automatically if bodyParser is not false for this route

        if (body && body.update_id) { // This is a Telegram update
            if (body.message) {
                const msg = body.message;
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                const userName = msg.from.username ? `@${msg.from.username}` : `User ID: ${userId}`;
                const firstName = msg.from.first_name || 'N/A';
                const lastName = msg.from.last_name || 'N/A';

                let messageToAdmin = `LuxFlix Payment Proof from ${userName} (Name: ${firstName} ${lastName})\n`;

                if (msg.text) {
                    messageToAdmin += `User Message: "${msg.text}"`;
                    try {
                        await bot.sendMessage(adminChatId, messageToAdmin);
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.');
                        console.log(`[SUCCESS] Telegram text message processed from ${userName} in chat ${chatId}`);
                    } catch (error) {
                        console.error(`[ERROR] Telegram text message error from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message);
                    }
                } else if (msg.photo) {
                    const fileId = msg.photo[msg.photo.length - 1].file_id;
                    const caption = msg.caption ? `\nCaption: "${msg.caption}"` : '';
                    messageToAdmin += ` (Photo Proof)${caption}`;

                    try {
                        await bot.sendPhoto(adminChatId, fileId, { caption: messageToAdmin });
                        await bot.sendMessage(chatId, 'Thank you for submitting your payment proof! We will verify it soon and update your membership.');
                        console.log(`[SUCCESS] Telegram photo message processed from ${userName} in chat ${chatId}`);
                    } catch (error) {
                        console.error(`[ERROR] Telegram photo message error from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message);
                    }
                }
            } else if (body.callback_query) {
                const callbackQuery = body.callback_query;
                const message = callbackQuery.message;
                const data = callbackQuery.data;

                console.log(`[INFO] Callback query received: ${data}`);
                await bot.answerCallbackQuery(callbackQuery.id);
                await bot.sendMessage(adminChatId, `Admin clicked: ${data}`);
            }
        }
        res.status(200).send('OK');
    }
    // --- Handle Website Form Submissions (multipart/form-data) ---
    else if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
        console.log('[INFO] Received multipart/form-data from website.');

        // Ensure the request is piped to Busboy correctly
        // Vercel's `req` object is already a ReadableStream
        const busboy = Busboy({ headers: req.headers });
        const fields = {};
        let fileBuffer = null;
        let fileMimeType = null;
        let originalFilename = null;

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            console.log(`[INFO] File received: ${fieldname} - ${filename} (${mimetype})`);
            originalFilename = filename;
            fileMimeType = mimetype;
            const chunks = [];
            file.on('data', chunk => chunks.push(chunk));
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
            console.log(`[INFO] Field received: ${fieldname} = ${val}`);
            fields[fieldname] = val;
        });

        busboy.on('finish', async () => {
            console.log('[INFO] Busboy finished parsing form data.');
            const { name, refID, user_firebase_uid, user_email, membership_plan, payment_method } = fields;

            let messageToAdmin = `--- New Payment Proof from Website ---\n`;
            messageToAdmin += `User Name: ${name || 'N/A'}\n`;
            messageToAdmin += `Firebase UID: ${user_firebase_uid || 'N/A'}\n`;
            messageToAdmin += `Firebase Email: ${user_email || 'N/A'}\n`;
            messageToAdmin += `Membership Plan: ${membership_plan || 'N/A'}\n`;
            messageToAdmin += `Payment Method: ${payment_method || 'N/A'}\n`;
            messageToAdmin += `Ref ID / Details: ${refID || 'N/A'}\n`;

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Approve', callback_data: JSON.stringify({ action: 'APPROVE', uid: user_firebase_uid, plan: membership_plan }) },
                        { text: '❌ Reject', callback_data: JSON.stringify({ action: 'REJECT', uid: user_firebase_uid, plan: membership_plan }) }
                    ],
                ]
            };

            try {
                if (fileBuffer && fileMimeType) {
                    // Send photo with caption and buttons
                    await bot.sendPhoto(adminChatId, fileBuffer, {
                        caption: messageToAdmin,
                        reply_markup: inlineKeyboard
                    }, {
                        filename: originalFilename || 'payment_proof.png',
                        contentType: fileMimeType
                    });
                    console.log(`[SUCCESS] Website payment proof (photo) sent to admin for UID: ${user_firebase_uid}`);
                } else {
                    // Send text message with buttons if no photo
                    await bot.sendMessage(adminChatId, messageToAdmin, { reply_markup: inlineKeyboard });
                    console.log(`[SUCCESS] Website payment proof (text-only) sent to admin for UID: ${user_firebase_uid}`);
                }

                // Send success response back to the website
                res.status(200).json({ success: true, message: 'Payment proof received and forwarded.' });
            } catch (error) {
                console.error(`[ERROR] Failed to send payment proof to admin for UID ${user_firebase_uid}:`, error.response ? error.response.body : error.message);
                // Send error response back to the website
                res.status(500).json({ success: false, message: 'Failed to process payment proof.' });
            }
        });

        // Ensure the request stream is piped to busboy
        // Vercel's `req` object is already a ReadableStream, so direct pipe should work.
        req.pipe(busboy);
    }
    // --- Handle other methods (e.g., GET requests to the root webhook URL) ---
    else {
        res.status(405).send('Method Not Allowed');
    }
};