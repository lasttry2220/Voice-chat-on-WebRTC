const createGroupButton = document.getElementById('createGroupButton');
const createRoomBtn = document.getElementById('createRoomBtn');
const hangupButton = document.getElementById('hangupButton');
const groupNameInput = document.getElementById('groupNameInput');
const groupCodeInput = document.getElementById('groupCodeInput');
const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');
const groupList = document.getElementById('groupList');
const roomList = document.getElementById('roomList');
const createGroupBtn = document.getElementById('createGroupBtn');

// Добавьте новый функционал
const modal = document.querySelector('.create-server-modal');
const serverNameInput = document.getElementById('serverNameInput');
const createButton = document.querySelector('.create-button');
const iconUpload = document.getElementById('iconUpload');
const iconPreview = document.querySelector('.icon-preview');
const iconPreviewText = document.getElementById('iconPreviewText');

if (!modal) console.error('Modal element not found!');
if (!createGroupBtn) console.error('Create group button not found!');
if (!serverNameInput) console.error('Server name input not found!');

// Обработчики закрытия модального окна
document.querySelector('.modal-overlay').addEventListener('click', closeModal);
document.querySelector('.back-button').addEventListener('click', closeModal);

// Валидация названия сервера
serverNameInput.addEventListener('input', (e) => {
    const name = e.target.value.trim();
    document.getElementById('charCount').textContent = name.length;
    createButton.disabled = name.length < 2 || name.length > 100;
});

// Загрузка иконки
document.getElementById('uploadButton').addEventListener('click', () => {
    iconUpload.click();
});

iconUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            iconPreview.style.backgroundImage = `url(${event.target.result})`;
            iconPreviewText.style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
});

// Создание сервера
createButton.addEventListener('click', () => {
    const serverName = serverNameInput.value.trim();
    if (serverName.length < 2) return;
    
    // Отправка данных на сервер
    socket.emit('createGroup', serverName);
    closeModal();
});

function closeModal() {
    modal.classList.add('hidden');
    // Сброс формы
    serverNameInput.value = '';
    iconPreview.style.backgroundImage = '';
    iconPreviewText.style.display = 'block';
    document.getElementById('charCount').textContent = '0';
    createButton.disabled = true;
}


let localStream;
let peerConnection;
let isCallActive = false;

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

fetch('/api/login', {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCSRFToken() // Если используете CSRF
    }
  });

// const socket = io('https://192.168.1.20:3001');
const socket = io('https://entryci.onrender.com', {
    withCredentials: true
  });

let currentSelectedGroupId = null;
let currentGroup = '';
let currentRoom = '';


if (createGroupBtn) {
    // Новый обработчик для открытия модального окна
    createGroupBtn.addEventListener('click', () => {
        document.querySelector('.create-server-modal').classList.remove('hidden');
    });
} else {
    console.error('Кнопка создания группы не найдена! Проверьте HTML-разметку');
}


function isValidObjectId(id) {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    return objectIdPattern.test(id);
}

// Обработчик кнопки выхода
document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
      
      const response = await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include'
      });
  
      if (response.ok) window.location.href = '/login';
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
});

socket.on('groupCreated', (response) => {
    if (response.success) {
        currentGroup = response.group._id;
        console.log(`Группа создана: ${response.group.name}`);
        addGroupToList(response.group._id, response.group.name);
    } else {
        alert('Ошибка создания группы: ' + (response.error || 'Неизвестная ошибка'));
    }
});

socket.on('roomCreated', (roomData) => {
    console.log('New room created:', roomData); // Добавьте лог
    addRoomToList(roomData.id, roomData.name);
});



// Автоматически запрашиваем группы при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    socket.emit('getGroups');
});

// функция выбора группы
function selectGroup(groupId) {
    if (!isValidObjectId(groupId)) {
        alert('Неверный формат ID группы');
        return;
    }
    
    currentSelectedGroupId = groupId;
    currentGroup = groupId;
    const roomsPanel = document.getElementById('roomsPanel');
    if (roomsPanel) roomsPanel.classList.remove('hidden');
    
    socket.emit('getRooms', groupId);
    socket.emit('joinGroup', groupId);
}

