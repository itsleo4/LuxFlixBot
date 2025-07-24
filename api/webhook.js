// api/webhook.js

const TelegramBot = require('node-telegram-bot-api');
const Busboy = require('busboy');
const stream = require('stream');
const path = require('path');

// Firebase Admin SDK setup - THIS IS CRITICAL AND MUST BE AT THE TOP
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // You might need to add your databaseURL if using Realtime Database
            // databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com" // Uncomment and set if needed
        });
        console.log('[INFO] Firebase Admin SDK initialized successfully.');
    } catch (error) {
        console.error('[ERROR] Failed to initialize Firebase Admin SDK:', error.message);
        // If this fails, the function won't be able to interact with Firebase.
        // In a production environment, you might want to throw the error or exit.
    }
}

// Get Firestore instance - THIS IS ALSO CRITICAL
const db = admin.firestore();

// Access the bot token and admin chat ID from Vercel's environment variables
const token = process.env.bottken;
const adminChatId = process.env.adminchatid;

const bot = new TelegramBot(token);

// Function to send a photo to Telegram from a buffer
async function sendPhotoFromBuffer(chatId, photoBuffer, caption, mimeType, filename, reply_markup = {}) {
    let effectiveMimeType = mimeType;
    if (!effectiveMimeType || effectiveMimeType === 'application/octet-stream') {
        const ext = path.extname(filename || '').toLowerCase();
        if (ext === '.png') {
            effectiveMimeType = 'image/png';
        } else if (ext === '.jpg' || ext === '.jpeg') {
            effectiveMimeType = 'image/jpeg';
        } else if (ext === '.gif') {
            effectiveMimeType = 'image/gif';
        } else {
            effectiveMimeType = 'application/octet-stream';
        }
    }

    console.log(`[DEBUG] Sending photo: filename=${filename}, effectiveMimeType=${effectiveMimeType}, bufferLength=${photoBuffer ? photoBuffer.length : 'null'}`);

    const fileOptions = {
        filename: filename || 'payment_proof.png',
        contentType: effectiveMimeType
    };

    try {
        return await bot.sendPhoto(chatId, photoBuffer, { caption: caption, reply_markup: reply_markup }, fileOptions);
    } catch (error) {
        console.error(`[ERROR] Telegram sendPhoto failed:`, error.response ? error.response.body : error.message);
        throw error;
    }
}

