My Notes App
A full-stack, real-time notes application with user authentication, AI-powered features, and voice input, all containerized with Docker.

✨ Features
User Authentication: Secure registration and login system using JWTs and Bcrypt for password hashing.

Personalized Notes: Create, view, edit, and delete notes, with each note securely linked to the authenticated user.

Real-time Updates: Instantly synchronize note changes across all active browser tabs/devices for a logged-in user using Socket.IO.

AI-Powered Summarization: Get concise summaries of your notes using the Google Gemini API.

AI-Powered Chat: Ask questions to an AI about the content of a specific note using the Google Gemini API.

Voice Input: Transcribe your spoken words directly into the note content field using the browser's native Web Speech API.

Containerized Environment: Frontend and Backend services run in isolated Docker containers for easy setup and deployment.

🚀 Tech Stack
Backend:

Python: Programming Language

Flask: Web Framework

Flask-SocketIO: Real-time communication

Flask-Bcrypt: Password hashing

PyJWT: JSON Web Token authentication

PyMongo: MongoDB driver

Requests: HTTP client for external API calls (Gemini)

Frontend:

HTML5: Structure

CSS3: Styling

Vanilla JavaScript: Core logic and DOM manipulation

Socket.IO Client: Real-time communication

Web Speech API: Browser-native voice input

Database:

MongoDB Atlas: Cloud-hosted NoSQL document database

Containerization & Deployment:

Docker: Containerization platform

Docker Compose: Multi-container orchestration

Nginx: Lightweight web server for serving frontend static files (within Docker)

AI Integration:

Google Gemini API: For AI summarization and chat
