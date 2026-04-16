// Discord-style UI Controller
(function() {
  let uiCurrentGroupId = null;
  let uiCurrentChannelId = null;
  let userGroupsData = [];
  let currentGroupData = null;
  
  let isMicMuted = false;
  let isHeadphonesMuted = false;
  let isInCall = false;

  let currentTextChannelId = null;
  let currentChatMessages = [];
  let groupMembers = [];

  // DOM элементы
  const serversList = document.getElementById('servers-list');
  const channelsPanel = document.getElementById('channels-panel');
  const groupNameHeader = document.getElementById('group-name-header');
  const channelsListPanel = document.getElementById('channels-list-panel');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const micBtn = document.getElementById('mic-btn');
  const headphonesBtn = document.getElementById('headphones-btn');
  const usersCountSpan = document.getElementById('users-count');
  const voiceUsersList = document.getElementById('voice-users-list');
  const voiceCallBar = document.getElementById('voice-call-bar');
  const callBarName = document.getElementById('call-bar-name');
  const callBarLeaveBtn = document.getElementById('call-bar-leave-btn');

  // Инициализация
  document.addEventListener('DOMContentLoaded', () => {
    if (window.initialGroups && window.initialGroups.length > 0) {
      userGroupsData = window.initialGroups;
      renderServersList();
    }
    setupEventListeners();
    setupMessageListener();
  });

  // Настройка слушателя сообщений
  function setupMessageListener() {
    // Ждём появления socket
    const checkSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(checkSocket);
        console.log(' Setting up new-message listener');
        
        window.socket.on('new-message', (message) => {
          console.log(' NEW MESSAGE RECEIVED:', message);
          console.log(' currentTextChannelId:', currentTextChannelId);
          console.log(' message.channelId:', message.channelId);
          
          if (currentTextChannelId === message.channelId) {
            console.log(' Adding message to chat');
            currentChatMessages.push(message);
            displayMessages();
            
            // Скролл вниз
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          } else {
            console.log(' Message for different channel, ignoring');
          }
        });
      }
    }, 500);
  }

  function renderServersList() {
    if (!serversList) return;
    serversList.innerHTML = '';
    
    userGroupsData.forEach(group => {
      const isOwner = group.creatorUserId === window.currentUserId;
      const serverDiv = document.createElement('div');
      serverDiv.className = 'server-item';
      if (uiCurrentGroupId === group._id) serverDiv.classList.add('active');
      serverDiv.setAttribute('data-tooltip', group.name);
      serverDiv.setAttribute('data-group-id', group._id);
      
      const initial = document.createElement('span');
      initial.className = 'server-initial';
      initial.textContent = group.name.charAt(0).toUpperCase();
      serverDiv.appendChild(initial);
      
      if (isOwner) {
        const crown = document.createElement('div');
        crown.className = 'server-owner-badge';
        crown.textContent = '';
        serverDiv.appendChild(crown);
      }
      
      serverDiv.onclick = () => selectServer(group._id);
      serversList.appendChild(serverDiv);
    });
  }

  async function selectServer(groupId) {
    uiCurrentGroupId = groupId;
    currentGroupData = userGroupsData.find(g => g._id === groupId);
    
    document.querySelectorAll('.server-item').forEach(el => {
      el.classList.remove('active');
      if (el.getAttribute('data-group-id') === groupId) {
        el.classList.add('active');
      }
    });
    
    const res = await fetch(`/api/groups/${groupId}/channels`);
    if (res.ok) {
      const data = await res.json();
      renderChannelsPanel(data.channels || []);
    }
    
    if (channelsPanel) channelsPanel.style.display = 'flex';
    if (groupNameHeader) groupNameHeader.textContent = currentGroupData.name;
    
    if (addChannelBtn) addChannelBtn.style.display = 'flex';
    
    if (window.joinGroupSocket) window.joinGroupSocket(groupId);
  }

  function renderChannelsPanel(channels) {
    if (!channelsListPanel) return;
    channelsListPanel.innerHTML = '';
    
    channels.forEach(channel => {
      const channelDiv = document.createElement('div');
      channelDiv.className = 'channel-item';
      if (uiCurrentChannelId === channel._id) channelDiv.classList.add('active');
      const icon = channel.type === 'voice' ? '🔊' : '';
      const prefix = channel.type === 'text' ? '# ' : '';
      channelDiv.innerHTML = `
        <span class="channel-icon">${icon}</span>
        <span class="channel-name">${prefix}${escapeHtml(channel.name)}</span>
      `;
      channelDiv.onclick = () => selectChannel(channel);
      channelsListPanel.appendChild(channelDiv);
    });
  }

  async function selectChannel(channel) {
    console.log('=== selectChannel called ===', channel.name, channel.type);
    
    uiCurrentChannelId = channel._id;
    
    document.querySelectorAll('.channel-item').forEach(el => {
      el.classList.remove('active');
      if (el.querySelector('.channel-name')?.textContent.includes(channel.name)) {
        el.classList.add('active');
      }
    });
    
    if (channel.type === 'voice') {
      // Голосовой канал - подключаемся фоном, текстовый чат остаётся
      if (window.joinChannelWebRTC) {
        const success = await window.joinChannelWebRTC(channel._id, uiCurrentGroupId);
        if (success && window.joinChannelSocket) {
          window.joinChannelSocket(channel._id, uiCurrentGroupId);
          enterCallMode(channel.name);
        }
      }
      // НЕ меняем центральную область - чат остаётся
    } else if (channel.type === 'text') {
      // Текстовый канал - показываем чат
      renderChat(channel);
    }
  }
  
  function enterCallMode(channelName) {
    isInCall = true;
    
    if (micBtn) micBtn.disabled = false;
    if (headphonesBtn) headphonesBtn.disabled = false;
    
    if (voiceCallBar) {
      voiceCallBar.style.display = 'flex';
      if (callBarName) callBarName.textContent = channelName;
    }
    
    isMicMuted = false;
    isHeadphonesMuted = false;
    updateMicButton();
    updateHeadphonesButton();
  }

  function exitCallMode() {
    isInCall = false;
    
    if (micBtn) micBtn.disabled = true;
    if (headphonesBtn) headphonesBtn.disabled = true;
    
    if (voiceCallBar) voiceCallBar.style.display = 'none';
    if (callBarName) callBarName.textContent = '';
    
    if (micBtn) micBtn.classList.remove('muted');
    if (headphonesBtn) headphonesBtn.classList.remove('muted');
  }

  function updateMicButton() {
    if (!micBtn) return;
    if (isMicMuted) {
      micBtn.classList.add('muted');
    } else {
      micBtn.classList.remove('muted');
    }
  }

  function updateHeadphonesButton() {
    if (!headphonesBtn) return;
    if (isHeadphonesMuted) {
      headphonesBtn.classList.add('muted');
    } else {
      headphonesBtn.classList.remove('muted');
    }
  }

  function setupEventListeners() {
    const addServerBtn = document.getElementById('add-server-btn');
    if (addServerBtn) {
      addServerBtn.onclick = () => {
        document.getElementById('modal-overlay').style.display = 'flex';
      };
    }
    
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
      modalClose.onclick = () => {
        document.getElementById('modal-overlay').style.display = 'none';
      };
    }
    
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        const tabId = document.getElementById(`tab-${tab.dataset.tab}`);
        if (tabId) tabId.classList.add('active');
      };
    });
    
    const createGroupSubmit = document.getElementById('create-group-submit');
    if (createGroupSubmit) {
      createGroupSubmit.onclick = async () => {
        const nameInput = document.getElementById('new-group-name');
        const name = nameInput?.value.trim();
        if (!name) return alert('Введите название сервера');
        
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.group) {
          userGroupsData.push(data.group);
          renderServersList();
          selectServer(data.group._id);
          document.getElementById('modal-overlay').style.display = 'none';
          if (nameInput) nameInput.value = '';
        } else {
          alert('Ошибка создания');
        }
      };
    }
    
    const joinGroupSubmit = document.getElementById('join-group-submit');
    if (joinGroupSubmit) {
      joinGroupSubmit.onclick = async () => {
        const inviteInput = document.getElementById('invite-code-input');
        const inviteId = inviteInput?.value.trim();
        if (!inviteId) return alert('Введите код-приглашение');
        
        const res = await fetch('/api/groups/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteId })
        });
        const data = await res.json();
        if (data.group) {
          userGroupsData.push(data.group);
          renderServersList();
          selectServer(data.group._id);
          document.getElementById('modal-overlay').style.display = 'none';
          if (inviteInput) inviteInput.value = '';
        } else {
          alert('Группа не найдена');
        }
      };
    }
    
    if (addChannelBtn) {
      addChannelBtn.onclick = () => {
        document.getElementById('channel-type-modal').style.display = 'flex';
      };
    }

    // Обработчики выбора типа канала
    document.querySelectorAll('.channel-type-btn').forEach(btn => {
      btn.onclick = async () => {
        const type = btn.getAttribute('data-type');
        const modal = document.getElementById('channel-type-modal');
        modal.style.display = 'none';
        
        const name = prompt(`Введите название ${type === 'voice' ? 'голосового' : 'текстового'} канала:`);
        if (!name || name.length < 2) return alert('Название должно быть минимум 2 символа');
        if (!uiCurrentGroupId) return alert('Выберите группу');
        
        const res = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, groupId: uiCurrentGroupId, type })
        });
        const data = await res.json();
        if (data.channel) {
          const channelsRes = await fetch(`/api/groups/${uiCurrentGroupId}/channels`);
          if (channelsRes.ok) {
            const channelsData = await channelsRes.json();
            renderChannelsPanel(channelsData.channels || []);
          }
        } else {
          alert('Ошибка создания канала');
        }
      };
    });
    
    const channelModalClose = document.getElementById('channel-modal-close');
    if (channelModalClose) {
      channelModalClose.onclick = () => {
        document.getElementById('channel-modal-overlay').style.display = 'none';
      };
    }
    
    const createChannelSubmit = document.getElementById('create-channel-submit');
    if (createChannelSubmit) {
      createChannelSubmit.onclick = async () => {
        const channelNameInput = document.getElementById('new-channel-name');
        const name = channelNameInput?.value.trim();
        if (!name || name.length < 2) return alert('Название должно быть минимум 2 символа');
        if (!uiCurrentGroupId) return alert('Выберите группу');
        
        const res = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, groupId: uiCurrentGroupId })
        });
        const data = await res.json();
        if (data.channel) {
          const channelsRes = await fetch(`/api/groups/${uiCurrentGroupId}/channels`);
          if (channelsRes.ok) {
            const channelsData = await channelsRes.json();
            renderChannelsPanel(channelsData.channels || []);
            document.getElementById('channel-modal-overlay').style.display = 'none';
            if (channelNameInput) channelNameInput.value = '';
          }
        } else {
          alert('Ошибка создания канала');
        }
      };
    }
    
    if (micBtn) {
      micBtn.onclick = () => {
        if (!isInCall) return;
        isMicMuted = !isMicMuted;
        if (window.setMute) window.setMute(isMicMuted);
        updateMicButton();
      };
    }
    
    if (headphonesBtn) {
      headphonesBtn.onclick = () => {
        if (!isInCall) return;
        isHeadphonesMuted = !isHeadphonesMuted;
        updateHeadphonesButton();
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
          audio.muted = isHeadphonesMuted;
        });
      };
    }
    
    if (callBarLeaveBtn) {
      callBarLeaveBtn.onclick = async () => {
        if (!isInCall) return;
        
        if (window.leaveChannelWebRTC) {
          await window.leaveChannelWebRTC();
        }
        
        if (uiCurrentChannelId && uiCurrentGroupId && window.leaveChannelSocket) {
          window.leaveChannelSocket(uiCurrentChannelId, uiCurrentGroupId);
        }
        
        uiCurrentChannelId = null;
        exitCallMode();
      };
    }
    
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
      userAvatar.style.cursor = 'pointer';
      userAvatar.onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      };
    }
  }

  window.updateVoiceUsersList = (users) => {
    if (!voiceUsersList) return;
    if (usersCountSpan) usersCountSpan.textContent = users.length;
    
    voiceUsersList.innerHTML = '';
    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'voice-user-item';
      userDiv.innerHTML = `
        <div class="voice-user-avatar">${user.username.charAt(0).toUpperCase()}</div>
        <div class="voice-user-name">${escapeHtml(user.username)}</div>
        <div class="voice-user-speaking">🔊</div>
      `;
      voiceUsersList.appendChild(userDiv);
    });
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.updateOnlineMembersList = (members) => {
    window.updateVoiceUsersList(members);
  };

  window.onUserJoinedChannel = ({ userId, username, socketId }) => {
    if (window.socket && socketId !== window.socket.id) {
      if (window.createPeerConnection) {
        setTimeout(() => {
          window.createPeerConnection(socketId, username);
        }, 500);
      }
    }
  };

  window.onUserLeftChannel = ({ socketId }) => {
    if (window.closePeerConnection) {
      window.closePeerConnection(socketId);
    }
  };

  window.onChannelParticipants = (participants) => {
    if (window.createPeerConnection && window.socket && window.socket.id) {
      for (const p of participants) {
        if (p.socketId !== window.socket.id) {
          setTimeout(() => {
            window.createPeerConnection(p.socketId, p.username);
          }, 1000);
        }
      }
    }
  };

  window.onSignal = (from, data) => {
    if (window.handleSignal) {
      window.handleSignal(from, data);
    }
  };

  window.forceLeaveChannel = () => {
    if (window.leaveChannelWebRTC) {
      window.leaveChannelWebRTC();
    }
    uiCurrentChannelId = null;
    exitCallMode();
  };

  // Текстовый чат
  function renderChat(channel) {
    console.log(' renderChat called for channel:', channel._id);
    currentTextChannelId = channel._id;
    console.log(' currentTextChannelId set to:', currentTextChannelId);
    
    const mainArea = document.querySelector('.main-area');
    if (!mainArea) return;
    
    // Проверяем, нужно ли перерисовывать чат
    if (mainArea.querySelector('.chat-container') && currentTextChannelId === channel._id) {
      console.log('Chat already rendered for this channel');
      return;
    }
    
    mainArea.innerHTML = `
      <div class="chat-container">
        <div class="chat-header">
          <div class="chat-header-title">
            <span class="channel-icon"></span>
            <span># ${escapeHtml(channel.name)}</span>
          </div>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div style="text-align: center; color: #8e9297; padding: 40px;">
            Загрузка сообщений...
          </div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <span class="chat-input-icon"></span>
            <input type="text" class="chat-input" id="chat-input" placeholder="Написать сообщение..." maxlength="2000">
            <button class="chat-send-btn" id="chat-send-btn">Отправить</button>
          </div>
        </div>
      </div>
    `;
    
    // Загружаем сообщения
    loadMessages(channel._id);
    
    // Подписываемся на текстовый канал
    if (window.socket) {
      window.socket.emit('join-text-channel', { channelId: channel._id });
    }
    
    // Настраиваем обработчики
    const messageInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    
    const sendMessage = () => {
      const content = messageInput?.value.trim();
      if (!content) return;
      
      if (window.socket) {
        window.socket.emit('send-message', { channelId: channel._id, content });
        messageInput.value = '';
      }
    };
    
    if (sendBtn) sendBtn.onclick = sendMessage;
    if (messageInput) {
      messageInput.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage();
      };
    }
  }
  
  async function loadMessages(channelId) {
    const res = await fetch(`/api/channels/${channelId}/messages`);
    if (res.ok) {
      const data = await res.json();
      currentChatMessages = data.messages;
      displayMessages();
    }
  }
  
  function displayMessages() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    if (currentChatMessages.length === 0) {
      messagesContainer.innerHTML = '<div style="text-align: center; color: #8e9297; padding: 40px;">Нет сообщений. Напишите первым!</div>';
      return;
    }
    
    messagesContainer.innerHTML = currentChatMessages.map(msg => `
      <div class="message-item">
        <div class="message-avatar">${msg.username.charAt(0).toUpperCase()}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-username">${escapeHtml(msg.username)}</span>
            <span class="message-time">${new Date(msg.createdAt).toLocaleString()}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.content)}</div>
        </div>
      </div>
    `).join('');
    
    // Скролл вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // function restoreVoiceUI() {
  //   currentTextChannelId = null;
  //   const mainArea = document.querySelector('.main-area');
  //   if (!mainArea) return;
    
  //   mainArea.innerHTML = `
  //     <div class="voice-container">
  //       <div class="voice-users-header">В КАНАЛЕ — <span id="users-count">0</span></div>
  //       <div class="voice-users-list" id="voice-users-list"></div>
  //     </div>
  //   `;
    
  //   // Перепривязываем глобальные переменные
  //   window.usersCountSpan = document.getElementById('users-count');
  //   window.voiceUsersList = document.getElementById('voice-users-list');
  // }
  function updateGroupMembersList(members) {
    console.log(' Updating group members UI:', members);
    const membersList = document.getElementById('members-list');
    const membersCount = document.getElementById('members-count');
    
    if (!membersList) {
      console.log(' members-list element not found');
      return;
    }
    
    if (membersCount) membersCount.textContent = members.length;
    
    membersList.innerHTML = '';
    members.forEach(member => {
      const memberDiv = document.createElement('div');
      memberDiv.className = 'member-item';
      memberDiv.innerHTML = `
        <div class="member-avatar">${member.username.charAt(0).toUpperCase()}</div>
        <div class="member-name">${escapeHtml(member.username)}</div>
        <div class="member-status"></div>
      `;
      membersList.appendChild(memberDiv);
    });
  }
  
  // Делаем функцию глобальной
  window.updateGroupMembersList = updateGroupMembersList;
  
  // Обновляем обработчик из socket
  window.updateGroupMembers = (members) => {
    updateGroupMembersList(members);
  };

  // Настройка слушателя обновления участников группы
  function setupGroupMembersListener() {
    const checkSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(checkSocket);
        console.log(' Setting up group-members-update listener');
        
        window.socket.on('group-members-update', (members) => {
          console.log(' Group members update received:', members);
          if (window.updateGroupMembers) {
            window.updateGroupMembers(members);
          } else {
            console.log(' window.updateGroupMembers not found, calling directly');
            updateGroupMembersList(members);
          }
        });
      }
    }, 500);
  }

  // Вызываем при загрузке
  setupGroupMembersListener();

  console.log('Discord UI loaded');
})();