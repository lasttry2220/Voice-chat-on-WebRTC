require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// СНАЧАЛА СОЗДАЁМ СЕССИЮ 
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.USE_HTTPS === 'true',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'lax'
  }
});

// Применяем к express
app.use(sessionMiddleware);

// НАСТРОЙКИ EXPRESS 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// СОЗДАЁМ СЕРВЕР 
let server;
if (process.env.USE_HTTPS === 'true') {
  try {
    const sslOptions = {
      key: fs.readFileSync('./ssl/key.pem'),
      cert: fs.readFileSync('./ssl/cert.pem')
    };
    server = https.createServer(sslOptions, app);
    console.log('✅ HTTPS server started');
  } catch (err) {
    console.error('SSL error:', err.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// СОЗДАЁМ SOCKET.IO 
const io = require('socket.io')(server, {
  cors: {
    origin: "https://147.45.147.121:3000",
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

//  ПЕРЕДАЁМ СЕССИЮ В SOCKET.IO 
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

//  ПРОВЕРКА АВТОРИЗАЦИИ 
io.use((socket, next) => {
  const session = socket.request.session;
  console.log('Socket handshake - session exists:', !!session);
  console.log('Session userId:', session?.userId);
  
  if (session && session.userId) {
    socket.userId = session.userId;
    socket.username = session.username;
    console.log(`✅ Socket authenticated: ${socket.username}`);
    next();
  } else {
    console.error('❌ Socket unauthorized - no session');
    next(new Error('Unauthorized'));
  }
});

// ПОДКЛЮЧЕНИЕ К MONGODB 
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Atlas connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Модели
const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Message = require('./models/Message');

// Middleware проверки авторизации
const authMiddleware = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

//  МАРШРУТЫ 
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login');
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register');
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.send('Username already exists');
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.send('Invalid credentials');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Invalid credentials');
    req.session.userId = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const groups = await Group.find({ members: user._id }).populate('creatorUserId', 'username');
    res.render('dashboard', { user, groups });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const inviteId = uuidv4();
    const group = new Group({
      name,
      creatorUserId: req.session.userId,
      members: [req.session.userId],
      inviteId
    });
    await group.save();
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups/join', authMiddleware, async (req, res) => {
  try {
    const { inviteId } = req.body;
    const group = await Group.findOne({ inviteId });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.members.includes(req.session.userId)) {
      group.members.push(req.session.userId);
      await group.save();
    }
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/groups/:groupId/channels', authMiddleware, async (req, res) => {
  try {
    const channels = await Channel.find({ groupId: req.params.groupId });
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'username');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json({ members: group.members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/groups', authMiddleware, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.session.userId }).populate('creatorUserId', 'username');
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

//  SOCKET.IO ЛОГИКА 
const userSockets = new Map();
const groupOnline = new Map();
const userCurrentChannel = new Map();

io.on('connection', (socket) => {
  console.log(`User ${socket.username} connected with socket ${socket.id}`);
  const userId = socket.userId;
  userSockets.set(userId, socket.id);

  socket.on('join-group', async (groupId) => {
    console.log(`User ${socket.username} joining group ${groupId}`);
    const group = await Group.findById(groupId);
    if (!group || !group.members.includes(userId)) {
      console.log(`User ${socket.username} not authorized for group ${groupId}`);
      return;
    }
    socket.join(`group:${groupId}`);
    if (!groupOnline.has(groupId)) groupOnline.set(groupId, new Set());
    groupOnline.get(groupId).add(socket.id);
    const onlineMembers = await getOnlineMembers(groupId);
    io.to(`group:${groupId}`).emit('group-online-update', onlineMembers);
    
    // Отправляем список участников группы
    const groupMembers = await getGroupMembers(groupId);
    io.to(`group:${groupId}`).emit('group-members-update', groupMembers);
    console.log(`📡 Sent group members update to group ${groupId}:`, groupMembers.length, 'members');
  });

  socket.on('leave-group', async (groupId) => {
    if (groupOnline.has(groupId)) {
      groupOnline.get(groupId).delete(socket.id);
    }
    socket.leave(`group:${groupId}`);
    const onlineMembers = await getOnlineMembers(groupId);
    io.to(`group:${groupId}`).emit('group-online-update', onlineMembers);
  });

  socket.on('join-channel', async ({ channelId, groupId }) => {
    console.log(`User ${socket.username} joining channel ${channelId} in group ${groupId}`);
    const group = await Group.findById(groupId);
    if (!group || !group.members.includes(userId)) return;
    
    const current = userCurrentChannel.get(socket.id);
    if (current) {
      const [oldGroupId, oldChannelId] = current.split(':');
      socket.leave(`channel:${oldChannelId}`);
      socket.to(`channel:${oldChannelId}`).emit('user-left-channel', { socketId: socket.id });
      userCurrentChannel.delete(socket.id);
    }
    
    const channelRoom = `channel:${channelId}`;
    socket.join(channelRoom);
    userCurrentChannel.set(socket.id, `${groupId}:${channelId}`);
    socket.to(channelRoom).emit('user-joined-channel', { 
      userId: socket.userId, 
      username: socket.username, 
      socketId: socket.id 
    });
    
    const socketsInRoom = await io.in(channelRoom).fetchSockets();
    const participants = socketsInRoom.map(s => ({ 
      userId: s.userId, 
      username: s.username, 
      socketId: s.id 
    }));
    socket.emit('channel-participants', participants);
  });

  socket.on('leave-channel', async ({ channelId, groupId }) => {
    const current = userCurrentChannel.get(socket.id);
    if (current === `${groupId}:${channelId}`) {
      socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('user-left-channel', { socketId: socket.id });
      userCurrentChannel.delete(socket.id);
    }
  });

  socket.on('signal', ({ to, from, data }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('signal', { from, data });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.username} disconnected`);
    const currentChannel = userCurrentChannel.get(socket.id);
    if (currentChannel) {
      const [groupId, channelId] = currentChannel.split(':');
      socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('user-left-channel', { socketId: socket.id });
      userCurrentChannel.delete(socket.id);
    }
    userSockets.delete(userId);
  });

   // Обработка отправки сообщения в текстовый канал
   socket.on('send-message', async ({ channelId, content }) => {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel || channel.type !== 'text') return;
      
      const group = await Group.findById(channel.groupId);
      if (!group || !group.members.includes(socket.userId)) return;
      
      const message = new Message({
        channelId,
        userId: socket.userId,
        username: socket.username,
        content: content.substring(0, 2000)
      });
      await message.save();

      console.log(`📤 Sending message to channel ${channelId}`);
      console.log(`📤 Room name: channel:${channelId}`);
      
      // Отправляем сообщение всем в комнате канала
      io.to(`channel:${channelId}`).emit('new-message', {
        _id: message._id,
        channelId,
        userId: socket.userId,
        username: socket.username,
        content: message.content,
        createdAt: message.createdAt
      });

      console.log('✅ Message sent to room');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  });
  
  //  получения сообщений
  socket.on('join-text-channel', async ({ channelId }) => {
    const channel = await Channel.findById(channelId);
    if (!channel || channel.type !== 'text') return;
    
    const group = await Group.findById(channel.groupId);
    if (!group || !group.members.includes(socket.userId)) return;
    
    socket.join(`channel:${channelId}`);
    console.log(`User ${socket.username} joined text channel ${channelId}`);
  });
  
  socket.on('leave-text-channel', ({ channelId }) => {
    socket.leave(`channel:${channelId}`);
  });
});

async function getOnlineMembers(groupId) {
  const socketsSet = groupOnline.get(groupId);
  if (!socketsSet) return [];
  const members = [];
  for (const socketId of socketsSet) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      members.push({ userId: sock.userId, username: sock.username, socketId: sock.id });
    }
  }
  return members;
}

// Функция получения участников группы
async function getGroupMembers(groupId) {
  const group = await Group.findById(groupId).populate('members', 'username');
  if (!group) return [];
  return group.members.map(m => ({
    userId: m._id,
    username: m.username
  }));
}

// МАРШРУТЫ ДЛЯ ТЕКСТОВОГО ЧАТА 

// Получение сообщений канала
app.get('/api/channels/:channelId/messages', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    
    const group = await Group.findById(channel.groupId);
    if (!group || !group.members.includes(req.session.userId)) {
      return res.status(403).json({ error: 'Not a member' });
    }
    
    const messages = await Message.find({ channelId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создание канала с типом
app.post('/api/channels', authMiddleware, async (req, res) => {
  try {
    const { name, groupId, type } = req.body;
    const group = await Group.findById(groupId);
    if (!group || !group.members.includes(req.session.userId)) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const channel = new Channel({ name, groupId, type: type || 'voice' });
    await channel.save();
    res.json({ channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ЗАПУСК 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});


