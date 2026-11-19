
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 5000;

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
    defaultModels,
    fallback: true,
    tts: !!process.env.ELEVENLABS_API_KEY &&
         !!process.env.ELEVENLABS_VOICE_ID,
    somaliTts: true,
    search: !!process.env.TAVILY_API_KEY
  });
});

// AI PROVIDER CONFIG
const defaultModels = {
  openrouter: "openrouter/free",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  groq: "openai/gpt-oss-120b"
};

const providerOrder = ["openrouter", "openai", "claude", "gemini", "deepseek", "groq"];

async function requestAI(provider, messages, system, requestedModel) {
  const model = requestedModel || defaultModels[provider];

  if (["openai", "deepseek", "groq", "openrouter"].includes(provider)) {
    const base = provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "deepseek"
      ? "https://api.deepseek.com"
      : provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : "https://openrouter.ai/api/v1";

    const headers = {
      Authorization: `Bearer ${keys[provider]}`,
      "Content-Type": "application/json"
    };

    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://nova-2tv2.onrender.com";
      headers["X-Title"] = "NOVA AI";
    }

    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `${provider} request failed (${response.status})`);
    }
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": keys.claude,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: messages.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "")
        }))
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Claude request failed (${response.status})`);
    }
    return data.content?.map(x => x.text || "").join("") || "";
  }

  if (provider === "gemini") {
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${keys.gemini}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini request failed (${response.status})`);
    }
    return data.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("") || "";
  }

  throw new Error(`Provider aan la aqoon: ${provider}`);
}

// AI CHAT WITH AUTOMATIC FALLBACK
app.post("/api/chat", async (req, res) => {
  const { messages, provider, model, lang, memory, search } = req.body;
  const preferred = provider || "openrouter";
  const history = Array.isArray(messages) ? messages : [];

  if (preferred !== "auto" && !providerOrder.includes(preferred)) {
    return res.status(400).json({ error: "AI provider aan sax ahayn." });
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

  // Provider-ka la doortay ayaa marka hore la tijaabinayaa; kuwa kale waa fallback.
  const candidates = preferred === "auto"
    ? providerOrder
    : [preferred, ...providerOrder.filter(p => p !== preferred)];

  const failures = [];

  for (const current of candidates) {
    if (!keys[current]) {
      failures.push(`${current}: API key lama dejin`);
      continue;
    }

    try {
      // Model-ka user-ku doortay waxaa loo adeegsadaa provider-ka koowaad oo keliya.
      const selectedModel = current === preferred ? model : null;
      const answer = await requestAI(current, history, system, selectedModel);

      return res.json({
        text: answer || "No response received.",
        provider: current,
        model: selectedModel || defaultModels[current],
        fallback: current !== preferred,
        requestedProvider: preferred
      });
    } catch (error) {
      failures.push(`${current}: ${error.message}`);
      console.error(`NOVA ${current} error:`, error.message);
    }
  }

  return res.status(503).json({
    error: "Dhammaan AI providers way fashilmeen ama API keys-koodu ma jiraan.",
    details: failures
  });
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
