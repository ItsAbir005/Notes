import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from pymongo import MongoClient
from datetime import datetime, timedelta
from bson.objectid import ObjectId
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask_bcrypt import Bcrypt
import jwt
import os
from functools import wraps
import requests

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")
bcrypt = Bcrypt(app)

JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
if not JWT_SECRET_KEY:
    print("Error: JWT_SECRET_KEY environment variable not set. Please set it for JWT functionality.")

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_MODEL_NAME = os.getenv('GEMINI_MODEL_NAME', 'gemini-2.0-flash')
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY environment variable not set. AI features (Gemini) will not work.")

MONGO_URI = os.getenv('MONGO_URI')
DB_NAME = "notes_app"
COLLECTION_NAME_NOTES = "notes"
COLLECTION_NAME_USERS = "users"

client = None
db = None
notes_collection = None
users_collection = None

if not MONGO_URI:
    print("Error: MONGO_URI environment variable not set. Cannot connect to MongoDB.")
else:
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        notes_collection = db[COLLECTION_NAME_NOTES]
        users_collection = db[COLLECTION_NAME_USERS]
        client.admin.command('ping')
        print("Successfully connected to MongoDB Atlas!")
    except Exception as e:
        print(f"Error connecting to MongoDB Atlas: {e}")
        client = None

@app.route("/")
def hello_world():
    return "Hello, Flask Backend! (Notes API is at /notes)"

# --- User Authentication Routes ---
@app.route('/register', methods=['POST'])
def register_user():
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500

    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if users_collection.find_one({"username": username}):
        return jsonify({"error": "Username already exists"}), 409

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    users_collection.insert_one({"username": username, "password": hashed_password})

    return jsonify({"message": "User registered successfully"}), 201

@app.route('/login', methods=['POST'])
def login_user():
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    if not JWT_SECRET_KEY:
        return jsonify({"error": "JWT_SECRET_KEY not configured on server"}), 500

    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = users_collection.find_one({"username": username})

    if user and bcrypt.check_password_hash(user['password'], password):
        token_payload = {
            'user_id': str(user['_id']),
            'username': user['username'],
            'exp': datetime.utcnow() + timedelta(days=1)
        }
        token = jwt.encode(token_payload, JWT_SECRET_KEY, algorithm='HS256')
        
        return jsonify({"message": "Login successful", "token": token, "user_id": str(user['_id'])}), 200
    else:
        return jsonify({"error": "Invalid username or password"}), 401

# --- Auth Decorator ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            return jsonify({"message": "Token is missing!"}), 401
        
        if not JWT_SECRET_KEY:
            return jsonify({"message": "Server error: JWT_SECRET_KEY not configured"}), 500

        try:
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            current_user = users_collection.find_one({"_id": ObjectId(data['user_id'])})
            if not current_user:
                return jsonify({"message": "Token is invalid or user not found!"}), 401
            request.current_user = current_user 
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token has expired!"}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({"message": f"Token is invalid: {e}"}), 401
        except Exception as e:
            return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

        return f(*args, **kwargs)
    return decorated

# --- Protected Note Routes ---
@app.route("/notes", methods=["GET"])
@token_required
def get_notes():
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    
    user_id = str(request.current_user['_id'])
    notes = []
    for note in notes_collection.find({"user_id": user_id}).sort("createdAt", -1):
        note["_id"] = str(note["_id"])
        if isinstance(note.get("createdAt"), datetime):
            note["createdAt"] = note["createdAt"].strftime("%a, %d %b %Y %H:%M:%S GMT")
        notes.append(note)
    return jsonify(notes), 200

