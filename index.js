import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import path from "path";

import pairRouter from "./pair.js";
import qrRouter from "./qr.js";
import { getSessionId, setSessionId } from "./session-store.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Deploy-safe PORT (fallback 5000)
const PORT = process.env.PORT || 5000;

// ✅ Increase event listeners limit (avoid warnings/crash)
import("events").then((events) => {
  events.EventEmitter.defaultMaxListeners = 500;
});

// ✅ Health check endpoints (at the top)
app.get(["/health", "/_health", "/ping"], (req, res) => {
  res.status(200).send("OK");
});

app.get("/", (req, res, next) => {
  if (req.headers.host && !req.headers.host.includes("0.0.0.0") && !req.headers.host.includes("localhost")) {
      // Trust proxy / allow all hosts for Replit preview
  }
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// UI — no-cache so updates are always picked up
app.get("/", (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.sendFile(path.join(__dirname, "pair.html"));
  } catch (err) {
    res.status(500).send("Error loading UI");
  }
});

// Session ID API
app.get("/session-id", (req, res) => {
  res.json({ sessionId: getSessionId() });
});

app.post("/session-id/clear", (req, res) => {
  setSessionId("");
  res.json({ ok: true });
});

// Routers
app.use("/pair", pairRouter);
app.use("/qr", qrRouter);

// ✅ Bind 0.0.0.0 :5000
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

export default app;