// Vercel's specific configuration to ensure raw body is available for busboy
export const config = {
    api: {
        bodyParser: false,
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

                // --- NEW DEBUGGING LOGS FOR COMMANDS ---
                console.log(`[DEBUG_COMMAND] Raw msg.text: "${msg.text}"`);
                const trimmedMessageText = msg.text ? msg.text.trim() : '';
                console.log(`[DEBUG_COMMAND] Trimmed msg.text: "${trimmedMessageText}"`);
                console.log(`[DEBUG_COMMAND] Starts with /free: ${trimmedMessageText.startsWith('/free')}`);
                console.log(`[DEBUG_COMMAND] Starts with /pro: ${trimmedMessageText.startsWith('/pro')}`);
                // --- END NEW DEBUGGING LOGS ---

                // --- Handle /free and /pro video upload commands (HIGHEST PRIORITY) ---
                if (trimmedMessageText.startsWith('/free') || trimmedMessageText.startsWith('/pro')) {
                    const lines = trimmedMessageText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    let title = '';
                    let embedCode = '';
                    let thumbnailUrl = '';
                    const videoType = trimmedMessageText.startsWith('/free') ? 'free' : 'pro';

                    const contentLines = lines.slice(1); 

                    for (const line of contentLines) {
                        if (line.toLowerCase().startsWith('title:')) {
                            title = line.substring('title:'.length).trim();
                        } else if (line.toLowerCase().startsWith('video:')) {
                            embedCode = line.substring('video:'.length).trim();
                        } else if (line.toLowerCase().startsWith('thumb:')) {
                            thumbnailUrl = line.substring('thumb:'.length).trim();
                        }
                    }

                    if (title && embedCode && thumbnailUrl) {
                        try {
                            await db.collection('videos').add({
                                title,
                                embedCode,
                                thumbnailUrl,
                                type: videoType,
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });
                            await bot.sendMessage(chatId, `Video "${title}" (${videoType}) uploaded successfully!`);
                            console.log(`[SUCCESS] Video uploaded: ${title} (${videoType})`);
                        } catch (error) {
                            console.error(`[ERROR] Failed to upload video to Firestore:`, error.message);
                            await bot.sendMessage(chatId, `Failed to upload video: ${error.message}`);
                        }
                    } else {
                        await bot.sendMessage(chatId, 'Please provide title, video embed code, and thumbnail URL in the format:\n\n/free (or /pro)\ntitle: Your Video Title\nvideo: <iframe src="..."></iframe>\nthumb: https://example.com/thumbnail.jpg');
                    }
                } 
                // --- Existing Telegram general message handling (if not a video command) ---
                else if (msg.text || msg.photo) {
                    let messageToAdmin = `--- New Message from Telegram User ---\n`;
                    messageToAdmin += `User: ${userName} (Name: ${firstName} ${lastName})\n`;

                    if (msg.text) {
                        messageToAdmin += `Message: "${msg.text}"`;
                        try {
                            await bot.sendMessage(adminChatId, messageToAdmin);
                            console.log(`[SUCCESS] Telegram general text message processed from ${userName} in chat ${chatId}`);
                        } catch (error) {
                            console.error(`[ERROR] Telegram general text message error from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message);
                        }
                    } else if (msg.photo) {
                        const fileId = msg.photo[msg.photo.length - 1].file_id;
                        const caption = msg.caption ? `\nCaption: "${msg.caption}"` : '';
                        messageToAdmin += ` (Photo Message)${caption}`;

                        try {
                            await bot.sendPhoto(adminChatId, fileId, { caption: messageToAdmin });
                            console.log(`[SUCCESS] Telegram general photo message processed from ${userName} in chat ${chatId}`);
                        } catch (error) {
                            console.error(`[ERROR] Telegram general photo message error from ${userName} in chat ${chatId}:`, error.response ? error.response.body : error.message);
                        }
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
                    try {
                        await admin.auth().setCustomUserClaims(uid, { isPro: true, membershipPlan: plan });
                        responseMessage += `\nUser ${uid} marked as PRO in Firebase.`;
                        console.log(`[SUCCESS] User ${uid} set as PRO with plan ${plan}`);
                    } catch (error) {
                        responseMessage += `\n[ERROR] Failed to set PRO claim for user ${uid}: ${error.message}`;
                        console.error(`[ERROR] Failed to set PRO claim for user ${uid}:`, error.message);
                    }
                } else if (action === 'REJECT') {
                    responseMessage = `❌ Rejected membership for UID: ${uid} (Plan: ${plan})`;
                    try {
                        await admin.auth().setCustomUserClaims(uid, { isPro: false, membershipPlan: null });
                        responseMessage += `\nUser ${uid} marked as NON-PRO in Firebase.`;
                        console.log(`[SUCCESS] User ${uid} set as NON-PRO`);
                    } catch (error) {
                        responseMessage += `\n[ERROR] Failed to remove PRO claim for user ${uid}: ${error.message}`;
                        console.error(`[ERROR] Failed to remove PRO claim for user ${uid}:`, error.message);
                    }
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

        const busboyPromise = new Promise((resolve, reject) => {
            busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
                originalFilename = String(filename);
                fileMimeType = String(mimetype);

                console.log(`[INFO] File received: ${fieldname} - Filename: "${originalFilename}" (MimeType: ${fileMimeType})`);
                
                const chunks = [];
                file.on('data', chunk => chunks.push(chunk));
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                    console.log(`[DEBUG] File buffer collected. Length: ${fileBuffer.length} bytes.`);
                });
                file.on('error', reject);
            });

            busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
                console.log(`[INFO] Field received: ${fieldname} = ${val}`);
                fields[fieldname] = val;
            });

            busboy.on('finish', resolve);
            busboy.on('error', reject);
        });

        req.pipe(busboy);

        try {
            await busboyPromise;
            console.log('[INFO] Busboy finished parsing form data (after awaiting promise).');

            const { name, refID, user_firebase_uid, user_email, membership_plan, payment_method, selected_price, selected_currency } = fields;

            let messageToAdmin = `--- New Payment Proof from Website ---\n`;
            messageToAdmin += `User Name: ${name || 'N/A'}\n`;
            messageToAdmin += `Firebase UID: ${user_firebase_uid || 'N/A'}\n`;
            messageToAdmin += `Firebase Email: ${user_email || 'N/A'}\n`;
            messageToAdmin += `Membership Plan: ${membership_plan || 'N/A'}\n`;
            messageToAdmin += `Payment Method: ${payment_method || 'N/A'}\n`;
            messageToAdmin += `Amount Paid: ${selected_currency || 'N/A'} ${selected_price || 'N/A'}\n`;
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

            console.log(`[DEBUG] Attempting to send photo. fileBuffer exists: ${!!fileBuffer}, fileMimeType: "${fileMimeType}", originalFilename: "${originalFilename}"`);

            if (fileBuffer && fileMimeType && fileBuffer.length > 0) {
                await sendPhotoFromBuffer(adminChatId, fileBuffer, messageToAdmin, fileMimeType, originalFilename, inlineKeyboard);
                console.log(`[SUCCESS] Website payment proof (photo with buttons) sent to admin for UID: ${user_firebase_uid}`);
            } else {
                messageToAdmin += `\n(Note: Screenshot not received or could not be processed. Buffer empty or mimetype missing.)`;
                await bot.sendMessage(adminChatId, messageToAdmin, { reply_markup: inlineKeyboard });
                console.log(`[SUCCESS] Website payment proof (text-only with buttons) sent to admin for UID: ${user_firebase_uid} (Screenshot missing)`);
            }

            res.status(200).json({ success: true, message: 'Payment proof received and forwarded.' });
        } catch (error) {
            console.error(`[ERROR] Failed to process payment proof from website for UID ${fields.user_firebase_uid || 'N/A'}:`, error.message, error.stack);
            res.status(500).json({ success: false, message: 'Failed to process payment proof.' });
        }
    }
    // --- Handle other methods (e.g., GET requests to the root webhook URL) ---
    else {
        res.status(405).send('Method Not Allowed');
    }
};