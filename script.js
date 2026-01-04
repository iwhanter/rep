const peer = new Peer(); 
let conn;

// 1. Получаем свой ID от сервера PeerJS
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
});

// 2. Ждем входящее соединение
peer.on('connection', (connection) => {
    if (conn) conn.close(); // Защита от дублей
    conn = connection;
    setupChat();
});

// 3. Подключаемся к другу
function connectToFriend() {
    const remoteId = document.getElementById('remote-id').value;
    if (!remoteId) return alert("Введите ID!");
    
    conn = peer.connect(remoteId);
    
    conn.on('open', () => {
        // Отправляем секретное рукопожатие для проверки пароля
        const pass = document.getElementById('chat-password').value;
        const authSignal = CryptoJS.AES.encrypt("AUTH_OK", pass).toString();
        conn.send({ type: 'auth', data: authSignal });
        setupChat();
    });
}

// 4. Логика обработки данных
function setupChat() {
    conn.on('data', (payload) => {
        const pass = document.getElementById('chat-password').value;

        // Обработка разных типов данных
        switch(payload.type) {
            case 'auth':
                handleAuth(payload.data, pass);
                break;
            case 'chat':
                handleChatMessage(payload.data, pass);
                break;
            case 'photo':
                handlePhotoMessage(payload.data, pass);
                break;
        }
    });

    conn.on('close', () => addMessage('Система: Связь потеряна', 'system-msg'));
}

// --- Функции-обработчики ---

function handleAuth(encryptedData, pass) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (decrypted === "AUTH_OK") {
            addMessage('Система: Канал защищен паролем', 'system-msg');
        } else { throw new Error(); }
    } catch (e) {
        addMessage('Система: ОШИБКА ПАРОЛЯ!', 'system-msg');
        conn.close();
    }
}

function handleChatMessage(encryptedData, pass) {
    try {
        const msg = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (msg) addMessage('Друг: ' + msg);
    } catch (e) { console.error("Ошибка текста"); }
}

function handlePhotoMessage(encryptedData, pass) {
    try {
        const imgData = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (imgData.startsWith('data:image')) {
            addMessage('Друг прислал фото:');
            const img = document.createElement('img');
            img.src = imgData;
            document.getElementById('chat').appendChild(img);
            scrollToBottom();
        }
    } catch (e) { addMessage('Система: Ошибка фото (пароль?)', 'system-msg'); }
}

// --- Функции отправки ---

function sendMessage() {
    const input = document.getElementById('message-input');
    const pass = document.getElementById('chat-password').value;
    if (conn && conn.open && input.value) {
        const encrypted = CryptoJS.AES.encrypt(input.value, pass).toString();
        conn.send({ type: 'chat', data: encrypted });
        addMessage('Ты: ' + input.value);
        input.value = '';
    }
}

function sendPhoto(input) {
    const file = input.files[0];
    if (!file || !conn) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const pass = document.getElementById('chat-password').value;
        const encrypted = CryptoJS.AES.encrypt(e.target.result, pass).toString();
        conn.send({ type: 'photo', data: encrypted });
        
        addMessage('Ты отправил фото:');
        const img = document.createElement('img');
        img.src = e.target.result;
        document.getElementById('chat').appendChild(img);
        scrollToBottom();
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// --- Утилиты ---

function addMessage(text, className = '') {
    const chat = document.getElementById('chat');
    const el = document.createElement('div');
    if (className) el.className = className;
    el.innerText = text;
    chat.appendChild(el);
    scrollToBottom();
}

function scrollToBottom() {
    const chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;
}