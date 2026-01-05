// 1. Конфигурация с STUN и TURN серверами (пробивает VPN и мобильный инет)
const peer = new Peer({
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:global.stun.twilio.com:3478' },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        'iceCandidatePoolSize': 10
    }
});

let conn;

// 2. Инициализация при открытии страницы
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    console.log('Мой ID:', id);
    checkUrlParams(); // Проверяем, есть ли ID друга в ссылке
});

// 3. Ждем входящее подключение
peer.on('connection', (connection) => {
    if (conn) conn.close(); 
    conn = connection;
    setupChat();
});

// 4. Логика кнопки "Установить связь"
function connectToFriend() {
    const remoteId = document.getElementById('remote-id').value.trim();
    if (!remoteId) return alert("Введите ID друга!");
    
    console.log('Подключаюсь к:', remoteId);
    conn = peer.connect(remoteId);
    
    conn.on('open', () => {
        const pass = document.getElementById('chat-password').value;
        const authSignal = CryptoJS.AES.encrypt("AUTH_OK", pass).toString();
        conn.send({ type: 'auth', data: authSignal });
        setupChat();
    });
}

// 5. Настройка чата и прием данных
function setupChat() {
    // СКРЫВАЕМ КНОПКИ ПОДКЛЮЧЕНИЯ ПОСЛЕ УСТАНОВКИ СВЯЗИ
    const setupBlock = document.getElementById('connection-setup');
    if (setupBlock) setupBlock.style.display = 'none';

    conn.on('data', (payload) => {
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
        addMessage('Система: Связь разорвана', 'system-msg');
        if (setupBlock) setupBlock.style.display = 'flex'; // Возвращаем кнопки при обрыве
    });
}

// --- Функции-помощники ---

function handleAuth(encryptedData, pass) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (decrypted === "AUTH_OK") {
            addMessage('Система: Соединение защищено', 'system-msg');
        } else { throw new Error(); }
    } catch (e) {
        addMessage('Система: Ошибка пароля!', 'system-msg');
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
            addImageToChat(imgData);
        }
    } catch (e) { console.error("Ошибка фото"); }
}

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
        addImageToChat(e.target.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// --- Функции автоматизации ID и ссылок (с фиксом для всех браузеров) ---

function copyMyID() {
    const myId = document.getElementById('my-id').innerText;
    if (!myId || myId === "Загрузка...") return;

    const el = document.createElement('textarea');
    el.value = myId;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert("ID скопирован!");
}

function shareLink() {
    const myId = document.getElementById('my-id').innerText;
    if (!myId || myId === "Загрузка...") return;

    const shareUrl = window.location.origin + window.location.pathname + "?friendId=" + myId;
    const el = document.createElement('textarea');
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert("Ссылка с твоим ID скопирована!");
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');
    if (friendId) {
        document.getElementById('remote-id').value = friendId;
        addMessage('Система: ID друга получен из ссылки. Нажми "Установить связь".', 'system-msg');
    }
}

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
    chat.appendChild(img);
    chat.scrollTop = chat.scrollHeight;
}