@app.route("/notes/<id>", methods=["GET"])
@token_required
def get_note_by_id(id):
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    try:
        object_id = ObjectId(id)
        user_id = str(request.current_user['_id'])
        note = notes_collection.find_one({"_id": object_id, "user_id": user_id})
        if note:
            note["_id"] = str(note["_id"])
            if isinstance(note.get("createdAt"), datetime):
                note["createdAt"] = note["createdAt"].strftime("%a, %d %b %Y %H:%M:%S GMT")
            return jsonify(note), 200
        else:
            return jsonify({"error": "Note not found or not authorized"}), 404
    except Exception as e:
        return jsonify({"error": f"Invalid ID format: {e}"}), 400

@app.route("/notes", methods=["POST"])
@token_required
def add_note():
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500

    data = request.get_json()
    if not data or not data.get("title") or not data.get("content"):
        return jsonify({"error": "Title and content are required"}), 400

    new_note = {
        "title": data["title"],
        "content": data["content"],
        "createdAt": datetime.utcnow(),
        "user_id": str(request.current_user['_id'])
    }
    result = notes_collection.insert_one(new_note)

    new_note["_id"] = str(result.inserted_id)
    new_note["createdAt"] = new_note["createdAt"].strftime("%a, %d %b %Y %H:%M:%S GMT")
    
    socketio.emit('note_created', new_note, room=str(request.current_user['_id']))
    print(f"Emitted 'note_created' for ID: {new_note['_id']}")

    return jsonify(new_note), 201

@app.route("/notes/<id>", methods=["PUT"])
@token_required
def update_note(id):
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    try:
        object_id = ObjectId(id)
        data = request.get_json()
        
        update_fields = {}
        if "title" in data:
            update_fields["title"] = data["title"]
        if "content" in data:
                update_fields["content"] = data["content"]
        
        if not update_fields:
            return jsonify({"error": "No fields provided for update"}), 400

        query = {"_id": object_id, "user_id": str(request.current_user['_id'])}

        result = notes_collection.update_one(
            query,
            {"$set": update_fields}
        )

        if result.modified_count == 1:
            updated_note = notes_collection.find_one({"_id": object_id})
            updated_note["_id"] = str(updated_note["_id"])
            if isinstance(updated_note.get("createdAt"), datetime):
                updated_note["createdAt"] = updated_note["createdAt"].strftime("%a, %d %b %Y %H:%M:%S GMT")
            
            socketio.emit('note_updated', updated_note, room=str(request.current_user['_id']))
            print(f"Emitted 'note_updated' for ID: {updated_note['_id']}")

            return jsonify(updated_note), 200
        else:
            return jsonify({"error": "Note not found or not authorized to update"}), 404
    except Exception as e:
        return jsonify({"error": f"Invalid ID format or update failed: {e}"}), 400

@app.route("/notes/<id>", methods=["DELETE"])
@token_required
def delete_note(id):
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    try:
        object_id = ObjectId(id)
        
        query = {"_id": object_id, "user_id": str(request.current_user['_id'])}

        result = notes_collection.delete_one(query)
        if result.deleted_count == 1:
            socketio.emit('note_deleted', {'id': id, 'user_id': str(request.current_user['_id'])}, room=str(request.current_user['_id']))
            print(f"Emitted 'note_deleted' for ID: {id}")

            return jsonify({"message": "Note deleted successfully"}), 200
        else:
            return jsonify({"error": "Note not found or not authorized to delete"}), 404
    except Exception as e:
        return jsonify({"error": f"Invalid ID format or deletion failed: {e}"}), 500

# --- SocketIO Event Handlers ---
from flask_socketio import join_room, leave_room
@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            user_id = payload.get('user_id')
            if user_id:
                join_room(user_id)
                print(f"Client connected and joined room: {user_id}")
            else:
                print("Client connected, but user_id missing in token payload.")
            # No need to disconnect here, just log
        except jwt.ExpiredSignatureError:
            print("Client connected with expired token.")
        except jwt.InvalidTokenError:
            print("Client connected with invalid token.")
        except Exception as e:
            print(f"Error handling connect with token: {e}")
    else:
        print("Client connected (no token provided or invalid format)")


