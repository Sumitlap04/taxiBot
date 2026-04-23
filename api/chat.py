import json
import os
import urllib.request
import urllib.error

# Read API key from Vercel environment variable (set in Vercel dashboard)
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


def handler(request):
    """Vercel Serverless Function handler for /api/chat"""
    from http.server import BaseHTTPRequestHandler

    # Handle CORS preflight
    if request.method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    if request.method != "POST":
        return {
            "statusCode": 405,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Method not allowed"}),
        }

    try:
        body = json.loads(request.body)
    except Exception:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    user_text = body.get("userText")
    system_prompt = body.get("systemPrompt")

    if not user_text or not system_prompt:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Missing userText or systemPrompt"}),
        }

    # Try each Gemini model in order (newest first)
    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": 0.75, "maxOutputTokens": 512},
        }).encode("utf-8")

        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin": "*",
                            "Content-Type": "application/json",
                        },
                        "body": json.dumps(data),
                    }
        except urllib.error.HTTPError:
            continue
        except Exception:
            continue

    return {
        "statusCode": 500,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"error": "All Gemini models failed to respond."}),
    }
