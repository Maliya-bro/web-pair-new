import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

const MONGODB_URI =
  "mongodb+srv://MALIYA-MD:279221@maliya-md.spge6db.mongodb.net/?retryWrites=true&w=majority&appName=MALIYA-MD";

const MONGODB_DB = "maliya_md";
const SESSION_COLLECTION = "wa_sessions";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  cachedClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  console.log("✅ Connected to MongoDB");
  return cachedDb;
}

function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString("base64");
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
    options.sessionId ||
      path.parse(fileName || "session").name ||
      `session_${Date.now()}`,
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
  const {
    sessionId,
    phone,
    filePath,
    fileName,
    source = "pair-site",
  } = options;

  if (!filePath) {
    throw new Error("filePath is required");
  }

  return upload(filePath, fileName || path.basename(filePath), {
    sessionId,
    phone,
    source,
    status: "ready",
    connectBot: true,
  });
}

export async function getSessionById(sessionId) {
  const db = await getDb();
  const col = db.collection(SESSION_COLLECTION);

  return col.findOne({ sessionId: normalizeSessionId(sessionId) });
}

export async function restoreCredsToFile(sessionId, targetFilePath) {
  const doc = await getSessionById(sessionId);

  if (!doc) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (!doc.primaryFile?.data) {
    throw new Error(`No primaryFile found for session: ${sessionId}`);
  }

  fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
  fs.writeFileSync(targetFilePath, Buffer.from(doc.primaryFile.data, "base64"));

  return targetFilePath;
}

export async function closeMongoConnection() {
  try {
    if (cachedClient) {
      await cachedClient.close();
    }
  } catch (err) {
    console.error("Error closing MongoDB connection:", err);
  } finally {
    cachedClient = null;
    cachedDb = null;
  }
}