@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected from SocketIO')


# --- Gemini AI Endpoints ---
@app.route("/notes/<id>/summarize", methods=["POST"])
@token_required
def summarize_note(id):
    if client is None:
        return jsonify({"error": "Database connection not established"}), 500
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API key not configured on server"}), 500

    try:
        object_id = ObjectId(id)
        user_id = str(request.current_user['_id'])
        note = notes_collection.find_one({"_id": object_id, "user_id": user_id})

        if not note:
            return jsonify({"error": "Note not found or not authorized"}), 404

        note_content = note.get('content', '')
        if not note_content:
            return jsonify({"error": "Note has no content to summarize"}), 400

        prompt = f"Summarize the following note content concisely:\n\n{note_content}"
        
        headers = {
            'Content-Type': 'application/json'
        }
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "topP": 0.95,
                "topK": 40,
                "maxOutputTokens": 500
            }
        }
        
        gemini_url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
        
        response = requests.post(gemini_url, headers=headers, json=payload)
        response.raise_for_status()
        
        gemini_result = response.json()
        
        summary = "No summary generated."
        if gemini_result and gemini_result.get('candidates'):
            first_candidate = gemini_result['candidates'][0]
            if first_candidate.get('content') and first_candidate['content'].get('parts'):
                summary = first_candidate['content']['parts'][0].get('text', summary)

        return jsonify({"summary": summary}), 200

    except requests.exceptions.RequestException as req_err:
        print(f"Error calling Gemini API: {req_err}")
        return jsonify({"error": f"Failed to connect to AI service: {req_err}. Check API key and network."}), 500
    except Exception as e:
        print(f"Error summarizing note: {e}")
        return jsonify({"error": f"An error occurred during summarization: {e}"}), 500

    @app.route("/notes/<id>/ask-ai", methods=["POST"])
    @token_required
    def ask_ai_about_note(id):
        if client is None:
            return jsonify({"error": "Database connection not established"}), 500
        if not GEMINI_API_KEY:
            return jsonify({"error": "Gemini API key not configured on server"}), 500

        data = request.get_json()
        user_query = data.get('query')

        if not user_query:
            return jsonify({"error": "Query is required"}), 400

        try:
            object_id = ObjectId(id)
            user_id = str(request.current_user['_id'])
            note = notes_collection.find_one({"_id": object_id, "user_id": user_id})

            if not note:
                return jsonify({"error": "Note not found or not authorized"}), 404

            note_content = note.get('content', '')
            
            prompt = f"Given the following note content: \"\"\"{note_content}\"\"\"\n\nAnswer the following question about it: \"{user_query}\""
            
            headers = {
                'Content-Type': 'application/json'
            }
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "topP": 0.95,
                    "topK": 40,
                    "maxOutputTokens": 500
                }
            }
            
            gemini_url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
            
            response = requests.post(gemini_url, headers=headers, json=payload)
            response.raise_for_status()
            
            gemini_result = response.json()
            
            ai_answer = "No answer generated."
            if gemini_result and gemini_result.get('candidates'):
                first_candidate = gemini_result['candidates'][0]
                if first_candidate.get('content') and first_candidate['content'].get('parts'):
                    ai_answer = first_candidate['content']['parts'][0].get('text', ai_answer)

            return jsonify({"answer": ai_answer}), 200

        except requests.exceptions.RequestException as req_err:
            print(f"Error calling Gemini API: {req_err}")
            return jsonify({"error": f"Failed to connect to AI service: {req_err}. Check API key and network."}), 500
        except Exception as e:
            print(f"Error asking AI about note: {e}")
            return jsonify({"error": f"An error occurred during AI interaction: {e}"}), 500

    # Removed: @app.route("/transcribe-audio", methods=["POST"]) and its function


    if __name__ == "__main__":
        socketio.run(app, host="0.0.0.0", port=5000, debug=True)
    