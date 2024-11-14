const createRoomButton = document.getElementById('createRoomButton');
const startCallButton = document.getElementById('startCallButton');
const hangupButton = document.getElementById('hangupButton');
const roomNameInput = document.getElementById('roomNameInput');
const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');
const roomList = document.getElementById('roomList');

let localStream;
let peerConnection;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const socket = io('https://192.168.1.2:3001');

let currentGroup = '';
let currentRoom = '';

const urlParams = new URLSearchParams(window.location.search);
currentGroup = urlParams.get('groupCode');

socket.on('connect', () => {
    console.log('Connected to server');
    getRooms(currentGroup);
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
    if (roomName && currentGroup) {
        socket.emit('createRoom', { groupCode: currentGroup, roomName });
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

function getRooms(groupCode) {
    socket.emit('getRooms', groupCode);
}

function addRoomToList(roomCode, roomName) {
    const li = document.createElement('li');
    li.textContent = roomName;
    li.addEventListener('click', () => {
        joinRoom(roomCode);
    });
    roomList.appendChild(li);
}

function joinRoom(roomCode) {
    currentRoom = roomCode;
    socket.emit('joinRoom', { roomCode, groupCode: currentGroup });
}