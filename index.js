import "dotenv/config";
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
const PORT = process.env.PORT || 5000;

import("events").then((events) => {
  events.EventEmitter.defaultMaxListeners = 500;
});

app.get(["/health", "/_health", "/ping"], (req, res) => {
  res.status(200).send("OK");
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.sendFile(path.join(__dirname, "pair.html"));
  } catch {
    res.status(500).send("Error loading UI");
  }
});

app.get("/session-id", (req, res) => {
  res.json({ sessionId: getSessionId() });
});

app.post("/session-id/clear", (req, res) => {
  setSessionId("");
  res.json({ ok: true });
});

app.use("/pair", pairRouter);
app.use("/qr", qrRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log("Mongo URI:", process.env.MONGODB_URI ? "OK" : "NOT SET");
});

export default app;
