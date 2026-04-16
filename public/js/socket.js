// Глобальный объект для сокета
let socket;

// Инициализация сокета
function initSocket() {
  if (socket && socket.connected) {
    console.log('Socket already connected');
    return socket;
  }
  
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    secure: true,
    rejectUnauthorized: false
  });
  
  socket.on('connect', () => {
    console.log('✅ Connected to server, socket id:', socket.id);
    // Устанавливаем глобальную ссылку ТОЛЬКО после подключения
    window.socket = socket;
  });
  
  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
  });
  
  socket.on('group-online-update', (members) => {
    if (window.updateOnlineMembersList) {
      window.updateOnlineMembersList(members);
    }
  });
  
  socket.on('user-joined-channel', ({ userId, username, socketId }) => {
    if (window.onUserJoinedChannel) {
      window.onUserJoinedChannel({ userId, username, socketId });
    }
  });
  
  socket.on('user-left-channel', ({ socketId }) => {
    if (window.onUserLeftChannel) {
      window.onUserLeftChannel(socketId);
    }
  });
  
  socket.on('channel-participants', (participants) => {
    if (window.onChannelParticipants) {
      window.onChannelParticipants(participants);
    }
  });
  
  socket.on('signal', ({ from, data }) => {
    if (window.onSignal) {
      window.onSignal(from, data);
    }
  });
  
  socket.on('force-leave-channel', () => {
    if (window.forceLeaveChannel) {
      window.forceLeaveChannel();
    }
  });
  
  return socket;
}

// Функции для вызова из UI
window.joinGroupSocket = (groupId) => {
  if (socket && socket.connected) {
    socket.emit('join-group', groupId);
  } else {
    console.error('Socket not connected');
  }
};

window.leaveGroupSocket = (groupId) => {
  if (socket && socket.connected) {
    socket.emit('leave-group', groupId);
  }
};

window.joinChannelSocket = (channelId, groupId) => {
  if (socket && socket.connected) {
    socket.emit('join-channel', { channelId, groupId });
  }
};

window.leaveChannelSocket = (channelId, groupId) => {
  if (socket && socket.connected) {
    socket.emit('leave-channel', { channelId, groupId });
  }
};

window.sendSignal = (to, data) => {
  if (socket && socket.connected) {
    socket.emit('signal', { to, from: socket.id, data });
  }
};

// Инициализируем сокет при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSocket();
  });
} else {
  initSocket();
}

socket.on('group-members-update', (members) => {
  if (window.updateGroupMembers) {
    window.updateGroupMembers(members);
  }
});