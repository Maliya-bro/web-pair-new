const express = require("express")
const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys")

const app = express()
app.use(express.json())
app.use(express.static("public"))

app.post("/pair", async (req, res) => {
  try {
    const { number } = req.body
    if (!number) return res.json({ status: false, msg: "Number required" })

    const { state } = await useMultiFileAuthState("./temp")

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    })

    const code = await sock.requestPairingCode(number)
    res.json({ status: true, code })
  } catch (e) {
    res.json({ status: false, msg: "Error generating code" })
  }
})

app.listen(3000, () => {
  console.log("🌐 Web Pair running on port 3000")
})
