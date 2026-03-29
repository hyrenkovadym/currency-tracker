import express from "express";
import cors from "cors";
import dotenv from "dotenv";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const PORT = Number(process.env.PORT || 8787);


app.get("/", (req, res) => {
  res.type("text").send("OK. Server is running. Use POST /api/feedback");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/api/feedback", async (req, res) => {
  const payload = req.body || {};

  console.log("\n[feedback] incoming:");
  console.log(JSON.stringify(payload, null, 2));


  const msg = String(payload?.message || "").trim();
  if (msg.length < 5) {
    return res.status(400).json({ ok: false, error: "Message too short" });
  }


  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
