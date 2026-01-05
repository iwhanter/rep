const peer = new Peer({
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:global.stun.twilio.com:3478' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    }
});

let conn;
let heartbeat;

// --- СИСТЕМНОЕ ШИФРОВАНИЕ (WEB CRYPTO API) ---
async function fastEncrypt(data, password) {
    const encoder = new TextEncoder();
    const pwHash = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const key = await crypto.subtle.importKey('raw', pwHash, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Если на входе строка (текст), превращаем в байты. Если уже массив (фото) - берем как есть.
    const dataToEncrypt = typeof data === 'string' ? encoder.encode(data) : data;
    
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataToEncrypt);
    
    return {
        iv: Array.from(iv),
        content: Array.from(new Uint8Array(encrypted))
    };
}

async function fastDecrypt(payload, password) {
    try {
        const encoder = new TextEncoder();
        const pwHash = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const key = await crypto.subtle.importKey('raw', pwHash, { name: 'AES-GCM' }, false, ['decrypt']);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(payload.iv) },
            key,
            new Uint8Array(payload.content)
        );
        
        return decrypted; // Возвращаем ArrayBuffer
    } catch (e) {
        return null;
    }
}

// --- ЛОГИКА ПОДКЛЮЧЕНИЯ ---
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    checkUrlParams();
});

peer.on('connection', (connection) => {
    if (conn) conn.close(); 
    conn = connection;
    setupChat();
});

async function connectToFriend() {
    const remoteId = document.getElementById('remote-id').value.trim();
    const pass = document.getElementById('chat-password').value;
    if (!remoteId) return alert("Введите ID!");
    
    conn = peer.connect(remoteId);
    conn.on('open', async () => {
        const authData = await fastEncrypt("AUTH_OK", pass);
        conn.send({ type: 'auth', data: authData });
        setupChat();
    });
}

function setupChat() {
    document.getElementById('connection-setup').style.display = 'none';
    document.getElementById('chat-status').innerText = 'в сети';
    document.getElementById('chat-status').style.color = '#c6ffad';

    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => {
        if (conn && conn.open) conn.send({ type: 'ping' });
    }, 10000);

    conn.on('data', async (payload) => {
        if (payload.type === 'ping') return;
        const pass = document.getElementById('chat-password').value;
        
        const decryptedBuffer = await fastDecrypt(payload.data, pass);
        if (!decryptedBuffer) return;

        if (payload.type === 'auth') {
            const text = new TextDecoder().decode(decryptedBuffer);
            if (text === "AUTH_OK") addMessage('Шифрование активно', 'system-msg');
        } else if (payload.type === 'chat') {
            const text = new TextDecoder().decode(decryptedBuffer);
            addMessage(text, 'received');
        } else if (payload.type === 'photo') {
            // Превращаем байты обратно в картинку без потери качества
            const blob = new Blob([decryptedBuffer]);
            const url = URL.createObjectURL(blob);
            addMessage('', 'received', url);
        }
    });

    conn.on('close', () => {
        clearInterval(heartbeat);
        addMessage('Связь прервана', 'system-msg');
        document.getElementById('chat-status').innerText = 'офлайн';
    });
}

// --- ОТПРАВКА СООБЩЕНИЙ ---
async function sendMessage() {
    const input = document.getElementById('message-input');
    const pass = document.getElementById('chat-password').value;
    if (conn && conn.open && input.value) {
        const text = input.value;
        const encrypted = await fastEncrypt(text, pass);
        conn.send({ type: 'chat', data: encrypted });
        addMessage(text, 'sent');
        input.value = '';
        input.focus();
    }
}

async function sendPhoto(input) {
    const file = input.files[0];
    if (!file || !conn) return;

    addMessage('Отправка файла...', 'system-msg');
    
    const pass = document.getElementById('chat-password').value;
    const arrayBuffer = await file.arrayBuffer(); // Берем файл как есть (бинарно)
    
    const encrypted = await fastEncrypt(new Uint8Array(arrayBuffer), pass);
    conn.send({ type: 'photo', data: encrypted });
    
    // Для себя отображаем локальный URL, чтобы не тратить память
    const localUrl = URL.createObjectURL(file);
    addMessage('', 'sent', localUrl);
}

// --- ИНТЕРФЕЙСНЫЕ ФУНКЦИИ ---
function addMessage(text, type = 'system-msg', imgSrc = null) {
    const chat = document.getElementById('chat');
    const el = document.createElement('div');
    el.className = type === 'system-msg' ? 'system-msg' : 'msg ' + type;
    let time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (imgSrc) {
        el.classList.add('has-img');
        el.innerHTML = `<img src="${imgSrc}" onclick="openPhoto(this.src)"><div class="msg-footer"><span>${time}</span></div>`;
    } else if (type !== 'system-msg') {
        el.innerHTML = `<span>${text}</span><div class="msg-footer"><span>${time}</span></div>`;
    } else {
        el.innerText = text;
    }
    
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
}

function handleEnter(e) { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } }
function toggleSetup() {
    const s = document.getElementById('connection-setup');
    s.style.display = s.style.display === 'none' ? 'flex' : 'none';
}
function copyMyID() {
    navigator.clipboard.writeText(document.getElementById('my-id').innerText);
    alert("ID скопирован!");
}
function shareLink() {
    const url = window.location.origin + window.location.pathname + "?friendId=" + document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(url);
    alert("Ссылка скопирована!");
}
function checkUrlParams() {
    const id = new URLSearchParams(window.location.search).get('friendId');
    if (id) document.getElementById('remote-id').value = id;
}
function openPhoto(src) { document.getElementById('full-photo').src = src; document.getElementById('photo-viewer').style.display = 'flex'; }
function closePhoto() { document.getElementById('photo-viewer').style.display = 'none'; }

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
