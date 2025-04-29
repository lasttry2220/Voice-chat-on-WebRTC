const createGroupButton = document.getElementById('createGroupButton');
const joinGroupButton = document.getElementById('joinGroupButton');
const createRoomButton = document.getElementById('createRoomButton');
const joinRoomButton = document.getElementById('joinRoomButton');
const startCallButton = document.getElementById('startCallButton');
const hangupButton = document.getElementById('hangupButton');
const groupNameInput = document.getElementById('groupNameInput');
const groupCodeInput = document.getElementById('groupCodeInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');
const groupList = document.getElementById('groupList');
const roomList = document.getElementById('roomList');

let localStream;
let peerConnection;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const socket = io('https://192.168.1.2:3001');

let currentGroup = '';
let currentRoom = '';

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

socket.on('groupCreated', (groupData) => {
    currentGroup = groupData.groupCode;
    console.log(`Group created with code: ${groupData.groupCode} and name: ${groupData.groupName}`);
    addGroupToList(groupData.groupCode, groupData.groupName);
});

socket.on('roomCreated', (roomData) => {
    addRoomToList(roomData.roomCode, roomData.roomName);
});

socket.on('roomsList', (rooms) => {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        addRoomToList(room.roomCode, room.roomName);
    });
});

// Автоматически запрашиваем группы при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    socket.emit('getGroups');
});

// Обновление списка групп
socket.on('groupsList', (groups) => {
    groupList.innerHTML = '';
    groups.forEach(group => {
      addGroupToList(group.groupCode, group.groupName);
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

// Обработка создания группы
createGroupButton.addEventListener('click', () => {
    const groupName = groupNameInput.value;
    if (groupName) {
        socket.emit('createGroup', groupName);
    }
});


joinGroupButton.addEventListener('click', () => {
    const groupCode = groupCodeInput.value;
    if (groupCode) {
      joinGroup(groupCode);
      
      // Добавляем обновление списка после присоединения
      setTimeout(() => {
        socket.emit('getGroups');
      }, 500); // Небольшая задержка для сохранения в БД
    }
  });

createRoomButton.addEventListener('click', () => {
    if (currentGroup) {
        socket.emit('createRoom', currentGroup);
    }
});

joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value;
    if (roomCode && currentGroup) {
        socket.emit('joinRoom', { roomCode, groupCode: currentGroup });
    }
});

startCallButton.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('WebRTC is not supported in this browser.');
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localAudio.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

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

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { sdp: peerConnection.localDescription, room: currentRoom });
    } catch (error) {
        console.error('Error starting call:', error);
    }
});

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

function joinGroup(groupCode) {
    currentGroup = groupCode;
    socket.emit('joinGroup', groupCode);
    getRooms(groupCode);
}

function getRooms(groupCode) {
    socket.emit('getRooms', groupCode);
}

function addGroupToList(groupCode, groupName) {
    const li = document.createElement('li');
    li.textContent = `${groupName} (${groupCode})`;
    li.addEventListener('click', () => {
        joinGroup(groupCode);
    });
    groupList.appendChild(li);
}

function addRoomToList(roomCode, roomName) {
    const li = document.createElement('li');
    li.textContent = roomName;
    li.addEventListener('click', () => {
        joinRoom(roomCode);
    });
    roomList.appendChild(li);
}

function getGroups() {
    socket.emit('getGroups');
}

function joinRoom(roomCode) {
    currentRoom = roomCode;
    socket.emit('joinRoom', { roomCode, groupCode: currentGroup });
}
function joinGroup(groupCode) {
    currentGroup = groupCode;
    socket.emit('joinGroup', groupCode);
    getRooms(groupCode);
    window.location.href = `group.html?groupCode=${groupCode}`;
}