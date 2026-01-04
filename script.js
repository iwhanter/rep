// 1. Конфигурация с STUN-серверами для прохода через роутеры (NAT)
const peer = new Peer({
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' },
            { url: 'stun:stun2.l.google.com:19302' },
            { url: 'stun:stun3.l.google.com:19302' },
            { url: 'stun:stun4.l.google.com:19302' }
        ]
    }
});

let conn;

// 2. Получение своего ID
peer.on('open', (id) => {
    console.log('Мой ID сгенерирован:', id);
    document.getElementById('my-id').innerText = id;
});

// Обработка ошибок самого PeerJS
peer.on('error', (err) => {
    console.error('Ошибка PeerJS:', err.type);
    addMessage('Система: Ошибка сети (' + err.type + ')', 'system-msg');
});

// 3. Ждем входящее соединение
peer.on('connection', (connection) => {
    console.log('Входящее подключение от:', connection.peer);
    if (conn) conn.close(); 
    conn = connection;
    setupChat();
});

// 4. Кнопка "Установить связь"
function connectToFriend() {
    const remoteId = document.getElementById('remote-id').value.trim();
    if (!remoteId) return alert("Введите ID друга!");
    
    console.log('Пытаюсь подключиться к:', remoteId);
    conn = peer.connect(remoteId);
    
    conn.on('open', () => {
        console.log('Соединение успешно открыто!');
        const pass = document.getElementById('chat-password').value;
        const authSignal = CryptoJS.AES.encrypt("AUTH_OK", pass).toString();
        conn.send({ type: 'auth', data: authSignal });
        setupChat();
    });

    conn.on('error', (err) => {
        console.error('Ошибка соединения:', err);
        addMessage('Система: Не удалось соединиться.', 'system-msg');
    });
}

// 5. Настройка логики данных
function setupChat() {
    conn.on('data', (payload) => {
        console.log('Получены данные типа:', payload.type);
        const pass = document.getElementById('chat-password').value;

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

    conn.on('close', () => {
        console.log('Соединение закрыто');
        addMessage('Система: Связь разорвана', 'system-msg');
    });
}

// --- Обработчики безопасности ---

function handleAuth(encryptedData, pass) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (decrypted === "AUTH_OK") {
            console.log('Пароли совпали!');
            addMessage('Система: Защищенный канал установлен', 'system-msg');
        } else { throw new Error(); }
    } catch (e) {
        console.error('Ошибка авторизации: неверный пароль');
        addMessage('Система: ОШИБКА ПАРОЛЯ!', 'system-msg');
        conn.close();
    }
}

function handleChatMessage(encryptedData, pass) {
    try {
        const msg = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (msg) addMessage('Друг: ' + msg);
    } catch (e) { console.error("Ошибка расшифровки сообщения"); }
}

function handlePhotoMessage(encryptedData, pass) {
    try {
        const imgData = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (imgData.startsWith('data:image')) {
            addMessage('Друг прислал фото:');
            addImageToChat(imgData);
        }
    } catch (e) { console.error("Ошибка расшифровки фото"); }
}

// --- Отправка ---

function sendMessage() {
    const input = document.getElementById('message-input');
    const pass = document.getElementById('chat-password').value;
    if (conn && conn.open && input.value) {
        const encrypted = CryptoJS.AES.encrypt(input.value, pass).toString();
        conn.send({ type: 'chat', data: encrypted });
        addMessage('Ты: ' + input.value);
        input.value = '';
    } else {
        console.warn('Отправка невозможна: нет соединения');
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
        addImageToChat(e.target.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
}
// Функция 1: Простое копирование ID в буфер обмена
function copyMyID() {
    const myId = document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(myId);
    alert("ID скопирован! Отправь его другу.");
}

// Функция 2: Создание ссылки, которая сама подставит ID
function shareLink() {
    const myId = document.getElementById('my-id').innerText;
    // Создаем ссылку вида https://твой.сайт/?friendId=твой-айди
    const shareUrl = window.location.origin + window.location.pathname + "?friendId=" + myId;
    
    navigator.clipboard.writeText(shareUrl);
    alert("Ссылка с твоим ID скопирована! Другу достаточно просто перейти по ней.");
}

// Функция 3: Автозаполнение ID из ссылки при загрузке
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');
    if (friendId) {
        document.getElementById('remote-id').value = friendId;
        addMessage('Система: ID друга получен из ссылки. Нажми "Установить связь".', 'system-msg');
    }
};

// --- Интерфейс ---

function addMessage(text, className = '') {
    const chat = document.getElementById('chat');
    const el = document.createElement('div');
    if (className) el.className = className;
    el.innerText = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
}

function addImageToChat(src) {
    const chat = document.getElementById('chat');
    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    chat.appendChild(img);
    chat.scrollTop = chat.scrollHeight;
}

