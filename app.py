from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
load_dotenv()  # Load .env file for local development

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the HTML frontend

# Read API key from environment variable (set GEMINI_API_KEY in your system or .env file)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-pro-exp-02-05",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro"
]

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    if not data or 'userText' not in data or 'systemPrompt' not in data:
        return jsonify({"error": "Missing userText or systemPrompt"}), 400

    userText = data['userText']
    systemPrompt = data['systemPrompt']

    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "systemInstruction": {"parts": [{"text": systemPrompt}]},
            "contents": [{"role": "user", "parts": [{"text": userText}]}],
            "generationConfig": {"temperature": 0.75, "maxOutputTokens": 512}
        }
        
        try:
            response = requests.post(url, json=payload)
            if response.status_code == 200:
                # Successfully received response
                print(f"Successfully generated response using model: {model}")
                return jsonify(response.json())
            print(f"Model {model} failed: {response.text}")
        except Exception as e:
            print(f"Network error with model {model}: {str(e)}")
            
    return jsonify({"error": "All Gemini models failed to respond."}), 500

if __name__ == '__main__':
    # Run the server on localhost:5000
    app.run(host='127.0.0.1', port=5000, debug=True)
