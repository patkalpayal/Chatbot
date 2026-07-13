import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Search,
  BookOpen,
  Send,
  Info,
  Phone,
  Mail,
  FileText,
  CheckCircle,
  Sparkles,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  Volume2,
  Trash2,
  Cpu
} from "lucide-react";
import { FAQs, FAQItem } from "./faqs";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  category?: string;
  isFaqMatch?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! Welcome to the University Admissions Assistant. I am here to help you with any questions regarding applications, scholarships, deadlines, and campus life. \n\nFeel free to type your question below, or select a category or popular question from the sidebars to get started!",
      category: "Welcome"
    }
  ]);
  const [input, setInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [viewMode, setViewMode] = useState<"chat" | "database">("chat");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Extract all unique categories
  const categories = ["All", ...Array.from(new Set(FAQs.map((faq) => faq.category)))];

  // Filter FAQs based on selected category & search query
  const filteredFAQs = FAQs.filter((faq) => {
    const matchesCategory = selectedCategory === "All" || faq.category === selectedCategory;
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Local fallback matcher in case Gemini is not configured or fails
  const findLocalFaqAnswer = (userQuery: string): { answer: string; faq?: FAQItem } | null => {
    const query = userQuery.toLowerCase().trim();
    let bestMatch: FAQItem | null = null;
    let highestScore = 0;

    for (const faq of FAQs) {
      const qLower = faq.question.toLowerCase();
      const aLower = faq.answer.toLowerCase();

      let score = 0;
      // Direct substring match
      if (qLower.includes(query)) score += 50;
      
      // Keyword match scoring
      const words = query.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        if (qLower.includes(word)) score += 10;
        if (aLower.includes(word)) score += 3;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = faq;
      }
    }

    // Only return if match is reasonably confident
    if (highestScore > 8 && bestMatch) {
      return { answer: bestMatch.answer, faq: bestMatch };
    }
    return null;
  };

  // Speak message aloud using browser TTS
  const speakMessage = (text: string) => {
    if ("speechSynthesis" in window) {
      // Cancel ongoing speech
      window.speechSynthesis.cancel();
      // Remove markdown styling for speech
      const cleanText = text.replace(/[\*\#\`\-\_]/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in this browser.");
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText) return;

    if (!textToSend) {
      setInput("");
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: queryText
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    const localMatch = findLocalFaqAnswer(queryText);

    try {
      // We will send to server anyway, but if local match is available we can utilize it in client or let server decide.
      // Let's call our express API backend
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error("Server responded with error");
      }

      const data = await response.json();

      if (data.isDemoMode) {
        setIsDemoMode(true);
        // Fall back to offline matching if server indicates demo mode (missing API key)
        setTimeout(() => {
          setIsTyping(false);
          if (localMatch) {
            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: localMatch.answer,
                category: localMatch.faq?.category,
                isFaqMatch: true
              }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "I'm running in offline database search mode because the Gemini API key has not been configured in Settings > Secrets yet. \n\nI couldn't find a direct match in our 30 official FAQs for your query. Here is a list of contact resources or feel free to try asking about general deadlines, fees, or GPA requirements which are part of our 30 loaded FAQs!",
                category: "System Helper"
              }
            ]);
          }
        }, 1000);
      } else {
        setIsDemoMode(false);
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: data.reply,
              category: localMatch?.faq?.category || "Admissions Bot",
              isFaqMatch: !!localMatch
            }
          ]);
        }, 800);
      }
    } catch (err) {
      console.error("Chat error:", err);
      // Fallback to local offline match upon network/server issue
      setTimeout(() => {
        setIsTyping(false);
        if (localMatch) {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `${localMatch.answer}\n\n*(Responding in Offline Search Mode)*`,
              category: localMatch.faq?.category,
              isFaqMatch: true
            }
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I experienced a connection issue, but I am here in Offline Mode. I couldn't find an exact keyword match in our 30 pre-loaded FAQ questions. Try asking about 'SAT requirements', 'tuition fees', or 'deadlines'.",
              category: "Offline Helper"
            }
          ]);
        }
      }, 1000);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Chat cleared! How can I assist you with admissions today?",
        category: "Welcome"
      }
    ]);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* HEADER */}
      <header className="h-16 bg-blue-900 flex items-center justify-between px-6 border-b border-blue-800 shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-blue-900 text-xl shadow-inner">
            U
          </div>
          <div>
            <h1 className="text-white font-semibold text-base md:text-lg tracking-tight flex items-center gap-2">
              University Admissions AI Helper
              <span className="hidden sm:inline bg-blue-800 text-blue-200 text-xs px-2.5 py-0.5 rounded-full font-medium border border-blue-700">
                v2.4
              </span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-blue-950/40 px-3 py-1.5 rounded-lg border border-blue-800/60">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-blue-100 text-xs font-medium">System Online</span>
          </div>
          <div className="bg-blue-800 h-8 w-[1px] hidden sm:block"></div>
          <button
            onClick={() => setViewMode(viewMode === "chat" ? "database" : "chat")}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition"
          >
            {viewMode === "chat" ? (
              <>
                <BookOpen className="w-3.5 h-3.5" />
                <span>View All 30 FAQs</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Back to Chat</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR: FAQ CATEGORIES */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 hidden md:flex">
          <div className="p-5 flex-1 overflow-y-auto">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              FAQ Categories
            </h2>
            <nav className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition ${
                    selectedCategory === cat
                      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      selectedCategory === cat
                        ? "bg-blue-100 text-blue-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {cat === "All"
                      ? FAQs.length
                      : FAQs.filter((f) => f.category === cat).length}
                  </span>
                </button>
              ))}
            </nav>
          </div>
          <div className="p-5 border-t border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                COLLEGE DATABASE
              </p>
              <span className="text-xs font-bold text-blue-700">100% loaded</span>
            </div>
            <p className="text-sm text-slate-700 font-bold mt-1">30 Active QA Pairs</p>
            <div className="mt-2.5 w-full bg-slate-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full w-full"></div>
            </div>
          </div>
        </aside>

        {/* WORKSPACE AREA */}
        <section className="flex-1 flex flex-col bg-slate-100 overflow-hidden">
          {viewMode === "chat" ? (
            <>
              {/* CHAT INTERFACE */}
              <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
                {isDemoMode && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-xs font-bold">Offline Search Engine Active</p>
                      <p className="text-xs mt-0.5 text-amber-800 leading-relaxed">
                        To activate custom natural language answers using Gemini 3.5, please add your 
                        <span className="font-semibold bg-amber-100/80 px-1 rounded mx-1 text-amber-900">GEMINI_API_KEY</span> 
                        in the Secrets settings panel. In the meantime, the assistant is answering instantly using a keyword-matching scoring system over our 30 official admission FAQs.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative group ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-2xl rounded-tr-none max-w-[80%] md:max-w-[70%] shadow-sm p-4"
                          : "bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-none max-w-[90%] md:max-w-[80%] shadow-sm p-4"
                      }`}
                    >
                      {/* Message role & type badge */}
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                            Admissions AI
                          </span>
                          {msg.category && (
                            <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md max-w-[120px] truncate">
                              {msg.category}
                            </span>
                          )}
                          {msg.isFaqMatch && (
                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                              <CheckCircle className="w-2.5 h-2.5" /> Official Match
                            </span>
                          )}
                          <button
                            onClick={() => speakMessage(msg.content)}
                            title="Speak message"
                            className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 p-1 rounded transition"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>

                      {msg.role === "assistant" && msg.id === "welcome" && (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleSendMessage("What are the regular admission deadlines?")}
                            className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition text-left font-medium"
                          >
                            🕒 What are the deadlines?
                          </button>
                          <button
                            onClick={() => handleSendMessage("Is there an application fee waiver?")}
                            className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition text-left font-medium"
                          >
                            💸 Are there fee waivers?
                          </button>
                          <button
                            onClick={() => handleSendMessage("Do you accept transfer credits?")}
                            className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition text-left font-medium"
                          >
                            🔄 Do you accept transfer credits?
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      <span className="text-xs text-slate-400 font-medium ml-1">AI Assistant is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* INPUT BAR */}
              <div className="p-4 md:p-6 bg-white border-t border-slate-200 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-3"
                >
                  <button
                    type="button"
                    onClick={clearChat}
                    title="Clear Chat History"
                    className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded-lg transition shrink-0"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a question about admissions (e.g., 'How do I apply for housing?')"
                    className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    className="bg-blue-900 hover:bg-blue-800 text-white px-5 md:px-7 py-3 rounded-lg font-bold text-sm transition flex items-center gap-2"
                  >
                    <span>SEND</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <p className="text-[11px] text-slate-400 mt-2.5 text-center flex items-center justify-center gap-1.5 font-medium">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" />
                  <span>Powered by University Admission Python/Flask System & Gemini 3.5 AI</span>
                </p>
              </div>
            </>
          ) : (
            /* INTERACTIVE FAQ DATABASE EXPLORER */
            <div className="flex-1 p-6 flex flex-col overflow-hidden">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-950" />
                      Official 30 FAQs Database
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Explore the verified, official university admission curriculum loaded in the chatbot's memory.
                    </p>
                  </div>
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search question or answer..."
                      className="w-full border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* FAQ categories selector in database view */}
                <div className="flex gap-1.5 py-3 overflow-x-auto shrink-0 md:hidden border-b border-slate-100">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition font-medium ${
                        selectedCategory === cat
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
                  {filteredFAQs.length > 0 ? (
                    filteredFAQs.map((faq) => (
                      <div
                        key={faq.id}
                        className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/60 hover:border-blue-200 transition group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            {faq.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">FAQ ID #{faq.id}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mt-2">
                          {faq.question}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-white p-3 rounded-lg border border-slate-100">
                          {faq.answer}
                        </p>
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => {
                              setViewMode("chat");
                              handleSendMessage(faq.question);
                            }}
                            className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition"
                          >
                            <span>Ask This Question</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-slate-400 font-medium">No FAQ matched your current search parameters.</p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedCategory("All");
                        }}
                        className="text-xs text-blue-700 font-bold mt-2 hover:underline"
                      >
                        Reset Search Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR: SUGGESTIONS & CONTACT */}
        <aside className="w-72 bg-white border-l border-slate-200 p-5 flex flex-col shrink-0 hidden lg:flex">
          <div className="flex-1 overflow-y-auto">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Popular Questions
            </h2>
            <div className="space-y-3">
              {FAQs.filter((f) => selectedCategory === "All" || f.category === selectedCategory)
                .slice(0, 5)
                .map((faq) => (
                  <div
                    key={faq.id}
                    onClick={() => {
                      setViewMode("chat");
                      handleSendMessage(faq.question);
                    }}
                    className="p-3 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-100 hover:border-blue-200 transition cursor-pointer group"
                  >
                    <p className="text-xs font-bold text-slate-700 group-hover:text-blue-900 transition line-clamp-2">
                      {faq.question}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                        {faq.category}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-400 ml-auto group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Quick Contact
            </h2>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-900">
              <p className="text-xs font-bold">Admissions Office</p>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span className="font-semibold text-slate-700 hover:text-blue-900 transition">
                  (555) 012-3456
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-sm">
                <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <a
                  href="mailto:admissions@university.edu"
                  className="text-blue-700 hover:underline truncate font-medium text-xs"
                >
                  admissions@university.edu
                </a>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
