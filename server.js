const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');

const Group = require('./models/Group');
const Room = require('./models/Room').model('Room');
const User = require('./models/User');

const app = express();

// Получение групп с проверкой владельца
const authenticate = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};

// Конфигурация
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors({
  origin: ['https://192.168.1.2', 'http://localhost'],
  credentials: true,
  exposedHeaders: ['_csrf']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



// Настройка сессии
const sessionMiddleware = session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: 'mongodb://localhost:27017/webrtc',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
});
app.use(sessionMiddleware);

// Passport
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// CSRF Protection
const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
});
app.use(csrfProtection);

// Передача CSRF-токена
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// Стратегия аутентификации
passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username.toLowerCase().trim() });
      if (!user) return done(null, false, { message: 'Пользователь не найден' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: 'Неверный пароль' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Маршруты
// обработчик dashboard
app.get('/dashboard', authenticate, (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.render('index', { 
    csrfToken: req.csrfToken() // Передаем токен в шаблон
  });
});

app.get('/api/check-auth', authenticate, (req, res) => {
  res.status(200).json({ authenticated: true });
});

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  res.render('login', { 
    messages: req.flash(),
    csrfToken: req.csrfToken()
  });
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info.message);
      return res.redirect('/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

app.get('/register', (req, res) => {
  res.render('register', { 
    messages: req.flash(),
    csrfToken: req.csrfToken()
  });
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = username.toLowerCase().trim();

    if (!normalizedUsername || !password) {
      req.flash('error', 'Все поля обязательны');
      return res.redirect('/register');
    }

    if (password.length < 6) {
      req.flash('error', 'Пароль должен быть не менее 6 символов');
      return res.redirect('/register');
    }

    const existingUser = await User.findOne({ username: normalizedUsername });
    if (existingUser) {
      req.flash('error', 'Имя пользователя уже занято');
      return res.redirect('/register');
    }

    const newUser = new User({ 
      username: normalizedUsername,
      password
    });

    await newUser.save();
    req.flash('success', 'Регистрация успешна! Войдите в систему');
    res.redirect('/login');

  } catch (err) {
    req.flash('error', 'Ошибка сервера');
    res.redirect('/register');
  }
});
// Маршрут для выхода
app.post('/api/logout', csrfProtection, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Ошибка уничтожения сессии:', err);
      return res.status(500).json({ 
        error: 'Ошибка выхода',
        details: process.env.NODE_ENV === 'development' ? err.message : null
      });
    }

    res.clearCookie('connect.sid');
    res.clearCookie('_csrf');
    res.status(200).json({ success: true });
  });
});

// API маршруты
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find({ owner: req.user._id }).populate('rooms');
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки групп' });
  }
});

app.get('/api/groups/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate({
        path: 'rooms',
        populate: { path: 'participants', select: 'username' }
      });
      
    if (!group || group.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки группы' });
  }
});
  
// Теперь можно использовать authenticate в маршрутах
app.get('/api/groups', authenticate, async (req, res) => {
  try {
    const groups = await Group.find({ 
      $or: [
        { owner: req.user._id },
        { participants: req.user._id }
      ]
    }).populate('rooms');
    
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки групп' });
  }
});

// Защищенные маршруты


app.get('/group/:id', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'group.html'));
});

// WebSocket
const httpServer = http.createServer(app);
const httpsServer = https.createServer({
  key: fs.readFileSync(path.join(__dirname, 'certs', 'private.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt'))
}, app);

const io = socketIo(httpsServer, {
  cors: {
    origin: ['https://192.168.1.2', 'http://localhost'],
    credentials: true
  }
});

// Интеграция аутентификации
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });
  
  io.use((socket, next) => {
    const req = socket.request;
    
    // Проверяем наличие пользователя в сессии
    if (req.session && req.session.passport && req.session.passport.user) {
      // Добавляем пользователя в объект запроса
      User.findById(req.session.passport.user)
        .then(user => {
          req.user = user;
          next();
        })
        .catch(err => next(new Error('Authentication error')));
    } else {
      next(new Error('Unauthorized'));
    }
  });
// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/webrtc')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// WebSocket логика
io.on('connection', (socket) => {
  const clientIp = socket.request.connection.remoteAddress;
  console.log(`New client connected from IP: ${clientIp}`);

  // Обработчик создания группы
  socket.on('createGroup', async (groupName) => {
    try {
      const user = socket.request.user;
      const group = new Group({
        name: groupName,
        owner: user._id,
        participants: [user._id] // Добавляем владельца в участники
      });
      await group.save();
      
      socket.emit('groupCreated', { 
        groupCode: group._id, 
        groupName: group.name 
      });
    } catch (error) {
      console.error('Error creating group:', error);
    }
  });

  // Обработчик присоединения к группе
  socket.on('joinGroup', async (groupCode) => {
    try {
      const user = socket.request.user;
      const group = await Group.findById(groupCode);
      
      if (group) {
        // Добавляем пользователя в участники если его нет
        if (!group.participants.includes(user._id)) {
          group.participants.push(user._id);
          await group.save();
        // Отправляем обновленный список всем участникам
          const updatedGroups = await Group.find({
            $or: [
              { owner: user._id },
              { participants: user._id }
            ]
          });
          
            // Отправляем обновление только текущему пользователю
            socket.emit('groupsList', updatedGroups.map(g => ({
              groupCode: g._id,
              groupName: g.name
            })));
          }
        socket.join(groupCode);
      }
    } catch (error) {
      console.error('Error joining group:', error);
    }
  });

  // Обработчик получения списка групп
socket.on('getGroups', async () => {
  try {
    const user = socket.request.user;
    if (!user) return;
    
    const groups = await Group.find({
      $or: [
        { owner: user._id },
        { participants: user._id }
      ]
    }).populate('owner', 'username');
    
    socket.emit('groupsList', groups.map(g => ({
      groupCode: g._id,
      groupName: g.name,
      isOwner: g.owner._id.equals(user._id)
    })));
  } catch (error) {
    console.error('Error getting groups:', error);
  }
});

// Обработчик обновления списка групп
socket.on('groupsList', (groups) => {
  groupList.innerHTML = '';
  groups.forEach(group => {
    const li = document.createElement('li');
    li.innerHTML = `
      ${group.groupName} 
      <span class="group-code">(${group.groupCode})</span>
      ${group.isOwner ? '<span class="owner-badge">Owner</span>' : ''}
    `;
    li.addEventListener('click', () => joinGroup(group.groupCode));
    groupList.appendChild(li);
  });
});

  socket.on('createRoom', async (groupCode, roomName) => {
    try {
      // Добавляем валидацию
      if (!mongoose.Types.ObjectId.isValid(groupCode)) {
        return socket.emit('error', 'Invalid group ID');
      }

      const group = await Group.findById(groupCode);
      const room = new Room({ name: roomName, group: groupCode });
      await room.save();
      
      group.rooms.push(room._id);
      await group.save();
      
      // Отправляем обновленный список комнат ВСЕМ подключенным клиентам в группе
      const updatedRooms = await Room.find({ group: groupCode });
      io.to(groupCode).emit('roomsList', updatedRooms.map(r => ({
        id: r._id,
        name: r.name
      })));
    } catch (error) {
      console.error('Error creating room:', error);
    }
  });

  function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

  socket.on('joinRoom', async ({ roomCode, groupCode }) => {
    try {
        console.log('[Server] JoinRoom attempt:', {
            user: socket.request.user._id,
            roomCode: roomCode,
            groupCode: groupCode,
            validRoom: isValidObjectId(roomCode),
            validGroup: isValidObjectId(groupCode)
        });

        // Проверка валидности ID
        if (!isValidObjectId(roomCode)) {
            console.error('Invalid roomCode format');
            return socket.emit('error', 'Invalid room ID format');
        }

        const group = await Group.findById(groupCode);
        if (!group) {
            console.error('Group not found');
            return socket.emit('error', 'Group not found');
        }

        const room = await Room.findById(roomCode);
        if (!room) {
            console.error('Room not found');
            return socket.emit('error', 'Room not found');
        }

        // Проверка принадлежности комнаты к группе
        if (room.group.toString() !== groupCode) {
            console.error('Room does not belong to the group');
            return socket.emit('error', 'Room-group mismatch');
        }

        // Проверка прав доступа
        if (!group.participants.includes(socket.request.user._id)) {
            console.error('User not in group participants');
            return socket.emit('error', 'Access denied');
        }

        socket.join(roomCode);
        console.log(`[Server] User joined: ${socket.request.user.username} to room ${room.name}`);

        // Отправляем подтверждение
        socket.emit('roomJoined', {
            roomId: room._id,
            roomName: room.name
        });

    } catch (error) {
        console.error('[Server] JoinRoom error:', error);
        socket.emit('error', 'Server error');
    }
  });

  socket.on('signal', (data) => {
      socket.to(data.room).emit('signal', data);
  });

  socket.on('getRooms', async (groupCode) => {
    try {
      // Проверяем валидность ID
      if (!mongoose.Types.ObjectId.isValid(groupCode)) {
        return socket.emit('error', 'Invalid group ID');
      }
  
      const rooms = await Room.find({ group: groupCode })
        .lean()
        .exec();
      
      socket.emit('roomsList', rooms.map(r => ({
        id: r._id.toString(),
        name: r.name
      })));
    } 
    catch (error) {
      console.error('Error fetching rooms:', error);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    // Можно отправить сообщение об ошибке клиенту
    socket.emit('errorMessage', error.message);
  });


  socket.on('disconnect', () => {
      console.log('Client disconnected');
  });
});

// Порт
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

httpServer.listen(HTTP_PORT, () => 
  console.log(`HTTP сервер запущен на порту ${HTTP_PORT}`));

httpsServer.listen(HTTPS_PORT, () => 
  console.log(`HTTPS сервер запущен на порту ${HTTPS_PORT}`));

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Внутренняя ошибка сервера');
});