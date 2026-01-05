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

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    checkUrlParams();
});

peer.on('connection', (connection) => {
    if (conn) conn.close(); 
    conn = connection;
    setupChat();
});

function connectToFriend() {
    const remoteId = document.getElementById('remote-id').value.trim();
    if (!remoteId) return alert("Введите ID!");
    conn = peer.connect(remoteId);
    conn.on('open', () => {
        const pass = document.getElementById('chat-password').value;
        const authSignal = CryptoJS.AES.encrypt("AUTH_OK", pass).toString();
        conn.send({ type: 'auth', data: authSignal });
        setupChat();
    });
}

function setupChat() {
    document.getElementById('connection-setup').style.display = 'none';
    document.getElementById('chat-status').innerText = 'в сети';
    document.getElementById('chat-status').style.color = '#c6ffad';

    conn.on('data', (payload) => {
        const pass = document.getElementById('chat-password').value;
        if (payload.id && payload.type !== 'ack') {
            conn.send({ type: 'ack', msgId: payload.id });
        }
        switch(payload.type) {
            case 'auth': handleAuth(payload.data, pass); break;
            case 'chat': handleChatMessage(payload, pass); break;
            case 'photo': handlePhotoMessage(payload, pass); break;
            case 'ack': markAsRead(payload.msgId); break;
        }
    });

    conn.on('close', () => {
        addMessage('Связь прервана', 'system-msg');
        document.getElementById('chat-status').innerText = 'офлайн';
        document.getElementById('connection-setup').style.display = 'flex';
    });
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const pass = document.getElementById('chat-password').value;
    if (conn && conn.open && input.value) {
        const msgId = 'm' + Date.now();
        const encrypted = CryptoJS.AES.encrypt(input.value, pass).toString();
        conn.send({ type: 'chat', data: encrypted, id: msgId });
        addMessage(input.value, 'sent', null, msgId);
        input.value = '';
    }
}

function sendPhoto(input) {
    const file = input.files[0];
    if (!file || !conn) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const msgId = 'p' + Date.now();
        const pass = document.getElementById('chat-password').value;
        const encrypted = CryptoJS.AES.encrypt(e.target.result, pass).toString();
        conn.send({ type: 'photo', data: encrypted, id: msgId });
        addMessage('', 'sent', e.target.result, msgId);
    };
    reader.readAsDataURL(file);
}

function markAsRead(msgId) {
    const statusEl = document.getElementById('status-' + msgId);
    if (statusEl) statusEl.innerText = '✓✓'; 
}

function addMessage(text, type = 'system-msg', imgSrc = null, msgId = null) {
    const chat = document.getElementById('chat');
    const el = document.createElement('div');
    el.className = type === 'system-msg' ? 'system-msg' : 'msg ' + type;
    
    let time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (type !== 'system-msg') {
        let statusHtml = (type === 'sent' && msgId) ? `<span class="status-check" id="status-${msgId}">✓</span>` : '';
        let footerHtml = `<div class="msg-footer"><span>${time}</span>${statusHtml}</div>`;
        
        if (imgSrc) {
            el.classList.add('has-img');
            el.innerHTML = `<img src="${imgSrc}" onclick="openPhoto(this.src)">${footerHtml}`;
        } else {
            // ВАЖНО: Текст идет первым, чтобы футер мог обтекать его или уходить вниз
            el.innerHTML = `<span>${text}</span>${footerHtml}`;
        }
    } else {
        el.innerText = text;
    }
    
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
}

function openPhoto(src) {
    const viewer = document.getElementById('photo-viewer');
    const fullImg = document.getElementById('full-photo');
    fullImg.src = src;
    viewer.style.display = 'flex';
}

function closePhoto() {
    document.getElementById('photo-viewer').style.display = 'none';
}

function handleAuth(encryptedData, pass) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, pass).toString(CryptoJS.enc.Utf8);
        if (decrypted === "AUTH_OK") addMessage('Шифрование активировано', 'system-msg');
    } catch (e) {
        addMessage('Ошибка пароля!', 'system-msg');
        conn.close();
    }
}

function handleChatMessage(payload, pass) {
    try {
        const msg = CryptoJS.AES.decrypt(payload.data, pass).toString(CryptoJS.enc.Utf8);
        if (msg) addMessage(msg, 'received');
    } catch (e) {}
}

function handlePhotoMessage(payload, pass) {
    try {
        const imgData = CryptoJS.AES.decrypt(payload.data, pass).toString(CryptoJS.enc.Utf8);
        addMessage('', 'received', imgData);
    } catch (e) {}
}

function handleEnter(e) { if (e.key === 'Enter') sendMessage(); }
function toggleSetup() {
    const s = document.getElementById('connection-setup');
    s.style.display = s.style.display === 'none' ? 'flex' : 'none';
}
function copyMyID() {
    const myId = document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(myId);
    alert("ID скопирован!");
}
function shareLink() {
    const myId = document.getElementById('my-id').innerText;
    const shareUrl = window.location.origin + window.location.pathname + "?friendId=" + myId;
    navigator.clipboard.writeText(shareUrl);
    alert("Ссылка скопирована!");
}
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');
    if (friendId) document.getElementById('remote-id').value = friendId;
}
