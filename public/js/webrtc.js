// WebRTC логика
let localStream = null;
let peerConnections = new Map(); // socketId -> RTCPeerConnection
let currentChannelId = null;
let currentGroupId = null;
let isMuted = false;

// Конфигурация WebRTC (STUN серверы для NAT traversal)
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Инициализация WebRTC
window.initWebRTC = async () => {
  console.log('Initializing WebRTC...');
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✅ Microphone access granted');
    
    if (!document.getElementById('remote-audio-container')) {
      const container = document.createElement('div');
      container.id = 'remote-audio-container';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to get microphone:', error);
    alert('Cannot access microphone. Please check permissions.');
    return false;
  }
};

// Вход в голосовой канал
window.joinChannelWebRTC = async (channelId, groupId) => {
  console.log(`Joining channel ${channelId} in group ${groupId}`);
  
  if (currentChannelId) {
    await window.leaveChannelWebRTC();
  }
  
  currentChannelId = channelId;
  currentGroupId = groupId;
  
  if (!localStream) {
    const success = await window.initWebRTC();
    if (!success) return false;
  }
  
  return true;
};

// Выход из голосового канала
window.leaveChannelWebRTC = async () => {
  console.log('Leaving current channel');
  
  for (const [socketId, pc] of peerConnections.entries()) {
    pc.close();
    peerConnections.delete(socketId);
  }
  
  currentChannelId = null;
  currentGroupId = null;
  
  return true;
};

// Создание peer соединения с другим участником (ТОЛЬКО ОДИН РАЗ)
window.createPeerConnection = (remoteSocketId, username) => {
  if (!localStream) {
    console.error('No local stream available');
    return;
  }
  
  if (peerConnections.has(remoteSocketId)) {
    console.log(`Peer connection to ${username} already exists`);
    return;
  }
  
  console.log(`Creating peer connection to ${username} (${remoteSocketId})`);
  
  const pc = new RTCPeerConnection(configuration);
  
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
  
  pc.onicecandidate = (event) => {
    if (event.candidate && window.sendSignal) {
      window.sendSignal(remoteSocketId, {
        type: 'ice',
        candidate: event.candidate
      });
    }
  };
  
  pc.ontrack = (event) => {
    console.log(`Received remote track from ${username}`);
    const audioElement = new Audio();
    audioElement.srcObject = event.streams[0];
    audioElement.autoplay = true;
    audioElement.id = `audio-${remoteSocketId}`;
    
    const oldAudio = document.getElementById(`audio-${remoteSocketId}`);
    if (oldAudio) oldAudio.remove();
    
    document.body.appendChild(audioElement);
  };
  
  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${username}: ${pc.connectionState}`);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      if (peerConnections.has(remoteSocketId)) {
        peerConnections.delete(remoteSocketId);
      }
      const audioElement = document.getElementById(`audio-${remoteSocketId}`);
      if (audioElement) audioElement.remove();
    }
  };
  
  peerConnections.set(remoteSocketId, pc);
  
  // ТОЛЬКО ЕСЛИ МЫ ИНИЦИАТОР (пользователь, который присоединился позже, НЕ создаёт offer)
  // Но для Mesh сети, оба участника должны создать offer для peer-to-peer?
  // Лучше: отправляем offer только если мы не получали offer от этого участника
  // Для простоты: отправляем offer, но с проверкой состояния
  
  pc.createOffer()
  .then(offer => pc.setLocalDescription(offer))
  .then(() => {
    // Отправляем offer всегда, без проверки signalingState
    if (window.sendSignal) {
      console.log(`Sending offer to ${username}`);
      window.sendSignal(remoteSocketId, {
        type: 'offer',
        sdp: pc.localDescription
      });
    }
  })
  .catch(error => console.error('Error creating offer:', error));
};

window.closePeerConnection = (remoteSocketId) => {
  const pc = peerConnections.get(remoteSocketId);
  if (pc) {
    console.log(`Closing peer connection to ${remoteSocketId}`);
    pc.close();
    peerConnections.delete(remoteSocketId);
    
    const audioElement = document.getElementById(`audio-${remoteSocketId}`);
    if (audioElement) audioElement.remove();
  }
};

// ИСПРАВЛЕННАЯ ОБРАБОТКА СИГНАЛОВ
window.handleSignal = async (fromSocketId, data) => {
  console.log(`Received signal from ${fromSocketId}, type: ${data.type}`);

  let pc = peerConnections.get(fromSocketId);
  
  // Если соединения нет и это offer - создаём новое, НО НЕ ОТПРАВЛЯЕМ offer обратно
  if (!pc && data.type === 'offer') {
    console.log(`Creating peer connection for incoming offer from ${fromSocketId}`);
    
    pc = new RTCPeerConnection(configuration);
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }
    
    pc.onicecandidate = (event) => {
      if (event.candidate && window.sendSignal) {
        window.sendSignal(fromSocketId, {
          type: 'ice',
          candidate: event.candidate
        });
      }
    };
    
    pc.ontrack = (event) => {
      console.log(`✅ Received remote track from ${fromSocketId}`);
      const audioElement = new Audio();
      audioElement.srcObject = event.streams[0];
      audioElement.autoplay = true;
      audioElement.id = `audio-${fromSocketId}`;
      
      const oldAudio = document.getElementById(`audio-${fromSocketId}`);
      if (oldAudio) oldAudio.remove();
      
      document.body.appendChild(audioElement);
      console.log(`✅ Audio element created for ${fromSocketId}`);
    };
    
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${fromSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        console.log(`🎉 Successfully connected to ${fromSocketId}!`);
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (peerConnections.has(fromSocketId)) {
          peerConnections.delete(fromSocketId);
        }
        const audioElement = document.getElementById(`audio-${fromSocketId}`);
        if (audioElement) audioElement.remove();
      }
    };
    
    peerConnections.set(fromSocketId, pc);
  }
  
  pc = peerConnections.get(fromSocketId);
  if (!pc) {
    console.error(`No peer connection for ${fromSocketId}`);
    return;
  }
  
  try {
    if (data.type === 'offer') {
      // Проверяем состояние перед установкой remote description
      if (pc.signalingState !== 'stable') {
        console.log(`Waiting for stable state, current: ${pc.signalingState}`);
        // Ждём стабильного состояния
        await new Promise(resolve => {
          const checkState = () => {
            if (pc.signalingState === 'stable') {
              resolve();
            } else {
              setTimeout(checkState, 100);
            }
          };
          checkState();
        });
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (window.sendSignal) {
        window.sendSignal(fromSocketId, {
          type: 'answer',
          sdp: pc.localDescription
        });
      }
    } else if (data.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else {
        console.log(`Ignoring answer in state: ${pc.signalingState}`);
      }
    } else if (data.type === 'ice') {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        console.log('ICE candidate received before remote description, queuing...');
        // Сохраняем кандидата для добавления позже
        setTimeout(async () => {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }, 500);
      }
    }
  } catch (error) {
    console.error('Error handling signal:', error);
  }
};

// Mute/Unmute
window.isMuted = () => isMuted;

window.setMute = (muted) => {
  isMuted = muted;
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !muted;
      console.log(`Microphone ${muted ? 'muted' : 'unmuted'}`);
    }
  }
};

// Получить socket.id
Object.defineProperty(window, 'socketId', {
  get: () => window.socket ? window.socket.id : null
});

console.log('WebRTC module loaded');