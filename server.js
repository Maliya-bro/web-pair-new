const express = require("express");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const config = { PORT: 5000 };

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/pair", async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.json({ status: false, msg: "Number required" });

    const { state } = await useMultiFileAuthState("./temp");
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    const code = await sock.requestPairingCode(number);
    res.json({ status: true, code });
  } catch (e) {
    console.log(e);
    res.json({ status: false, msg: "Failed to generate code" });
  }
});

app.listen(config.PORT, () => console.log(`🌐 Web Pair running on port ${config.PORT}`));
