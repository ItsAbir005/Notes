document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired. Script is starting execution.');

    const backendUrl = 'http://localhost:5000'; // Your Flask backend URL
    
    // Auth elements
    const authSection = document.getElementById('auth-section');
    const registerFormContainer = document.getElementById('register-form-container');
    const loginFormContainer = document.getElementById('login-form-container');
    const showLoginLink = document.getElementById('show-login');
    const showRegisterLink = document.getElementById('show-register');
    const registerUsernameInput = document.getElementById('register-username');
    const registerPasswordInput = document.getElementById('register-password');
    const registerBtn = document.getElementById('register-btn');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const registerErrorMessage = document.getElementById('register-error-message');
    const loginErrorMessage = document.getElementById('login-error-message');

    // Notes App elements
    const notesAppSection = document.getElementById('notes-app-section');
    const currentUsernameSpan = document.getElementById('current-username');
    const logoutBtn = document.getElementById('logout-btn');
    const notesList = document.getElementById('notes-list');
    const newNoteTitleInput = document.getElementById('new-note-title');
    const newNoteContentInput = document.getElementById('new-note-content');
    const addNoteBtn = document.getElementById('add-note-btn');
    const voiceInputBtn = document.getElementById('voice-input-btn');
    const recordingStatus = document.getElementById('recording-status');
    const transcribingStatus = document = document.getElementById('transcribing-status'); // Will be used for "Listening..."

    const loadingMessage = document.getElementById('loading-message');
    const fetchErrorMessage = document.getElementById('fetch-error-message');
    const addErrorMessage = document.getElementById('add-error-message');

    // AI Modal Elements
    const aiModal = document.createElement('div');
    aiModal.id = 'ai-modal';
    aiModal.style.cssText = `
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.4);
        justify-content: center;
        align-items: center;
    `;
    document.body.appendChild(aiModal);

    const aiModalContent = document.createElement('div');
    aiModalContent.id = 'ai-modal-content';
    aiModalContent.style.cssText = `
        background-color: #fefefe;
        margin: auto;
        padding: 20px;
        border: 1px solid #888;
        width: 80%;
        max-width: 600px;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        position: relative;
    `;
    aiModal.appendChild(aiModalContent);

    const aiModalCloseBtn = document.createElement('span');
    aiModalCloseBtn.textContent = '×';
    aiModalCloseBtn.style.cssText = `
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
        position: absolute;
        top: 10px;
        right: 20px;
        cursor: pointer;
    `;
    aiModalCloseBtn.onclick = () => aiModal.style.display = 'none';
    aiModalContent.appendChild(aiModalCloseBtn);

    const aiModalTitle = document.createElement('h2');
    aiModalTitle.id = 'ai-modal-title';
    aiModalContent.appendChild(aiModalTitle);

    const aiModalBody = document.createElement('div');
    aiModalBody.id = 'ai-modal-body';
    aiModalBody.style.cssText = `
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #eee;
        max-height: 400px;
        overflow-y: auto;
    `;
    aiModalContent.appendChild(aiModalBody);


    let userToken = localStorage.getItem('jwt_token');
    let currentUsername = localStorage.getItem('username');
    let currentUser_id = localStorage.getItem('user_id');
    let socket;
    
    // --- Utility Functions ---
    const showErrorMessage = (element, message) => {
        element.textContent = message;
        element.style.display = 'block';
    };

    const hideErrorMessage = (element) => {
        element.style.display = 'none';
        element.textContent = '';
    };

    const showNotesApp = () => {
        authSection.style.display = 'none';
        notesAppSection.style.display = 'block';
        currentUsernameSpan.textContent = currentUsername;
        fetchNotes();
        connectSocketIO();
    };

    const showAuthForms = () => {
        authSection.style.display = 'block';
        notesAppSection.style.display = 'none';
        registerUsernameInput.value = '';
        registerPasswordInput.value = '';
        loginUsernameInput.value = '';
        loginPasswordInput.value = '';
        hideErrorMessage(registerErrorMessage);
        hideErrorMessage(loginErrorMessage);
    };

    // --- Authentication Logic ---
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.style.display = 'none';
        loginFormContainer.style.display = 'block';
        hideErrorMessage(registerErrorMessage);
    });

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.style.display = 'none';
        registerFormContainer.style.display = 'block';
        hideErrorMessage(loginErrorMessage);
    });

    registerBtn.addEventListener('click', async () => {
        const username = registerUsernameInput.value.trim();
        const password = registerPasswordInput.value.trim();
        if (!username || !password) {
            showErrorMessage(registerErrorMessage, "Username and password are required.");
            return;
        }
        hideErrorMessage(registerErrorMessage);

        try {
            const response = await fetch(`${backendUrl}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Registration failed.");
            }
            alert("Registration successful! Please log in.");
            registerFormContainer.style.display = 'none';
            loginFormContainer.style.display = 'block';
            loginUsernameInput.value = username;
        } catch (error) {
            console.error('Registration error:', error);
            showErrorMessage(registerErrorMessage, `Registration failed: ${error.message}`);
        }
    });

    loginBtn.addEventListener('click', async () => {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();
        if (!username || !password) {
            showErrorMessage(loginErrorMessage, "Username and password are required.");
            return;
        }
        hideErrorMessage(loginErrorMessage);

        try {
            const response = await fetch(`${backendUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Login failed.");
            }
            const data = await response.json();
            userToken = data.token;
            currentUsername = username;
            currentUser_id = data.user_id;
            localStorage.setItem('jwt_token', userToken);
            localStorage.setItem('username', currentUsername);
            localStorage.setItem('user_id', currentUser_id);
            showNotesApp();
        } catch (error) {
            console.error('Login error:', error);
            showErrorMessage(loginErrorMessage, `Login failed: ${error.message}`);
        }
    });

    logoutBtn.addEventListener('click', () => {
        userToken = null;
        currentUsername = null;
        currentUser_id = null;
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('username');
        localStorage.removeItem('user_id');
        if (socket) {
            socket.disconnect();
        }
        showAuthForms();
    });

    // --- Socket.IO Client Setup ---
    const connectSocketIO = () => {
        if (!socket || !socket.connected) {
            socket = io(backendUrl, {
                query: { token: userToken }
            }); 

            socket.on('connect', () => {
                console.log('Connected to Socket.IO server!');
            });

            socket.on('disconnect', () => {
                console.log('Disconnected from Socket.IO server.');
            });

            socket.on('note_created', (note) => {
                console.log('Socket.IO: Note created received', note);
                if (note.user_id === currentUser_id) {
                     const noNotesMsg = notesList.querySelector('p');
                    if (noNotesMsg && noNotesMsg.textContent === 'No notes available. Add a new one!') {
                        notesList.innerHTML = '';
                    }
                    const noteItem = createNoteItemElement(note);
                    notesList.prepend(noteItem);
                }
            });

            socket.on('note_updated', (updatedNote) => {
                console.log('Socket.IO: Note updated received', updatedNote);
                if (updatedNote.user_id === currentUser_id) {
                    const existingNoteItem = notesList.querySelector(`[data-id="${updatedNote._id}"]`);
                    if (existingNoteItem) {
                        existingNoteItem.querySelector('h3').textContent = updatedNote.title;
                        existingNoteItem.querySelector('p').textContent = updatedNote.content;
                        existingNoteItem.querySelector('small').textContent = `Created: ${updatedNote.createdAt}`;
                        const editFields = existingNoteItem.querySelector('.edit-fields');
                        if (editFields.classList.contains('active')) {
                            editFields.classList.remove('active');
                        }
                    }
                }
            });

            socket.on('note_deleted', (data) => {
                console.log('Socket.IO: Note deleted received', data);
                if (data.user_id === currentUser_id) {
                    const deletedNoteId = data.id;
                    const noteItemToRemove = notesList.querySelector(`[data-id="${deletedNoteId}"]`);
                    if (noteItemToRemove) {
                        noteItemToRemove.remove();
                        if (notesList.children.length === 0) {
                            notesList.innerHTML = '<p>No notes available. Add a new one!</p>';
                        }
                    }
                }
            });
        }
    };

    // --- Note CRUD Logic ---
    const fetchNotes = async () => {
        notesList.innerHTML = '';
        loadingMessage.style.display = 'block';
        hideErrorMessage(fetchErrorMessage);

        try {
            const response = await fetch(`${backendUrl}/notes`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            if (!response.ok) {
                if (response.status === 401) {
                    alert("Session expired. Please log in again.");
                    logoutBtn.click();
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const notes = await response.json();
            loadingMessage.style.display = 'none';

            if (notes.length === 0) {
                notesList.innerHTML = '<p>No notes available. Add a new one!</p>';
            } else {
                notes.forEach(note => {
                    notesList.appendChild(createNoteItemElement(note));
                });
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
            loadingMessage.style.display = 'none';
            showErrorMessage(fetchErrorMessage, `Error loading notes: ${error.message}. Please ensure you are logged in.`);
        }
    };

    const createNoteItemElement = (note) => {
        const noteItem = document.createElement('li');
        noteItem.className = 'note-item';
        noteItem.dataset.id = note._id;

        noteItem.innerHTML = `
            <h3>${note.title}</h3>
            <p>${note.content}</p>
            <small>Created: ${note.createdAt}</small>
            <div class="actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
                <button class="summarize-btn">Summarize (AI)</button>
                <button class="ask-ai-btn">Ask AI</button>
            </div>
            <div class="edit-fields">
                <input type="text" class="edit-title" value="${note.title}" placeholder="New title">
                <textarea class="edit-content" rows="3" placeholder="New content">${note.content}</textarea>
                <button class="save-edit-btn">Save</button>
                <button class="cancel-edit-btn">Cancel</button>
            </div>
        `;
        noteItem.querySelector('.edit-btn').addEventListener('click', () => toggleEditFields(noteItem));
        noteItem.querySelector('.delete-btn').addEventListener('click', () => deleteNote(note._id, noteItem));
        noteItem.querySelector('.save-edit-btn').addEventListener('click', () => saveEdit(note._id, noteItem));
        noteItem.querySelector('.cancel-edit-btn').addEventListener('click', () => toggleEditFields(noteItem));
        
        noteItem.querySelector('.summarize-btn').addEventListener('click', () => summarizeNote(note._id, note.title));
        noteItem.querySelector('.ask-ai-btn').addEventListener('click', () => showAskAiModal(note._id, note.title));
        
        return noteItem;
    };


    const toggleEditFields = (noteItem) => {
        const editFields = noteItem.querySelector('.edit-fields');
        editFields.classList.toggle('active');
        if (!editFields.classList.contains('active')) {
            const originalTitle = noteItem.querySelector('h3').textContent;
            const originalContent = noteItem.querySelector('p').textContent;
            noteItem.querySelector('.edit-title').value = originalTitle;
            noteItem.querySelector('.edit-content').value = originalContent;
        }
    };

    addNoteBtn.addEventListener('click', async () => {
        const title = newNoteTitleInput.value.trim();
        const content = newNoteContentInput.value.trim();

        if (!title || !content) {
            showErrorMessage(addErrorMessage, "Title and content cannot be empty.");
            return;
        }
        hideErrorMessage(addErrorMessage);

        try {
            const response = await fetch(`${backendUrl}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({ title, content }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                 if (response.status === 401) {
                    alert("Session expired. Please log in again.");
                    logoutBtn.click();
                    return;
                }
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            newNoteTitleInput.value = '';
            newNoteContentInput.value = '';
        } catch (error) {
            console.error('Error adding note:', error);
            showErrorMessage(addErrorMessage, `Error adding note: ${error.message}`);
        }
    });

    const saveEdit = async (id, noteItem) => {
        const newTitle = noteItem.querySelector('.edit-title').value.trim();
        const newContent = noteItem.querySelector('.edit-content').value.trim();

        if (!newTitle || !newContent) {
            alert("Title and content cannot be empty.");
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/notes/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({ title: newTitle, content: newContent }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                 if (response.status === 401) {
                    alert("Session expired. Please log in again.");
                    logoutBtn.click();
                    return;
                }
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error updating note:', error);
            alert(`Error updating note: ${error.message}`);
        }
    };

    const deleteNote = async (id, noteItem) => {
        if (!confirm('Are you sure you want to delete this note?')) {
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/notes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${userToken}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                 if (response.status === 401) {
                    alert("Session expired. Please log in again.");
                    logoutBtn.click();
                    return;
                }
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            alert(`Error deleting note: ${error.message}`);
        }
    };

    // --- AI Integration Functions ---
    const showAiModal = (title, content) => {
        aiModalTitle.textContent = title;
        aiModalBody.innerHTML = content;
        aiModal.style.display = 'flex';
    };

    const summarizeNote = async (noteId, noteTitle) => {
        showAiModal(`Summarizing: ${noteTitle}`, '<h3>Loading summary...</h3>');
        try {
            const response = await fetch(`${backendUrl}/notes/${noteId}/summarize`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to summarize: ${response.status}`);
            }
            const data = await response.json();
            aiModalBody.innerHTML = `<h3>Summary:</h3><p>${data.summary}</p>`;
        } catch (error) {
            console.error('Summarization error:', error);
            aiModalBody.innerHTML = `<p style="color: red;">Error summarizing note: ${error.message}</p>`;
        }
    };

    const showAskAiModal = (noteId, noteTitle) => {
        aiModalTitle.textContent = `Ask AI about: ${noteTitle}`;
        aiModalBody.innerHTML = `
            <div id="ai-chat-history" style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 5px; margin-bottom: 10px;"></div>
            <textarea id="ai-query-input" placeholder="Type your question..." rows="3" style="width: calc(100% - 22px); margin-top: 10px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 1em;"></textarea>
            <button id="ai-send-query-btn" style="padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1em; margin-top: 10px;">Send</button>
            <div id="ai-response-loading" style="display: none; margin-top: 10px; font-style: italic; color: #555;">Thinking...</div>
        `;
        aiModal.style.display = 'flex';

        const aiQueryInput = document.getElementById('ai-query-input');
        const aiSendQueryBtn = document.getElementById('ai-send-query-btn');
        const aiChatHistory = document.getElementById('ai-chat-history');
        const aiResponseLoading = document.getElementById('ai-response-loading');

        aiSendQueryBtn.addEventListener('click', async () => {
            const query = aiQueryInput.value.trim();
            if (!query) return;

            aiChatHistory.innerHTML += `<p><strong>You:</strong> ${query}</p>`;
            aiQueryInput.value = '';
            aiResponseLoading.style.display = 'block';

            try {
                const response = await fetch(`${backendUrl}/notes/${noteId}/ask-ai`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query: query })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to get AI answer: ${response.status}`);
                }
                const data = await response.json();
                aiChatHistory.innerHTML += `<p><strong>AI:</strong> ${data.answer}</p>`;
            } catch (error) {
                console.error('AI chat error:', error);
                aiChatHistory.innerHTML += `<p style="color: red;"><strong>AI Error:</strong> ${error.message}</p>`;
            } finally {
                aiResponseLoading.style.display = 'none';
                aiChatHistory.scrollTop = aiChatHistory.scrollHeight; // Scroll to bottom
            }
        });
    };

    // --- Web Speech API (SpeechRecognition) Logic ---
    // Check for browser compatibility
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    // const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList; // Not used, can remove
    // const SpeechRecognitionEvent = window.SpeechRecognitionEvent || window.webkitSpeechRecognitionEvent; // Not used, can remove

    let recognition;
    let isRecognizing = false;
    let accumulatedTranscript = ''; // New: To hold the complete transcription

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true; // Keep listening until stopped
        recognition.interimResults = true; // Show results as they come in
        recognition.lang = 'en-US'; // Set language

        // Event handler for when recognition starts
        recognition.onstart = () => {
            isRecognizing = true;
            accumulatedTranscript = ''; // Clear previous transcription on start
            recordingStatus.style.display = 'inline';
            recordingStatus.textContent = 'Listening...';
            voiceInputBtn.textContent = 'Stop Listening';
            voiceInputBtn.disabled = false;
            transcribingStatus.style.display = 'none';
            newNoteContentInput.value = ''; // Clear content for new transcription
            newNoteTitleInput.value = 'Voice Note ' + new Date().toLocaleTimeString();
            hideErrorMessage(addErrorMessage);
            console.log('Speech recognition started.');
        };

        // Event handler for results
        recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    accumulatedTranscript += event.results[i][0].transcript + ' '; // Append final results
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            // Update the textarea with accumulated final and current interim results
            newNoteContentInput.value = accumulatedTranscript + interimTranscript;
            console.log('Interim:', interimTranscript, 'Final Accumulated:', accumulatedTranscript);
        };

        // Event handler for when recognition ends
        recognition.onend = () => {
            isRecognizing = false;
            recordingStatus.style.display = 'none';
            recordingStatus.textContent = 'Recording...'; // Reset text
            voiceInputBtn.textContent = 'Voice Input';
            voiceInputBtn.disabled = false;
            transcribingStatus.style.display = 'none';
            console.log('Speech recognition ended.');
            // Ensure the final accumulated transcript is in the input field
            newNoteContentInput.value = accumulatedTranscript.trim(); 
        };

        // Event handler for errors
        recognition.onerror = (event) => {
            isRecognizing = false;
            recordingStatus.style.display = 'none';
            voiceInputBtn.textContent = 'Voice Input';
            voiceInputBtn.disabled = false;
            transcribingStatus.style.display = 'none';
            console.error('Speech recognition error:', event.error);
            alert(`Speech recognition error: ${event.error}. Please check microphone and permissions.`);
        };

        voiceInputBtn.addEventListener('click', () => {
            if (isRecognizing) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

    } else {
        // Browser does not support Web Speech API
        voiceInputBtn.disabled = true;
        voiceInputBtn.textContent = 'Voice Input (Not Supported)';
        alert('Your browser does not support Web Speech API. Please use Chrome or Edge for this feature.');
        console.warn('Web Speech API (SpeechRecognition) not supported in this browser.');
    }


    // --- Initial Check on Load ---
    if (userToken && currentUsername) {
        if (!currentUser_id) {
            try {
                const decodedToken = JSON.parse(atob(userToken.split('.')[1]));
                currentUser_id = decodedToken.user_id;
                localStorage.setItem('user_id', currentUser_id);
                console.log("currentUser_id re-established from token on load:", currentUser_id);
            } catch (e) {
                console.error("Error decoding token from localStorage on load:", e);
                logoutBtn.click();
            }
        }
        showNotesApp();
    } else {
        showAuthForms();
    }
});
