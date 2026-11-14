
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const keys = {
  openrouter: process.env.OPENROUTER_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.CLAUDE_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  groq: process.env.GROQ_API_KEY
};

// STATUS
app.get("/api/status", (req, res) => {
  res.json({
    providers: Object.fromEntries(
      Object.entries(keys).map(([k, v]) => [k, !!v])
    ),
    tts: !!process.env.ELEVENLABS_API_KEY &&
         !!process.env.ELEVENLABS_VOICE_ID,
    somaliTts: true,
    search: !!process.env.TAVILY_API_KEY
  });
});

// AI CHAT
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, provider, lang, memory, search } = req.body;
    const selected = provider || "openrouter";
    const history = Array.isArray(messages) ? messages : [];

    if (!keys[selected]) {
      return res.status(400).json({
        error: `${selected} API key lama gelin.`
      });
    }

    const system = `You are NOVA, an advanced, professional and friendly AI assistant.

PERSONALITY:
- Be natural, warm, open-minded, confident and conversational.
- Have a great sense of humor. Make clever jokes when appropriate.
- Be playful and fun, but know when to be serious.
- Never sound robotic, boring, or overly formal.
- Show curiosity and genuine interest in the conversation.
- Be expressive and use natural conversational language.
- Be honest, thoughtful and respectful.

CONVERSATION:
- Talk like a smart, friendly personal assistant.
- Give direct and useful answers.
- Don't over-explain simple questions.
- You can tease playfully without being rude.
- Remember the conversation context.
- Ask natural follow-up questions when useful.
- Adapt your tone to the user's mood.
- Make conversations engaging and enjoyable.
- Avoid repeating the same phrases.
- Don't force jokes into serious conversations.

LANGUAGE:
- Reply in ${lang === "so" ? "Somali" : "English"}.
- Understand Somali slang and everyday expressions.
- Use natural Somali, not awkward literal translations.
- If the user mixes Somali and English, understand both.

IDENTITY:
- Your name is NOVA.
- You are an intelligent personal AI assistant.
- Never claim to be human.
- Be creative, knowledgeable and proactive.
- Maintain a consistent personality across conversations.

User memory: ${(memory || []).join("\n")}
Search information: ${JSON.stringify(search || {})}`;

    let text;

    if (["openai", "deepseek", "groq", "openrouter"].includes(selected)) {
      const base = selected === "openai"
        ? "https://api.openai.com/v1"
        : selected === "deepseek"
        ? "https://api.deepseek.com"
        : selected === "groq"
        ? "https://api.groq.com/openai/v1"
        : "https://openrouter.ai/api/v1";

      const model = selected === "openai"
        ? "gpt-4o-mini"
        : selected === "deepseek"
        ? "deepseek-chat"
        : selected === "groq"
        ? "openai/gpt-oss-120b"
        : "openrouter/free";

      const headers = {
        Authorization: `Bearer ${keys[selected]}`,
        "Content-Type": "application/json"
      };

      if (selected === "openrouter") {
        headers["HTTP-Referer"] = "https://nova-2tv2.onrender.com";
        headers["X-Title"] = "NOVA AI";
      }

      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            ...history
          ]
        })
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error?.message || "AI request failed");
      }

      text = d.choices?.[0]?.message?.content;
    }

    if (selected === "claude") {
      const r = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
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
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error?.message || "Claude failed");
      }

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
            systemInstruction: {
              parts: [{ text: system }]
            },
            contents
          })
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error?.message || "Gemini failed");
      }

      text = d.candidates?.[0]?.content?.parts
        ?.map(x => x.text || "").join("");
    }

    res.json({
      text: text || "No response received.",
      provider: selected
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ELEVENLABS TTS
app.post("/api/tts", async (req, res) => {
  try {
    if (
      !process.env.ELEVENLABS_API_KEY ||
      !process.env.ELEVENLABS_VOICE_ID
    ) {
      return res.status(400).json({
        error: "ElevenLabs lama dejin."
      });
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
            speed: Math.max(
              0.7,
              Math.min(1.2, Number(req.body.speed) || 1)
            )
          }
        })
      }
    );

    if (!r.ok) {
      throw new Error(await r.text());
    }

    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await r.arrayBuffer()));

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TEXTREADTTS - SOMALI VOICE
app.post("/api/tts/somali", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({
        error: "Qoraal geli."
      });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        error: "Qoraalku aad buu u dheer yahay. Yaree."
      });
    }

    const params = new URLSearchParams({
      accessKey: "FREE",
      language: "somali",
      speaker: "speaker1",
      text
    });

    const r = await fetch(
      `https://textreadtts.com/tts/convert?${params}`
    );

    const data = await r.json();

    if (!r.ok || data.code !== 0 || !data.audio) {
      throw new Error(data.message || "Somali TTS failed.");
    }

    const audioUrl = new URL(data.audio);

    if (
      audioUrl.protocol !== "https:" ||
      !(
        audioUrl.hostname === "textreadtts.com" ||
        audioUrl.hostname.endsWith(".textreadtts.com")
      )
    ) {
      throw new Error("Invalid audio URL.");
    }

    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      throw new Error("Audio download failed.");
    }

    res.set("Content-Type", "audio/mpeg");
    res.send(
      Buffer.from(await audioResponse.arrayBuffer())
    );

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

    const r = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: req.body.q,
          max_results: 5
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error("Search failed");
    }

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

  res.json({
    success: true,
    provider: p
  });
});

// FRONTEND
app.use(express.static(__dirname));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOVA Backend running on port ${PORT}`);
});
