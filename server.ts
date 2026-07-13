import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { FAQs } from "./src/faqs.ts";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON parsing
app.use(express.json());

// API: Get all FAQs
app.get("/api/faqs", (req, res) => {
  res.json({ faqs: FAQs });
});

// Lazy-initialized Gemini client to prevent startup crashes if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please configure it in your Secrets / environment variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Grounding instructions incorporating the 30 college admission FAQs
const systemInstruction = `You are the friendly, official Admission AI Chatbot for our university. Your primary objective is to assist prospective students, parents, high school counselors, and transfer applicants with their admission questions.

You have access to the following 30 official College Admission FAQs:

${FAQs.map(
  (f) => `ID: ${f.id} | Category: ${f.category}
Q: ${f.question}
A: ${f.answer}`
).join("\n\n")}

CRITICAL INSTRUCTIONS:
1. Always prioritize the official FAQs above for your answers. When a user asks about a topic covered in the FAQs, use the factual details provided (such as deadlines, costs, and GPA averages) to formulate your response.
2. Maintain a warm, encouraging, conversational, and highly professional collegiate tone.
3. If the user's question is NOT answered in the 30 FAQs, you should politely answer using your general knowledge about college admissions. Be helpful, but append a clear note advising them to verify with the official Admissions Office at admissions@university.edu or check their secure Admissions Applicant Portal.
4. Keep responses structured, concise, and highly readable. Use formatting (bullet points, bold highlights) when it makes the answer easier to read.
5. Do not invent contradictory numbers or deadlines (e.g., if the user asks for tuition, use the $11,800/year in-state and $27,500/year out-of-state values from FAQ 26).
6. Avoid referencing "FAQ numbers" or "ID numbers" in your replies (e.g., don't say "According to FAQ 23"). Just speak naturally.`;

// API: Chat with Admission AI Bot
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "An array of messages is required." });
    }

    // Attempt to retrieve the Gemini client safely
    let ai;
    try {
      ai = getGeminiClient();
    } catch (apiError: any) {
      console.warn("Gemini Client Init Warning:", apiError.message);
      return res.status(503).json({
        error: "Admissions chatbot is temporarily offline because the Gemini API Key is missing. Please add the GEMINI_API_KEY under Settings > Secrets to enable full AI chatbot responses.",
        isDemoMode: true
      });
    }

    // Format chat history for the Google GenAI SDK (user -> "user", assistant -> "model")
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));

    // Generate content using Gemini 3.5 Flash (the recommended model for text tasks)
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const reply = response.text || "I'm sorry, I couldn't formulate a response. Can you please rephrase your question?";
    return res.json({ reply });
  } catch (error: any) {
    console.error("Express Chat API error:", error);
    return res.status(500).json({
      error: error.message || "An internal error occurred while speaking to the AI Admissions Assistant."
    });
  }
});

// Integration with Vite
async function startServer() {
  // Mount Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
