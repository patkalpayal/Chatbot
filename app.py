import os
import csv
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Load optional .env variables
load_dotenv()

app = Flask(__name__)

# Load FAQs from CSV
FAQS = []
try:
    csv_path = os.path.join(os.path.dirname(__file__), "faqs.csv")
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            FAQS.append({
                "id": int(row["id"]),
                "category": row["category"],
                "question": row["question"],
                "answer": row["answer"]
            })
except Exception as e:
    print(f"Error loading faqs.csv: {e}")

# Attempt to configure Gemini AI if library is installed and API Key is available
ai_client = None
try:
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        # Use gemini-2.5-flash or gemini-1.5-flash
        ai_client = genai.GenerativeModel("gemini-1.5-flash")
        print("Gemini AI loaded and configured successfully.")
except ImportError:
    print("google-generativeai library is not installed. Running in offline/local search mode.")
except Exception as e:
    print(f"Failed to initialize Gemini client: {e}")

# Build a system prompt containing our 30 college admission FAQs
faq_prompt_context = "\n\n".join([
    f"ID: {faq['id']} | Category: {faq['category']}\nQ: {faq['question']}\nA: {faq['answer']}"
    for faq in FAQS
])

SYSTEM_INSTRUCTIONS = f"""You are the friendly, official Admission AI Chatbot for our university. Your primary objective is to assist prospective students, parents, high school counselors, and transfer applicants with their admission questions.

You have access to the following 30 official College Admission FAQs:

{faq_prompt_context}

CRITICAL INSTRUCTIONS:
1. Always prioritize the official FAQs above for your answers. When a user asks about a topic covered in the FAQs, use the factual details provided (such as deadlines, costs, and GPA averages) to formulate your response.
2. Maintain a warm, encouraging, conversational, and highly professional collegiate tone.
3. If the user's question is NOT answered in the 30 FAQs, you should politely answer using your general knowledge about college admissions. Be helpful, but append a clear note advising them to verify with the official Admissions Office at admissions@university.edu or check their secure Admissions Applicant Portal.
4. Keep responses structured, concise, and highly readable. Use formatting (bullet points, bold highlights) when it makes the answer easier to read.
5. Do not invent contradictory numbers or deadlines (e.g., if the user asks for tuition, use the $11,800/year in-state and $27,500/year out-of-state values from FAQ 26).
6. Avoid referencing "FAQ numbers" or "ID numbers" in your replies. Just speak naturally.
"""

def find_local_faq_answer(user_query):
    """
    Local fallback matcher using a basic word overlap relevance score.
    Returns the answer and matching FAQ dict if a confident match is found.
    """
    query = user_query.lower().strip()
    best_match = None
    highest_score = 0
    
    # Simple word list filtering out short connector words
    query_words = [w for w in query.split() if len(w) > 3]
    
    for faq in FAQS:
        q_lower = faq["question"].lower()
        a_lower = faq["answer"].lower()
        score = 0
        
        # Exact/Substring bonus
        if query in q_lower:
            score += 50
            
        for word in query_words:
            if word in q_lower:
                score += 10
            if word in a_lower:
                score += 3
                
        if score > highest_score:
            highest_score = score
            best_match = faq
            
    if highest_score > 8 and best_match:
        return best_match
    return None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/faqs", methods=["GET"])
def get_faqs():
    return jsonify({"faqs": FAQS})

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"error": "An array of messages is required."}), 400

    last_query = messages[-1].get("content", "").strip()
    local_match = find_local_faq_answer(last_query)

    # Use Gemini if available
    if ai_client:
        try:
            # Build simple chat prompt with context instructions
            prompt = f"{SYSTEM_INSTRUCTIONS}\n\nUser Question: {last_query}\nAnswer:"
            response = ai_client.generate_content(prompt)
            reply_text = response.text
            return jsonify({"reply": reply_text})
        except Exception as e:
            print(f"Gemini API error: {e}")
            # Fallback to local match if Gemini fails at runtime

    # Local fallback/Demo mode
    if local_match:
        return jsonify({
            "reply": local_match["answer"],
            "isDemoMode": not bool(ai_client),
            "category": local_match["category"]
        })
    
    # Generic offline message
    return jsonify({
        "reply": "I'm running in offline mode. I couldn't find an exact keyword match in our 30 college FAQs for your query. Try asking about 'GPA requirements', 'scholarships', or 'how to apply for financial aid'.",
        "isDemoMode": not bool(ai_client)
    })

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
