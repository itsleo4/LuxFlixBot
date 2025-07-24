// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');
const Busboy = require('busboy'); // For parsing multipart/form-data
const stream = require('stream'); // Node.js stream module

// Access the bot token and admin chat ID from Vercel's environment variables
const token = process.env.bottken;
const adminChatId = process.env.adminchatid;

const bot = new TelegramBot(token);

// Function to send a photo to Telegram from a buffer
async function sendPhotoFromBuffer(chatId, photoBuffer, caption, mimeType, filename, reply_markup = {}) {
    const fileOptions = {
        filename: filename || 'payment_proof.png',
        contentType: mimeType || 'image/png' // Fallback to image/png if mimetype is undefined
    };
    return bot.sendPhoto(chatId, photoBuffer, { caption: caption, reply_markup: reply_markup }, fileOptions);
}

// Vercel's specific configuration to ensure raw body is available for busboy
export const config = {
    api: {
        bodyParser: false, // Disable Vercel's default body parser
    },
};

module.exports = async (req, res) => {
    // --- CORS Headers ---
    res.setHeader('Access-Control-Allow-Origin', 'https://itsleo4.github.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        console.log('[INFO] Received OPTIONS (CORS preflight) request.');
        res.status(200).end();
        return;
    }

    console.log(`Incoming request method: ${req.method}`);
    console.log(`Incoming request Content-Type: ${req.headers['content-type']}`);

    // --- Handle Telegram Webhook Updates (application/json) ---
    if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].startsWith('application/json')) {
        const { body } = req; 

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

                const parts = data.split('_');
                const action = parts[0];
                const uid = parts[1];
                const plan = parts.length > 2 ? parts.slice(2).join('_') : 'N/A';

                let responseMessage = '';
                if (action === 'APPROVE') {
                    responseMessage = `✅ Approved membership for UID: ${uid} (Plan: ${plan})`;
                    // TODO: Add Firebase Admin SDK logic here to update user's membership
                } else if (action === 'REJECT') {
                    responseMessage = `❌ Rejected membership for UID: ${uid} (Plan: ${plan})`;
                    // TODO: Add Firebase Admin SDK logic here to update user's membership (or notify them)
                } else {
                    responseMessage = `Unknown action: ${action}`;
                }

                await bot.sendMessage(adminChatId, responseMessage);
            }
        }
        res.status(200).send('OK');
    }
    // --- Handle Website Form Submissions (multipart/form-data) ---
    else if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
        console.log('[INFO] Received multipart/form-data from website.');

        const busboy = Busboy({ headers: req.headers });
        const fields = {};
        let fileBuffer = null;
        let fileMimeType = null;
        let originalFilename = null;

        // Use a promise to ensure busboy finishes before proceeding
        const busboyPromise = new Promise((resolve, reject) => {
            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                console.log(`[INFO] File received: ${fieldname} - ${filename} (${mimetype})`);
                originalFilename = filename;
                fileMimeType = mimetype;
                const chunks = [];
                file.on('data', chunk => chunks.push(chunk));
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                });
                file.on('error', reject); // Handle file stream errors
            });

            busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
                console.log(`[INFO] Field received: ${fieldname} = ${val}`);
                fields[fieldname] = val;
            });

            busboy.on('finish', resolve); // Resolve the promise when busboy finishes
            busboy.on('error', reject); // Handle busboy parsing errors
        });

        // Pipe the request to busboy
        req.pipe(busboy);

        try {
            await busboyPromise; // Wait for busboy to finish parsing all fields and files
            console.log('[INFO] Busboy finished parsing form data (after awaiting promise).');

            const { name, refID, user_firebase_uid, user_email, membership_plan, payment_method, selected_price, selected_currency } = fields;

            let messageToAdmin = `--- New Payment Proof from Website ---\n`;
            messageToAdmin += `User Name: ${name || 'N/A'}\n`;
            messageToAdmin += `Firebase UID: ${user_firebase_uid || 'N/A'}\n`;
            messageToAdmin += `Firebase Email: ${user_email || 'N/A'}\n`;
            messageToAdmin += `Membership Plan: ${membership_plan || 'N/A'}\n`;
            messageToAdmin += `Payment Method: ${payment_method || 'N/A'}\n`;
            messageToAdmin += `Amount Paid: ${selected_currency || 'N/A'} ${selected_price || 'N/A'}\n`; // Include amount and currency
            messageToAdmin += `Ref ID / Details: ${refID || 'N/A'}\n`;

            const approveData = `APPROVE_${user_firebase_uid}_${membership_plan}`;
            const rejectData = `REJECT_${user_firebase_uid}_${membership_plan}`;

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Approve', callback_data: approveData },
                        { text: '❌ Reject', callback_data: rejectData }
                    ],
                ]
            };

            if (fileBuffer && fileMimeType) {
                await sendPhotoFromBuffer(adminChatId, fileBuffer, messageToAdmin, fileMimeType, originalFilename, inlineKeyboard);
                console.log(`[SUCCESS] Website payment proof (photo with buttons) sent to admin for UID: ${user_firebase_uid}`);
            } else {
                await bot.sendMessage(adminChatId, messageToAdmin, { reply_markup: inlineKeyboard });
                console.log(`[SUCCESS] Website payment proof (text-only with buttons) sent to admin for UID: ${user_firebase_uid}`);
            }

            res.status(200).json({ success: true, message: 'Payment proof received and forwarded.' });
        } catch (error) {
            console.error(`[ERROR] Failed to process payment proof from website for UID ${user_firebase_uid}:`, error.message, error.stack);
            res.status(500).json({ success: false, message: 'Failed to process payment proof.' });
        }
    }
    // --- Handle other methods (e.g., GET requests to the root webhook URL) ---
    else {
        res.status(405).send('Method Not Allowed');
    }
};