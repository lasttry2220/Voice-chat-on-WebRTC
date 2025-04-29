function isValidObjectId(id) {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    return objectIdPattern.test(id);
}

const createRoomButton = document.getElementById('createRoomButton');
const startCallButton = document.getElementById('startCallButton');
const hangupButton = document.getElementById('hangupButton');
const roomNameInput = document.getElementById('roomNameInput');
const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');
const roomList = document.getElementById('roomList');
const backButton = document.getElementById('backButton');

let localStream;
let peerConnection;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const socket = io('https://192.168.1.2:3001');

let currentGroup = null;
let currentRoom = '';

const urlParams = new URLSearchParams(window.location.search);
currentGroup = urlParams.get('groupCode');

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentGroup = urlParams.get('groupCode');
    
    console.log('Initialized currentGroup:', currentGroup);
    
    if (!isValidObjectId(currentGroup)) {
        alert('Invalid group ID');
        window.location.href = '/dashboard';
    } else {
        // Запрашиваем актуальный список комнат
        socket.emit('getRooms', currentGroup);
    }
});

// Обработчик для ручного запроса
function getRooms() {
    if (!currentGroup) return;
    socket.emit('getRooms', currentGroup);
}

document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
        // Получаем CSRF-токен из мета-тега или скрытого поля
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content 
            || document.querySelector('input[name="_csrf"]')?.value;

        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include' // Важно для передачи куки
        });

        if (response.ok) {
            // Принудительная перезагрузка страницы
            window.location.href = '/login';
            window.location.reload(true);
        } else {
            console.error('Ошибка:', await response.json());
        }
    } catch (error) {
        console.error('Сетевая ошибка:', error);
    }
});


socket.on('connect', () => {
    console.log('Connected to server');
    getRooms(currentGroup);
});

socket.on('roomCreated', (roomData) => {
    addRoomToList(roomData.roomCode, roomData.roomName);
});

// Слушаем обновления списка комнат
socket.on('roomsList', (rooms) => {
    console.log('[Client] Received rooms:', rooms);
    roomList.innerHTML = '';
    
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room.name;
        li.dataset.roomId = room.id;
        li.addEventListener('click', () => {
            console.log('[Client] Room clicked:', room.id);
            joinRoom(room.id); // Используем правильный ID комнаты
        });
        roomList.appendChild(li);
    });
});

socket.on('signal', (data) => {
    handleSignalingMessage(data);
});

function handleSignalingMessage(message) {
    if (message.sdp) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
            .then(() => {
                if (message.sdp.type === 'offer') {
                    peerConnection.createAnswer()
                        .then(description => createAndSendAnswer(description));
                }
            });
    } else if (message.ice) {
        peerConnection.addIceCandidate(new RTCIceCandidate(message.ice));
    }
}

function createAndSendAnswer(description) {
    peerConnection.setLocalDescription(description)
        .then(() => {
            socket.emit('signal', { sdp: peerConnection.localDescription, room: currentRoom });
        });
}

createRoomButton.addEventListener('click', () => {
    const roomName = roomNameInput.value;
    
    if (!roomName) {
      alert('Введите название комнаты');
      return;
    }
    
    if (!isValidObjectId(currentGroup)) {
      alert('Неверный ID группы');
      window.location.href = '/dashboard';
      return;
    }
    
    socket.emit('createRoom', currentGroup, roomName);
});
// обработка успешного присоединения 
socket.on('roomJoined', (data) => {
    console.log('Successfully joined room:', data.roomName);
    startCallAutomatically();
});
// Обработка ошибок
socket.on('error', (errorMessage) => {
    console.error('Server error:', errorMessage);
    alert(`Error: ${errorMessage}`);
});
socket.on('userJoined', (userId) => {
    // Если мы уже имеем подключение, отправляем новый offer
    if (peerConnection && peerConnection.signalingState === 'stable') {
        startCallAutomatically();
    }
});
// логика звонка
async function startCallAutomatically() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('WebRTC is not supported in this browser.');
        return;
    }

    try {
        // Получаем аудиопоток если еще не получен
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localAudio.srcObject = localStream;
        }

        // Создаем новое подключение если его нет
        if (!peerConnection) {
            peerConnection = new RTCPeerConnection(configuration);
            
            localStream.getTracks().forEach(track => 
                peerConnection.addTrack(track, localStream)
            );

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('signal', { ice: event.candidate, room: currentRoom });
                }
            };

            peerConnection.ontrack = event => {
                if (event.streams && event.streams[0]) {
                    remoteAudio.srcObject = event.streams[0];
                }
            };
        }

        // Создаем и отправляем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { 
            sdp: peerConnection.localDescription, 
            room: currentRoom 
        });
    } catch (error) {
        console.error('Error starting call:', error);
    }
}

hangupButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localAudio.srcObject = null;
    remoteAudio.srcObject = null;
});

backButton.addEventListener('click', () => {
    window.location.href = '/dashboard';
});

function getRooms(groupCode) {
    socket.emit('getRooms', groupCode);
}

function addRoomToList(roomId, roomName) {
    const li = document.createElement('li');
    li.textContent = roomName;
    li.dataset.roomId = roomId; // Используем ID комнаты вместо кода
    li.addEventListener('click', () => {
        joinRoom(roomId); // Передаем корректный ID комнаты
    });
    roomList.appendChild(li);
}

function joinRoom(roomCode) {
    console.log('[Client] Attempting to join room:', {
        roomCode: roomCode,
        groupCode: currentGroup,
        validRoomId: isValidObjectId(roomCode),
        validGroupId: isValidObjectId(currentGroup)
    });
    
    currentRoom = roomCode;
    socket.emit('joinRoom', { 
        roomCode: roomCode,
        groupCode: currentGroup 
    });
}
