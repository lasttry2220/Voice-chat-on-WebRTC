// Discord-style UI Controller
(function() {
  let uiCurrentGroupId = null;
  let uiCurrentChannelId = null;
  let userGroupsData = [];
  let currentGroupData = null;
  
  let isMicMuted = false;
  let isHeadphonesMuted = false;
  let isInCall = false;

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
  });

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
        crown.textContent = '👑';
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
    
    if (addChannelBtn) {
      // Вариант 1: Для всех пользователей
      addChannelBtn.style.display = 'flex';
      
      // Вариант 2: Только для владельца
      // const isOwner = currentGroupData && currentGroupData.creatorUserId === window.currentUserId;
      // addChannelBtn.style.display = isOwner ? 'flex' : 'none';
    }
    
    if (window.joinGroupSocket) window.joinGroupSocket(groupId);
  }

  function renderChannelsPanel(channels) {
    if (!channelsListPanel) return;
    channelsListPanel.innerHTML = '';
    
    channels.forEach(channel => {
      const channelDiv = document.createElement('div');
      channelDiv.className = 'channel-item';
      if (uiCurrentChannelId === channel._id) channelDiv.classList.add('active');
      channelDiv.innerHTML = `
        <span class="channel-icon">🔊</span>
        <span class="channel-name">${escapeHtml(channel.name)}</span>
      `;
      channelDiv.onclick = () => selectChannel(channel);
      channelsListPanel.appendChild(channelDiv);
    });
  }

  async function selectChannel(channel) {
    console.log('=== selectChannel called ===', channel.name);
    
    uiCurrentChannelId = channel._id;
    
    document.querySelectorAll('.channel-item').forEach(el => {
      el.classList.remove('active');
      if (el.querySelector('.channel-name')?.textContent === channel.name) {
        el.classList.add('active');
      }
    });
    
    if (window.joinChannelWebRTC) {
      const success = await window.joinChannelWebRTC(channel._id, uiCurrentGroupId);
      if (success && window.joinChannelSocket) {
        window.joinChannelSocket(channel._id, uiCurrentGroupId);
        enterCallMode(channel.name);
      }
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
        document.getElementById('channel-modal-overlay').style.display = 'flex';
      };
    }
    
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

  console.log('Discord UI loaded');
})();