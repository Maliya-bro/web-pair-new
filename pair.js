
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
    import pn from "awesome-phonenumber";
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
        let num = req.query.number;
        if (!num) {
            return res.status(400).send({ code: "Phone number is required." });
        }

        let dirs = "./" + (num || "session");
        await removeFile(dirs);

        num = String(num).replace(/[^0-9]/g, "");

        const phone = pn("+" + num);
        if (!phone.isValid()) {
            if (!res.headersSent) {
                return res.status(400).send({
                    code: "Invalid phone number. Please enter your full international number without + or spaces.",
                });
            }
            return;
        }

        num = phone.getNumber("e164").replace("+", "");
        const sessionId = `session_${num}`;

        async function initiateSession() {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);

            try {
                const { version } = await fetchLatestBaileysVersion();
                let KnightBot = makeWASocket({
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

                KnightBot.ev.on("connection.update", async (update) => {
                    const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                    if (connection === "open") {
                        console.log("✅ Connected successfully!");
                        console.log("📱 Uploading session to MongoDB...");

                        try {
                            const credsPath = dirs + "/creds.json";
                            const savedSessionId = await saveSessionState({
                                sessionId,
                                phone: num,
                                filePath: credsPath,
                                fileName: `creds_${num}_${Date.now()}.json`,
                                sourceDir: dirs,
                                source: "pair-code",
                            });

                            console.log("✅ Session uploaded to MongoDB. Session ID:", savedSessionId);
                            setSessionId(savedSessionId);

                            const userJid = jidNormalizedUser(num + "@s.whatsapp.net");
                            const caption = `MALIYA-MD BOT SESSION CODE

Here is your MALIYA-MD session code: 

\`${savedSessionId}\`

Please keep this session code safe and secure at all times. This code is very important because it is used to connect and access your bot. Do not share this code with anyone under any circumstances, as it may allow others to gain full control of your bot without your permission.

If this code gets leaked or exposed, your bot security can be compromised. Always store it in a private place such as your notes or password manager.

If you face any issues while connecting or using the session, feel free to contact me for help. Thank you for choosing MALIYA-MD. Contact me: wa.me/94702135392 

MALIYA-MD BOT SESSION CODE

මෙන්න ඔයාගේ MALIYA-MD session code එක: 

*${savedSessionId}*

මෙම session code එක ඉතාම වැදගත් නිසා කරුණාකර මෙය සුරක්ෂිතව තබාගන්න. මේ code එක භාවිතා කරලා තමයි ඔයාගේ bot එක connect කරන්නේ සහ access ලබාගන්නේ. කවර හේතුවක් නිසා හෝ මෙම code එක වෙන කෙනෙකුට share කරන්න එපා, එහෙම කළොත් ඔයාගේ bot එකට වෙන අයට full access එක ලැබෙන්න පුළුවන්.

මෙය leak වුණොත් bot security එකට බරපතල අවදානමක් තියෙනවා. එ නිසා මෙය private තැනක save කරගන්න.

කිසිම problem එකක් ආවොත් මට contact කරන්න පුළුවන්. MALIYA-MD භාවිතා කිරීම ගැන ස්තූතියි. Contact me: wa.me/94702135392`;
                            await KnightBot.sendMessage(userJid, { text: savedSessionId });
                            await KnightBot.sendMessage(userJid, {
                                image: {
                                    url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/ChatGPT%20Image%20Mar%2022,%202026,%2008_40_08%20AM.png?raw=true",
                                },
                                caption,
                            });
                            console.log("📄 MongoDB session ID sent successfully");

                            console.log("🧹 Cleaning up session...");
                            await delay(1000);
                            KnightBot.ev.removeAllListeners();
                            await KnightBot.ws.close();
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
                        console.log("🔐 New login via pair code");
                    }

                    if (isOnline) {
                        console.log("📶 Client is online");
                    }

                    if (connection === "close") {
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const reason = lastDisconnect?.error?.message || "unknown";
                        console.log(`🔴 Connection closed. Code: ${statusCode}, Reason: ${reason}`);

                        if (statusCode === 401) {
                            console.log("❌ Logged out from WhatsApp. Need to generate new pair code.");
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

                if (!KnightBot.authState.creds.registered) {
                    await delay(3000);
                    num = num.replace(/[^\d+]/g, "");
                    if (num.startsWith("+")) num = num.substring(1);

                    try {
                        let code = await KnightBot.requestPairingCode(num);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        if (!res.headersSent) {
                            console.log({ num, code });
                            await res.send({ code });
                        }
                    } catch (error) {
                        console.error("Error requesting pairing code:", error);
                        if (!res.headersSent) {
                            res.status(503).send({
                                code: "Failed to get pairing code. Please check your phone number and try again.",
                            });
                        }
                        KnightBot.ev.removeAllListeners();
                        try {
                            KnightBot.ws.close();
                        } catch (_) {}
                        removeFile(dirs);
                    }
                }

                KnightBot.ev.on("creds.update", saveCreds);
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
