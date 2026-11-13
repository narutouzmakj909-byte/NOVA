
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const keys = {
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.CLAUDE_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  groq: process.env.GROQ_API_KEY
};

app.get("/api/status", (req, res) => {
  res.json({
    providers: Object.fromEntries(
      Object.entries(keys).map(([k, v]) => [k, !!v])
    ),
    tts: !!process.env.ELEVENLABS_API_KEY,
    search: !!process.env.TAVILY_API_KEY
  });
});

// AI CHAT
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, provider, lang, memory, search } = req.body;
    const selected = provider || "openai";
    const history = Array.isArray(messages) ? messages : [];

    if (!keys[selected]) {
      return res.status(400).json({
        error: `${selected} API key lama gelin.`
      });
    }

    const system = `You are NOVA, a helpful AI assistant.
Reply in ${lang === "so" ? "Somali" : "English"}.
User memory: ${(memory || []).join("\n")}
Search information: ${JSON.stringify(search || {})}`;

    let text;

    if (["openai", "deepseek", "groq"].includes(selected)) {
      const base = selected === "openai"
        ? "https://api.openai.com/v1"
        : selected === "deepseek"
        ? "https://api.deepseek.com"
        : "https://api.groq.com/openai/v1";

      const model = selected === "openai"
        ? "gpt-4o-mini"
        : selected === "deepseek"
        ? "deepseek-chat"
        : "openai/gpt-oss-120b";

      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keys[selected]}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            ...history
          ]
        })
      });

      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "AI request failed");
      text = d.choices?.[0]?.message?.content;
    }

    if (selected === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": keys.claude,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1500,
          system,
          messages: history
        })
      });

      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Claude failed");
      text = d.content?.map(x => x.text || "").join("");
    }

    if (selected === "gemini") {
      const contents = history.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents
          })
        }
      );

      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Gemini failed");
      text = d.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("");
    }

    res.json({
      text: text || "No response received.",
      provider: selected
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ELEVENLABS - CODKII HORE
app.post("/api/tts", async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY ||
        !process.env.ELEVENLABS_VOICE_ID) {
      return res.status(400).json({ error: "ElevenLabs lama dejin." });
    }

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: req.body.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: Math.max(0.7, Math.min(1.2, Number(req.body.speed) || 1))
          }
        })
      }
    );

    if (!r.ok) throw new Error(await r.text());

    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await r.arrayBuffer()));

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SEARCH
app.post("/api/search", async (req, res) => {
  try {
    if (!process.env.TAVILY_API_KEY) {
      return res.json({ results: [] });
    }

    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: req.body.q,
        max_results: 5
      })
    });

    const d = await r.json();
    if (!r.ok) throw new Error("Search failed");

    res.json({
      results: (d.results || []).map(x => ({
        title: x.title,
        url: x.url,
        content: x.content
      }))
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TEST PROVIDER
app.post("/api/test", async (req, res) => {
  const p = req.body.provider;

  if (!keys[p]) {
    return res.status(400).json({
      error: "API key lama dejin."
    });
  }

  res.json({ success: true, provider: p });
});

// FRONTEND
app.use(express.static(__dirname + "/public"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVA Backend running on port ${PORT}`);
});

