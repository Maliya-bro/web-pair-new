
    import express from "express";
    import fs from "fs";
    import pino from "pino";
    import {
        makeWASocket,
        useMultiFileAuthState,
        delay,
        makeCacheableSignalKeyStore,
        Browsers,
        jidNormalizedUser,
        fetchLatestBaileysVersion,
    } from "@whiskeysockets/baileys";
    import QRCode from "qrcode";
    import { saveSessionState } from "./mongodb.js";
    import { setSessionId } from "./session-store.js";

    const router = express.Router();

    function removeFile(FilePath) {
        try {
            if (!fs.existsSync(FilePath)) return false;
            fs.rmSync(FilePath, { recursive: true, force: true });
        } catch (e) {
            console.error("Error removing file:", e);
        }
    }

    router.get("/", async (req, res) => {
        const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const dirs = `./qr_sessions/session_${sessionId}`;

        if (!fs.existsSync("./qr_sessions")) {
            fs.mkdirSync("./qr_sessions", { recursive: true });
        }

        await removeFile(dirs);

        async function initiateSession() {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);

            try {
                const { version } = await fetchLatestBaileysVersion();
                let responseSent = false;

                const KnightBot = makeWASocket({
                    version,
                    auth: {
                        creds: state.creds,
                        keys: makeCacheableSignalKeyStore(
                            state.keys,
                            pino({ level: "fatal" }).child({ level: "fatal" }),
                        ),
                    },
                    printQRInTerminal: false,
                    logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                    browser: Browsers.windows("Chrome"),
                    markOnlineOnConnect: false,
                    generateHighQualityLinkPreview: false,
                    defaultQueryTimeoutMs: 60000,
                    connectTimeoutMs: 60000,
                    keepAliveIntervalMs: 30000,
                    retryRequestDelayMs: 250,
                    maxRetries: 5,
                });

                const timeoutHandle = setTimeout(() => {
                    if (!responseSent) {
                        responseSent = true;
                        if (!res.headersSent) {
                            res.status(408).send({ code: "QR generation timeout" });
                        }
                        KnightBot.ev.removeAllListeners();
                        try {
                            KnightBot.ws.close();
                        } catch (_) {}
                        removeFile(dirs);
                    }
                }, 30000);

                KnightBot.ev.on("connection.update", async (update) => {
                    const { connection, lastDisconnect, isNewLogin, isOnline, qr } = update;

                    if (qr && !responseSent) {
                        console.log("🟢 QR Code Generated! Scan it with your WhatsApp app.");

                        try {
                            const qrDataURL = await QRCode.toDataURL(qr, {
                                errorCorrectionLevel: "M",
                                type: "image/png",
                                quality: 0.92,
                                margin: 1,
                                color: {
                                    dark: "#000000",
                                    light: "#FFFFFF",
                                },
                            });

                            if (!responseSent) {
                                responseSent = true;
                                console.log("QR Code sent to client");
                                res.send({
                                    qr: qrDataURL,
                                    message: "QR Code Generated! Scan it with your WhatsApp app.",
                                    instructions: [
                                        "1. Open WhatsApp on your phone",
                                        "2. Go to Settings > Linked Devices",
                                        '3. Tap "Link a Device"',
                                        "4. Scan the QR code above",
                                    ],
                                });
                            }
                        } catch (qrError) {
                            console.error("Error generating QR code:", qrError);
                            if (!responseSent) {
                                responseSent = true;
                                res.status(500).send({ code: "Failed to generate QR code" });
                            }
                        }
                    }

                    if (connection === "open") {
                        clearTimeout(timeoutHandle);
                        console.log("✅ Connected successfully!");
                        console.log("📱 Uploading session to MongoDB...");

                        try {
                            const credsPath = dirs + "/creds.json";
                            const savedSessionId = await saveSessionState({
                                sessionId: `qr_${sessionId}`,
                                filePath: credsPath,
                                fileName: `creds_qr_${sessionId}.json`,
                                sourceDir: dirs,
                                source: "qr",
                            });

                            console.log("✅ Session uploaded to MongoDB. Session ID:", savedSessionId);
                            setSessionId(savedSessionId);

                            const userJid = jidNormalizedUser(KnightBot.authState.creds.me?.id || "");
                            if (userJid) {
                                const caption = `MALIYA-MD BOT SESSION CODE

Here is your MALIYA-MD session code: 

*${savedSessionId}*

Please keep this session code safe and secure at all times. This code is very important because it is used to connect and access your bot. Do not share this code with anyone under any circumstances, as it may allow others to gain full control of your bot without your permission.

If this code gets leaked or exposed, your bot security can be compromised. Always store it in a private place such as your notes or password manager.

If you face any issues while connecting or using the session, feel free to contact me for help. Thank you for choosing MALIYA-MD.

MALIYA-MD BOT SESSION CODE

මෙන්න ඔයාගේ MALIYA-MD session code එක:

${savedSessionId}

මෙම session code එක ඉතාම වැදගත් නිසා කරුණාකර මෙය සුරක්ෂිතව තබාගන්න. මේ code එක භාවිතා කරලා තමයි ඔයාගේ bot එක connect කරන්නේ සහ access ලබාගන්නේ. කවර හේතුවක් නිසා හෝ මෙම code එක වෙන කෙනෙකුට share කරන්න එපා, එහෙම කළොත් ඔයාගේ bot එකට වෙන අයට full access එක ලැබෙන්න පුළුවන්.

මෙය leak වුණොත් bot security එකට බරපතල අවදානමක් තියෙනවා. එ නිසා මෙය private තැනක save කරගන්න.

කිසිම problem එකක් ආවොත් මට contact කරන්න පුළුවන්. MALIYA-MD භාවිතා කිරීම ගැන ස්තූතියි.`;
                                await KnightBot.sendMessage(userJid, { text: savedSessionId });
                                await KnightBot.sendMessage(userJid, {
                                    image: {
                                        url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/ChatGPT%20Image%20Mar%2022,%202026,%2008_40_08%20AM.png?raw=true",
                                    },
                                    caption,
                                });
                                console.log("📄 MongoDB session ID sent successfully");
                            } else {
                                console.log("❌ Could not determine user JID");
                            }

                            console.log("🧹 Cleaning up session...");
                            await delay(1000);
                            KnightBot.ev.removeAllListeners();
                            try {
                                await KnightBot.ws.close();
                            } catch (_) {}
                            removeFile(dirs);
                            console.log("✅ Session cleaned up successfully");
                            console.log("🎉 Process completed successfully!");
                        } catch (error) {
                            console.error("❌ Error uploading to MongoDB:", error);
                            KnightBot.ev.removeAllListeners();
                            try {
                                await KnightBot.ws.close();
                            } catch (_) {}
                            removeFile(dirs);
                        }
                    }

                    if (isNewLogin) {
                        console.log("🔐 New login via QR code");
                    }

                    if (isOnline) {
                        console.log("📶 Client is online");
                    }

                    if (connection === "close") {
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const reason = lastDisconnect?.error?.message || "unknown";
                        console.log(`🔴 Connection closed. Code: ${statusCode}, Reason: ${reason}`);

                        if (statusCode === 401) {
                            console.log("❌ Logged out from WhatsApp. Need to generate new QR code.");
                        } else {
                            KnightBot.ev.removeAllListeners();
                            try {
                                KnightBot.ws.close();
                            } catch (_) {}
                            const reconnectDelay = String(reason).toLowerCase().includes("conflict") ? 8000 : 3000;
                            console.log(`🔁 Reconnecting in ${reconnectDelay / 1000}s...`);
                            await delay(reconnectDelay);
                            console.log("🔄 Calling initiateSession...");
                            try {
                                await initiateSession();
                            } catch (e) {
                                console.error("❌ initiateSession error:", e);
                            }
                        }
                    }
                });

                KnightBot.ev.on("creds.update", saveCreds);
                KnightBot.ev.on("connection.update", () => {
                    if (responseSent) clearTimeout(timeoutHandle);
                });
            } catch (err) {
                console.error("Error initializing session:", err);
                if (!res.headersSent) {
                    res.status(503).send({ code: "Service Unavailable" });
                }
                removeFile(dirs);
            }
        }

        await initiateSession();
    });

    export default router;