// Обновление списка групп
socket.on('groupsList', (groups) => {
    const groupList = document.getElementById('groupList');
    groupList.innerHTML = '';
    
    groups.forEach(group => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="group-item">
                <span>${group.groupName}</span>
                <small>${group.groupCode}</small>
            </div>
        `;
        li.addEventListener('click', () => selectGroup(group.groupCode));
        groupList.appendChild(li);
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


// обработчик создания комнаты
createRoomBtn.addEventListener('click', () => {
    const roomNameInput = document.getElementById('newRoomName');
    const roomName = roomNameInput.value.trim();
    
    if (!currentGroup || !roomName) {
        alert('Укажите название комнаты и выберите группу!');
        return;
    }
    
    socket.emit('createRoom', { 
        groupId: currentGroup, 
        roomName: roomName
    });
    
    // Очистка поля ввода сразу после отправки
    roomNameInput.value = '';
});

// очищать только после успешного создания
socket.on('roomsList', () => {
    document.getElementById('newRoomName').value = '';
});

//логика звонка
socket.on('startCall', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('WebRTC is not supported in this browser.');
        return;
    }
    try {
        console.log('Инициализация звонка...');
        
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
});


function joinGroup(groupCode) {
    currentGroup = groupCode;
    socket.emit('joinGroup', groupCode);
    selectGroup(groupCode);
}

function getRooms(groupCode) {
    socket.emit('getRooms', groupCode);
}

function addGroupToList(groupCode, groupName) {
    const li = document.createElement('li');
    li.className = 'group-item';
    li.dataset.groupId = groupCode;
    li.dataset.tooltip = groupName;
    li.innerHTML = `
        <span>${groupName[0].toUpperCase()}</span>
    `;
    
    // Если есть иконка
    const icon = document.querySelector('.icon-preview').style.backgroundImage;
    if (icon) {
        li.style.backgroundImage = icon;
        li.style.backgroundSize = 'cover';
        li.querySelector('span').style.display = 'none';
    }
    
    li.addEventListener('click', () => selectGroup(groupCode));
    groupList.appendChild(li);
}

// Делегирование событий для списка комнат
document.getElementById('roomList').addEventListener('click', (e) => {
    if (e.target.closest('.join-room-btn')) {
        const roomId = e.target.closest('li').dataset.roomId;
        joinRoom(roomId);
    }
});
socket.on('roomsList', (rooms) => {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.roomId = room.id;
        li.className = 'room-item';
        li.innerHTML = `
            <div class="room-content">
                <span>${room.name}</span>
            </div>
        `;
        
        // Добавляем обработчик клика на весь элемент
        li.addEventListener('click', () => {
            if (!currentSelectedGroupId) {
                alert('Сначала выберите группу!');
                return;
            }
            joinRoom(room.id);
        });
        
        roomList.appendChild(li);
    });
});

function addRoomToList(roomId, roomName) {
    const li = document.createElement('li');
    li.dataset.roomId = roomId;
    li.className = 'room-item';
    li.innerHTML = `
        <div class="room-content">
            <span>${roomName}</span>
        </div>
    `;
    
    li.addEventListener('click', () => {
        if (!currentSelectedGroupId) {
            alert('Сначала выберите группу!');
            return;
        }
        joinRoom(roomId);
    });
    
    roomList.appendChild(li);
}

function getGroups() {
    socket.emit('getGroups');
}

function joinRoom(roomId) {
    if (!currentSelectedGroupId) {
        alert('Сначала выберите группу!');
        return;
    }

    if (isCallActive) {
        alert('Завершите текущий звонок перед присоединением к новой комнате');
        return;
    }

    socket.emit('joinRoom', { 
        roomCode: roomId,
        groupCode: currentSelectedGroupId 
    }, (response) => {
        if (response.error) {
            console.error('Ошибка присоединения:', response.error);
            alert(response.error);
        } else {
            currentRoom = roomId;
            console.log('Успешно присоединились к комнате:', roomId);
            
        }
    });
}