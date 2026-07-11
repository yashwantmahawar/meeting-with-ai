import base64
import json
import os
import tempfile
from typing import Dict, Any
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
import sqlite3
from google.genai import types

# Load environment variables from .env
load_dotenv()

# Initialize Flask application and enable CORS
app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

def get_db_connection():
    conn = sqlite3.connect('history.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = get_db_connection()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                transcript TEXT,
                mom TEXT,
                action_items TEXT,
                email_draft TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        app.logger.error(f"Failed to initialize database: {e}")

init_db()


@app.route("/")
def index() -> Any:
    """
    Serve the main index.html file for the frontend application.
    """
    return app.send_static_file("index.html")


@app.route("/api/chat", methods=["POST"])
def chat() -> Any:
    """
    Handle chat queries from the user regarding the meeting transcript.
    Uses the Gemini model to provide answers based strictly on the provided context.
    """
    try:
        data = request.json
        api_key = data.get("api_key")
        
        if not api_key:
            return jsonify({"error": "API key is missing"}), 400

        client = genai.Client(api_key=api_key)
        
        # Extract necessary context from the request
        transcript = data.get("transcript", "")
        mom = data.get("mom", "No MOM generated yet.")
        action_items = data.get("action_items", "No Action Items generated yet.")
        insights = data.get("insights", "No insights generated yet.")
        question = data.get("question", "")
        model_name = data.get("model", "gemini-2.5-flash")

        # Construct the context-aware prompt
        prompt = f"""You are an AI assistant answering questions about a meeting.
Strictly base your answers on the following meeting context. If the answer is not in the context, say so politely.

MINUTES OF MEETING (MOM):
{mom}

ACTION ITEMS:
{action_items}

LIVE INSIGHTS / QUESTIONS RAISED:
{insights}

FULL TRANSCRIPT:
{transcript}

USER QUESTION: {question}
"""
        # Call the Gemini model
        response = client.models.generate_content(
            model=model_name,
            contents=prompt
        )
        
        return jsonify({"answer": response.text})
    
    except Exception as e:
        app.logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/transcribe_chunk", methods=["POST"])
def transcribe_chunk() -> Any:
    """
    Transcribe a 15-second audio chunk during the live meeting.
    Uses temperature=0.0 and specific instructions to prevent hallucination 
    and maintain speaker diarization accuracy.
    """
    try:
        data = request.json
        api_key = data.get("api_key")
        
        if not api_key:
            return jsonify({"error": "API key is missing"}), 400

        client = genai.Client(api_key=api_key)
        model_name = data.get("model", "gemini-2.5-flash")
        audio_bytes = base64.b64decode(data["audio_base64"])
        mime_type = data.get("mime_type", "audio/webm")
        history = data.get("history", "")

        # Only pass the most recent 2000 characters of history to provide context 
        # without exceeding context windows or confusing the model.
        recent_history = history[-2000:] if len(history) > 2000 else history

        history_context = ""
        if recent_history:
            history_context = f"\n\nHere is the RECENT transcript of the meeting so far. Use the names and context from this history to correctly identify the speakers in this new clip, but DO NOT REPEAT this history in your output:\n[RECENT MEETING HISTORY]\n{recent_history}\n[END RECENT HISTORY]\n\n"

        prompt = f"""You are a precise audio transcription bot. Your ONLY job is to transcribe the spoken words in the attached audio clip.

Please include speaker labels (e.g., **Speaker A:**, **Speaker B:**, or their actual names if known) for different voices you hear in this short clip.
{history_context}
You MUST insert a double line break (\\n\\n) every time a new speaker starts.
CRITICAL: If the audio is silent, just background noise, or contains no discernible human speech, YOU MUST OUTPUT EXACTLY the word: [SILENCE]. 
CRITICAL: ALWAYS write your output using English words and the English alphabet ONLY. If the speaker is speaking another language (like Hindi), transcribe it using the English alphabet (e.g., Hinglish) or translate it to English.
CRITICAL RULES TO PREVENT HALLUCINATIONS:
1. ONLY TRANSCRIBE THE NEW AUDIO CLIP. DO NOT REPEAT ANY TEXT FROM THE 'RECENT MEETING HISTORY' BLOCK.
2. If there is no speech, do NOT make up text. Do NOT hallucinate podcast intros, stories, or random speech. 
3. Only transcribe what you literally hear in the audio file right now."""

        # Generate transcription using strict constraints
        response = client.models.generate_content(
            model=model_name,
            contents=[types.Part.from_bytes(data=audio_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(
                temperature=0.0,
                system_instruction="You are a strict, precise audio transcriber. You NEVER hallucinate text. If the audio is silent, you output [SILENCE]. You NEVER repeat text from the prompt history."
            )
        )
        
        return jsonify({"transcript": response.text})
    
    except Exception as e:
        app.logger.error(f"Error in transcribe_chunk endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/transcribe", methods=["POST"])
def transcribe() -> Any:
    """
    Process the full meeting transcript at the end of the meeting.
    Generates three artifacts:
    1. Minutes of Meeting (MOM) / Executive Summary
    2. Action Items
    3. Follow-Up Email Draft
    """
    try:
        data = request.json
        if not data or "transcript_text" not in data:
            return jsonify({"error": "No transcript_text provided"}), 400

        api_key = data.get("api_key")
        if not api_key:
            return jsonify({"error": "API key is missing. Please provide it in the UI."}), 400

        client = genai.Client(api_key=api_key)
        model_name = data.get("model", "gemini-2.5-flash")
        transcript_text = data.get("transcript_text", "")
        meeting_name = data.get("meeting_name", "")
        today_date = datetime.now().strftime("%Y-%m-%d")
        meeting_name_line = f"Meeting Name: {meeting_name}\n" if meeting_name else ""

        # ---------------------------------------------------------
        # Prompts for Post-Meeting Artifact Generation
        # ---------------------------------------------------------
        prompt_mom = f"""Act as an expert executive assistant. I am providing you with the raw transcript from a recent meeting. 

Provide a thorough and impressive summary of this meeting. Create the format for your report in Markdown that best fits this type of meeting.

{meeting_name_line}Today's Date is {today_date}."""

        prompt_action_items = """You are an expert project manager.
Analyze this meeting transcript and extract ONLY the actionable items, tasks, and follow-ups.
Format it as a clean, highly readable Markdown list using the following structure for each item:

- **[Task]**: <Clear description of what needs to be done>
  - **Assignee**: <Who is doing this? Use speaker names if available, else Speaker A/B>
  - **Deadline / Timeline**: <When is it due? If not mentioned, say "Not specified">
  - **Context**: <1 brief sentence explaining why this task is needed based on the meeting>

CRITICAL: Identify exactly WHO is assigned to each task based on the conversation flow. If a speaker volunteers or is delegated a task, attribute it to them.
If there are absolutely no action items discussed, simply output "*No action items were identified in this meeting.*" """

        prompt_email = """Act as an expert executive assistant. I am providing you with the raw transcript from a recent meeting. Your task is to analyze this transcript and draft a highly professional, outcome-focused follow-up email to send to the team.

CRITICAL RULES:
1. Be objective and concise. Do not summarize the back-and-forth conversation or attribute points to specific speakers.
2. Focus strictly on the outcomes: what was decided and what are the next steps.
3. Use a polite and professional tone.
4. Format the output cleanly in Markdown, ready to be copy-pasted into an email client.
5. ALWAYS write your output using English words and the English alphabet ONLY. DO NOT output Devanagari script or any non-English characters.

REQUIRED TEMPLATE:

**Subject:** [Generate a concise, professional subject line based on the meeting]

Hi Team,

[Provide a polite greeting and a 1-2 sentence summary of the meeting's main objective and conclusion.]

**Key Decisions:**
[Provide a bulleted list of the final decisions or outcomes. Do not mention who said what.]

**Next Steps & Action Items:**
[Provide a bulleted list of action items, clearly stating the task and the owner. e.g., "- **[Owner]** to [Task] by [Deadline if known]"]

[Polite closing],
[Leave blank for me to sign]"""

        # Generate the three artifacts concurrently (or sequentially via await)
        response_mom = client.models.generate_content(
            model=model_name,
            contents=[prompt_mom, f"Here is the meeting transcript:\n\n{transcript_text}"]
        )

        response_action_items = client.models.generate_content(
            model=model_name,
            contents=[prompt_action_items, f"Here is the meeting transcript:\n\n{transcript_text}"]
        )

        response_email = client.models.generate_content(
            model=model_name,
            contents=[prompt_email, f"Here is the meeting transcript:\n\n{transcript_text}"]
        )

        # Save to SQLite
        try:
            conn = get_db_connection()
            title_to_save = meeting_name if meeting_name else f"Meeting on {today_date}"
            cursor = conn.execute(
                'INSERT INTO meetings (title, date, transcript, mom, action_items, email_draft) VALUES (?, ?, ?, ?, ?, ?)',
                (title_to_save, today_date, transcript_text, response_mom.text, response_action_items.text, response_email.text)
            )
            meeting_id = cursor.lastrowid
            conn.commit()
            conn.close()
        except Exception as db_err:
            app.logger.warning(f"Failed to save meeting to DB: {db_err}")
            meeting_id = None

        return jsonify({
            "id": meeting_id,
            "mom": response_mom.text,
            "transcript": transcript_text,
            "action_items": response_action_items.text,
            "email_draft": response_email.text
        })
        
    except Exception as e:
        app.logger.error(f"Error during post-meeting transcription processing: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/regenerate_mom', methods=['POST'])
def regenerate_mom():
    try:
        data = request.json
        if not data or "transcript_text" not in data:
            return jsonify({"error": "No transcript_text provided"}), 400

        api_key = data.get("api_key")
        if not api_key:
            return jsonify({"error": "API key is missing."}), 400

        client = genai.Client(api_key=api_key)
        model_name = data.get("model", "gemini-2.5-pro")
        transcript_text = data.get("transcript_text", "")
        meeting_name = data.get("meeting_name", "")
        custom_prompt = data.get("custom_prompt", "")
        
        today_date = datetime.now().strftime("%Y-%m-%d")
        meeting_name_line = f"Meeting Name: {meeting_name}\n" if meeting_name else ""
        
        final_prompt = f"""Act as an expert executive assistant. I am providing you with the raw transcript from a recent meeting. 

{custom_prompt}

{meeting_name_line}Today's Date is {today_date}."""

        response = client.models.generate_content(
            model=model_name,
            contents=[final_prompt, "--- START OF TRANSCRIPT ---", transcript_text, "--- END OF TRANSCRIPT ---"],
        )
        return jsonify({"mom": response.text})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



@app.route("/api/history", methods=["GET"])
def get_history():
    try:
        conn = get_db_connection()
        meetings = conn.execute('SELECT id, title, date, created_at FROM meetings ORDER BY created_at DESC').fetchall()
        conn.close()
        return jsonify([dict(m) for m in meetings])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/history/<int:meeting_id>", methods=["GET"])
def get_meeting(meeting_id):
    try:
        conn = get_db_connection()
        meeting = conn.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,)).fetchone()
        conn.close()
        if meeting is None:
            return jsonify({"error": "Meeting not found"}), 404
        return jsonify(dict(meeting))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
@app.route("/api/history/<int:meeting_id>", methods=["DELETE"])
def delete_meeting(meeting_id):
    try:
        conn = get_db_connection()
        conn.execute('DELETE FROM meetings WHERE id = ?', (meeting_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/history/<int:meeting_id>", methods=["PUT"])
def rename_meeting(meeting_id):
    try:
        data = request.json
        new_title = data.get("title")
        if not new_title:
            return jsonify({"error": "No title provided"}), 400
        
        conn = get_db_connection()
        conn.execute('UPDATE meetings SET title = ? WHERE id = ?', (new_title, meeting_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/suggest_questions", methods=["POST"])
def suggest_questions() -> Any:
    """
    Live Meeting Copilot Endpoint:
    Analyzes the most recent portion of the transcript to suggest an intelligent, 
    contextual follow-up question that the user can ask in the live meeting.
    Also tracks which questions have been successfully answered.
    """
    try:
        data = request.json
        api_key = data.get("api_key")
        transcript = data.get("transcript", "")
        silence_count = data.get("silence_count", 0)
        pending_questions = data.get("pending_questions", [])
        asked_questions = data.get("asked_questions", [])
        model_name = data.get("model", "gemini-2.5-flash")

        if not api_key:
            return jsonify({"error": "No API key provided"}), 400
            
        # Return empty state if the transcript is entirely empty
        if not transcript.strip():
            return jsonify({"suggestion": "[NONE]", "answered_questions": []})

        client = genai.Client(api_key=api_key)

        # Truncate transcript to the last ~4000 characters to focus ONLY on recent topics
        recent_transcript = transcript[-4000:] if len(transcript) > 4000 else transcript

        # Format pending and previously asked questions for the prompt
        pending_str = "\n".join([f"- {q}" for q in pending_questions]) if pending_questions else "None"
        asked_str = "\n".join([f"- {q}" for q in asked_questions]) if asked_questions else "None"

        prompt = f"""You are an AI Meeting Copilot. You have two tasks:
1. Review the 'Pending Questions' list. If the 'Recent Transcript' clearly answers any of these questions, list them in the 'answered_questions' array. Provide the exact question text and a short summary of the answer given in the meeting.
2. Generate 1 new highly intelligent, clarifying question the user could ask right now about the MOST RECENT topic being discussed. Keep it under 15 words.
   - If the meeting has fallen silent ({silence_count} consecutive silences), suggest a pivot question to break the silence.
   - If there is no logical clarifying question to ask (e.g. small talk), output exactly: "[NONE]" for the suggestion.
   - CRITICAL: Do NOT generate any question that is similar to the questions in the 'Previously Asked Questions' list.

Previously Asked Questions:
{asked_str}

Pending Questions (to check for answers):
{pending_str}

Recent Transcript:
{recent_transcript}

CRITICAL: You MUST output a valid JSON object EXACTLY like this:
{{
  "suggestion": "your suggested question or [NONE]",
  "answered_questions": [
    {{"question": "exact text of answered question 1", "answer": "short summary of the answer"}},
    {{"question": "exact text of answered question 2", "answer": "short summary of the answer"}}
  ]
}}"""

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
        
        try:
            result = json.loads(raw_text)
        except json.JSONDecodeError:
            app.logger.warning(f"Failed to parse JSON from AI: {raw_text}")
            result = {"suggestion": "[NONE]", "answered_questions": []}

        return jsonify({
            "suggestion": result.get("suggestion", "[NONE]"),
            "answered_questions": result.get("answered_questions", [])
        })
        
    except Exception as e:
        app.logger.error(f"Error in suggest_questions endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Run the application
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting production-ready server on port {port}")
    
    # In a true production environment, gunicorn is used (as defined in Dockerfile).
    # This run block is primarily used for local development.
    app.run(host="0.0.0.0", port=port, debug=True)
