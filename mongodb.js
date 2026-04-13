
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const SESSION_COLLECTION = process.env.SESSION_COLLECTION || "wa_sessions";

if (!MONGODB_URI) {
    console.warn("⚠️ MONGODB_URI is not set. MongoDB session upload will fail until you configure it.");
}

let cachedClient = null;
let cachedDb = null;

async function getDb() {
    if (cachedDb) return cachedDb;
    if (!MONGODB_URI) throw new Error("MONGODB_URI is missing");

    cachedClient = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
    });
    await cachedClient.connect();
    cachedDb = cachedClient.db(MONGODB_DB);
    return cachedDb;
}

function fileToBase64(filePath) {
    return fs.readFileSync(filePath).toString("base64");
}

function readFolderRecursive(dir, rootDir = dir, result = {}) {
    if (!fs.existsSync(dir)) return result;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            readFolderRecursive(fullPath, rootDir, result);
        } else {
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
            result[relativePath] = fileToBase64(fullPath);
        }
    }
    return result;
}

function normalizeSessionId(value) {
    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 120);
}

export async function upload(filePath, fileName, options = {}) {
    const db = await getDb();
    const col = db.collection(SESSION_COLLECTION);

    const sessionId = normalizeSessionId(
        options.sessionId || path.parse(fileName || "session").name || `session_${Date.now()}`,
    );
    const now = new Date();

    const uploadDoc = {
        sessionId,
        fileName: fileName || path.basename(filePath),
        primaryFile: {
            name: fileName || path.basename(filePath),
            mimeType: "application/json",
            data: fileToBase64(filePath),
        },
        status: options.status || "ready",
        connectBot: options.connectBot ?? true,
        source: options.source || "pair-site",
        phone: options.phone || null,
        updatedAt: now,
    };

    if (options.sourceDir && fs.existsSync(options.sourceDir)) {
        uploadDoc.files = readFolderRecursive(options.sourceDir);
    }

    await col.updateOne(
        { sessionId },
        {
            $set: uploadDoc,
            $setOnInsert: { createdAt: now },
        },
        { upsert: true },
    );

    return sessionId;
}

export async function saveSessionState(options = {}) {
    const { sessionId, phone, sourceDir, filePath, fileName, source = "pair-site" } = options;
    if (!filePath) throw new Error("filePath is required");

    return upload(filePath, fileName || path.basename(filePath), {
        sessionId,
        phone,
        sourceDir,
        source,
        status: "ready",
        connectBot: true,
    });
}
