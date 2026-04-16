# Голосовой Чат Приложение

Приложение для голосового и текстового общения в реальном времени с интерфейсом в стиле Discord. Построено на WebRTC (Mesh архитектура), Node.js, Express, MongoDB и Socket.IO.

## Возможности

- Регистрация и вход пользователей (сессионная авторизация)
- Создание и подключение к серверам (группам) по коду-приглашению
- Голосовые каналы с передачей звука P2P (Mesh архитектура)
- Текстовые каналы с обменом сообщениями в реальном времени
- Управление голосом: отключение микрофона, отключение звука (локально), выход из звонка
- Список онлайн участников в группе
- Мгновенное обновление сообщений через WebSockets
- Адаптивный дизайн

## Технологии

| Компонент           | Технология        |
|---------------------|-------------------|
| Бэкенд              | Node.js + Express |
| База данных         | MongoDB (Atlas)   |
| Реал-тайм           | Socket.IO         |
| Голос               | WebRTC (Mesh)     |
| Шаблонизация        | EJS               |
| Авторизация         | Express Session   |
| Хеширование паролей | bcrypt            |

## Как работает передача звука (Mesh архитектура)

### Общая схема

В Mesh архитектуре каждый пользователь подключается напрямую к каждому другому пользователю в голосовом канале. Через сервер проходит только сигнал, сами аудиоданные идут напрямую между участниками.

Пользователь А 
│
├─────────────────────────────────────┐
│                   │                 N(пользователь)
▼                   ▼
Пользователь Б Пользователь В
(зашёл вторым) (зашёл третьим)

Каждый пользователь соединён с каждым (Полная Mesh)



### Пошаговый процесс работы голоса

#### 1. Получение доступа к микрофону

```javascript
localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
Браузер запрашивает разрешение на использование микрофона. После разрешения пользователя получается локальный аудиопоток.

2. Вход в голосовой канал
Когда пользователь нажимает на голосовой канал:

javascript
window.joinChannelWebRTC(channelId, groupId)  // Подготовка WebRTC
window.joinChannelSocket(channelId, groupId)   // Уведомление сервера
Сервер добавляет пользователя в комнату канала и уведомляет остальных участников.

3. Создание Peer-соединений
Когда пользователь получает список участников, для каждого удалённого пользователя:

javascript
const pc = new RTCPeerConnection(configuration);
localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
pc.createOffer()
  .then(offer => pc.setLocalDescription(offer))
  .then(() => window.sendSignal(remoteSocketId, { type: 'offer', sdp: pc.localDescription }));
4. Сигнализация (обмен SDP/ICE)

Инициатор (А)                    Получатель (Б)
      │                                  │
      │────────── ПРЕДЛОЖЕНИЕ ──────────►│
      │    (возможности, ICE кандидаты)  │
      │                                  │
      │◄───────── ОТВЕТ ─────────────────│
      │    (возможности получателя)      │
      │                                  │
      │◄───────── ICE КАНДИДАТ ──────────│
      │    (информация о сетевом пути)   │
      │                                  │
      │────────── ICE КАНДИДАТ ─────────►│
      │                                  │
      ▼                                  ▼
  Соединение установлено!
5. Передача звука
javascript
pc.ontrack = (event) => {
  const audioElement = new Audio();
  audioElement.srcObject = event.streams[0];
  audioElement.autoplay = true;
  document.body.appendChild(audioElement);
};
6. Отключение микрофона (Mute)
javascript
window.setMute = (muted) => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) audioTrack.enabled = !muted;
};
Установка enabled = false останавливает отправку звука всем собеседникам.

7. Выход из канала
javascript
for (const [socketId, pc] of peerConnections.entries()) {
  pc.close();
  peerConnections.delete(socketId);
}
document.querySelectorAll('audio').forEach(audio => audio.remove());
Ключевые компоненты WebRTC
Компонент	Роль
STUN сервер	Помогает найти внешний IP-адрес (обходит NAT)
Socket.IO	Передача сигналов (предложение, ответ, ICE кандидаты)
RTCPeerConnection	P2P соединение для передачи аудио
getUserMedia	Доступ к микрофону
localStream	Локальный аудиопоток
ontrack	Получение удалённых аудиопотоков
Ограничения Mesh архитектуры

При 5 участниках в канале:
- Каждый пользователь отправляет аудио 4 другим
- Каждый пользователь получает аудио от 4 других
- Исходящий трафик: ~400 Кбит/с
- Входящий трафик: ~400 Кбит/с
- Нагрузка на процессор растёт с каждым новым участником
Рекомендуемый максимум: 5-6 участников для стабильной работы.

Как работает авторизация
Регистрация
Пользователь вводит имя пользователя и пароль

Сервер проверяет, существует ли уже такой пользователь

Пароль хешируется с помощью bcrypt

Документ пользователя сохраняется в MongoDB

Пользователь перенаправляется на страницу входа

Что хранится в MongoDB
javascript
{
  "_id": "6942d5761711547830e547e4",
  "username": "alex",
  "password": "$2b$10$9Yz8uXj2Kq..."  // хеш bcrypt, не открытый текст
}
Вход в систему
Пользователь отправляет логин и пароль

Сервер находит пользователя по имени

Сравнивает введённый пароль с хешем в базе через bcrypt.compare

Если данные верны, создаётся сессия

ID сессии отправляется браузеру в виде cookie

Настройка сессии
javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,  // 24 часа
    httpOnly: true
  }
}));
Middleware авторизации
javascript
const authMiddleware = (req, res, next) => {
  if (req.session.userId) {
    next();  // Пользователь авторизован
  } else {
    res.redirect('/login');  // Перенаправление на страницу входа
  }
};

// Защита маршрутов
app.get('/dashboard', authMiddleware, (req, res) => { ... });
Схема работы сессии

Браузер                    Сервер                    MongoDB
   │                         │                          │
   │  POST /login            │                          │
   │────────────────────────►│                          │
   │  (username, password)   │  ПОИСК пользователя      │
   │                         │─────────────────────────►│
   │                         │                          │
   │  Set-Cookie: sessionId  │                          │
   │◄────────────────────────│                          │
   │                         │                          │
   │  GET /dashboard         │                          │
   │  Cookie: sessionId      │                          │
   │────────────────────────►│  Проверка сессии         │
   │                         │     авторизован          │
   │  Страница dashboard     │                          │
   │◄────────────────────────│                          │
Выход из аккаунта
javascript
app.post('/api/logout', (req, res) => {
  req.session.destroy();  // Удаление сессии на сервере
  res.json({ success: true });
});
Как работает текстовый чат
Общая схема
В отличие от голосового чата, который использует P2P WebRTC, текстовый чат проходит через сервер. Все сообщения идут через сервер, сохраняются в MongoDB и рассылаются участникам канала.

Модели базы данных
Модель сообщения:

javascript
{
  _id: "507f1f77bcf86cd799439011",
  channelId: "69df9e96d43a6c151f65163b",  // ID текстового канала
  userId: "6942d5761711547830e547e4",     // ID автора
  username: "alex",                       // Имя автора
  content: "Всем привет!",                // Текст сообщения
  createdAt: "2024-01-15T10:30:00.000Z"   // Время отправки
}
Модель канала (с типом):

javascript
{
  _id: "69df9e96d43a6c151f65163b",
  name: "общий",
  groupId: "69de4d0fd0042cc5b784446e",    // ID группы
  type: "text"                            // 'text' или 'voice'
}
Пошаговый процесс работы текстового чата
1. Вход в текстовый канал
javascript
// Клиент нажимает на текстовый канал
window.socket.emit('join-text-channel', { channelId: channel._id });
Сервер добавляет сокет в комнату канала:

javascript
socket.on('join-text-channel', async ({ channelId }) => {
  const channel = await Channel.findById(channelId);
  const group = await Group.findById(channel.groupId);
  
  if (group.members.includes(socket.userId)) {
    socket.join(`channel:${channelId}`);
  }
});
2. Загрузка истории сообщений
javascript
// Клиент запрашивает историю сообщений
const res = await fetch(`/api/channels/${channelId}/messages`);
Сервер возвращает последние 100 сообщений:

javascript
app.get('/api/channels/:channelId/messages', authMiddleware, async (req, res) => {
  const messages = await Message.find({ channelId })
    .sort({ createdAt: -1 })  // Сначала новые
    .limit(100)                // Максимум 100 сообщений
    .lean();
  
  res.json({ messages: messages.reverse() });  // Старые сверху для отображения
});
3. Отправка сообщения
javascript
// Пользователь нажал Enter
window.socket.emit('send-message', { 
  channelId: channel._id, 
  content: текстСообщения 
});
Сервер обрабатывает и рассылает:

javascript
socket.on('send-message', async ({ channelId, content }) => {
  // 1. Сохранение в базу данных
  const message = new Message({
    channelId,
    userId: socket.userId,
    username: socket.username,
    content: content
  });
  await message.save();
  
  // 2. Рассылка всем пользователям в комнате канала
  io.to(`channel:${channelId}`).emit('new-message', {
    _id: message._id,
    channelId,
    username: socket.username,
    content: message.content,
    createdAt: message.createdAt
  });
});
4. Получение сообщений в реальном времени
javascript
// Клиент слушает новые сообщения
window.socket.on('new-message', (message) => {
  if (currentTextChannelId === message.channelId) {
    currentChatMessages.push(message);
    displayMessages();
    
    // Авто-прокрутка вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
});
5. Отображение сообщений
javascript
function displayMessages() {
  messagesContainer.innerHTML = currentChatMessages.map(msg => `
    <div class="message-item">
      <div class="message-avatar">${msg.username[0]}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-username">${escapeHtml(msg.username)}</span>
          <span class="message-time">${new Date(msg.createdAt).toLocaleString()}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.content)}</div>
      </div>
    </div>
  `).join('');
}
Полная схема работы текстового чата

Пользователь А                    Сервер                    Пользователь Б
      │                              │                              │
      │  1. join-text-channel        │                              │
      │─────────────────────────────►│                              │
      │                              │  Добавление сокета в комнату  │
      │                              │                              │
      │  2. GET /messages            │                              │
      │─────────────────────────────►│                              │
      │                              │  Запрос в MongoDB            │
      │                              │─────────────────────────────►│
      │  3. История сообщений        │                              │
      │◄─────────────────────────────│                              │
      │                              │                              │
      │  4. send-message             │                              │
      │─────────────────────────────►│                              │
      │                              │  Сохранение в MongoDB        │
      │                              │─────────────────────────────►│
      │                              │                              │
      │                              │  5. new-message (рассылка)   │
      │                              │─────────────────────────────►│
      │  6. new-message              │                              │
      │◄─────────────────────────────│                              │

Сравнение голосового и текстового чата
Аспект	Голосовой чат	Текстовый чат
Тип данных	Аудиопоток	Текст
Протокол	WebRTC (P2P)	Socket.IO (через сервер)
Роль сервера	Только сигнализация	Хранение и пересылка сообщений
История	Не хранится	Хранится в MongoDB
Задержка	Минимальная (<100 мс)	Незаметная
Масштабируемость	До 5-6 участников	Практически без ограничений


###Структура проекта

voice-chat/
├── server.js                 # Основной сервер (Express + Socket.IO)
├── package.json
├── .env.example
├── models/
│   ├── User.js              # Модель пользователя
│   ├── Group.js             # Модель группы
│   ├── Channel.js           # Модель канала (голосовой/текстовый)
│   └── Message.js           # Модель сообщения
├── views/
│   ├── login.ejs            # Страница входа
│   ├── register.ejs         # Страница регистрации
│   └── dashboard.ejs        # Главная страница приложения
├── public/
│   ├── css/
│   │   └── discord-style.css
│   └── js/
│       ├── socket.js        # Socket.IO клиент
│       ├── webrtc.js        # WebRTC логика
│       └── discord-ui.js    # UI контроллер
└── ssl/                     # SSL сертификаты (опционально)
Установка
Требования
Node.js (версия 14 или выше)

MongoDB (локальная или Atlas)

SSL сертификаты для HTTPS (требуется для WebRTC)

Настройка

-Клонируйте репозиторий

-Установите зависимости:

bash
npm install
Создайте файл .env:

env
PORT=3000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database
SESSION_SECRET=your_secret_key_here
USE_HTTPS=false
Для HTTPS (требуется для WebRTC на удалённых серверах):

bash
mkdir ssl
cd ssl
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
cd ..

-Запустите сервер:

bash
npm start

-Откройте браузер по адресу https://ваш-сервер:3000 

Переменные окружения
Переменная	        Описание
PORT	            Порт сервера (по умолчанию: 3000)
MONGO_URI	        Строка подключения к MongoDB
SESSION_SECRET	    Секретный ключ для шифрования сессий
USE_HTTPS	        Включение HTTPS (true/false)




API Endpoints
Авторизация
Метод	    Endpoint	    Описание
GET	        /login	        Страница входа
GET	        /register	    Страница регистрации
POST	    /login	        Обработка входа
POST	    /register	    Обработка регистрации
POST	    /api/logout     Выход из аккаунта


Группы
Метод	    Endpoint	                        Описание
POST	    /api/groups	                        Создание группы
POST	    /api/groups/join	                Подключение к группе по коду
GET	        /api/user/groups	                Получение групп пользователя
GET	        /api/groups/:groupId/channels	    Получение каналов группы
GET	        /api/groups/:groupId/members	    Получение участников группы


Каналы
Метод	    Endpoint	                            Описание
POST	    /api/channels	                        Создание канала (голосовой или текстовый)
GET	        /api/channels/:channelId/messages	    Получение сообщений текстового канала


WebSocket события
Клиент → Сервер
Событие	            Данные	                    Описание
join-group	        { groupId }	                Подключение к группе
leave-group	        { groupId }	                Выход из группы
join-channel	    { channelId, groupId }	    Вход в голосовой канал
leave-channel	    { channelId, groupId }	    Выход из голосового канала
join-text-channel	{ channelId }	            Вход в текстовый канал
leave-text-channel	{ channelId }	            Выход из текстового канала
send-message	    { channelId, content }	    Отправка текстового сообщения
signal	            { to, from, data }	        Сигнализация WebRTC


Сервер → Клиент
Событие	                Данные	                            Описание
group-online-update	    [members]	                        Обновление списка онлайн
group-members-update	[members]	                        Все участники группы
channel-participants	[participants]	                    Участники голосового канала
user-joined-channel	    { userId, username, socketId }	    Новый пользователь в канале
user-left-channel	    { socketId }	                    Пользователь покинул канал
new-message	            { message }	                        Новое текстовое сообщение
signal	                { from, data }	                    Сигнализация WebRTC


Поддержка браузеров
WebRTC требует HTTPS (кроме localhost). Поддерживаемые браузеры:

Chrome (последняя версия)

Firefox (последняя версия)

Edge (последняя версия)

Safari (последняя версия) — требуется включить MediaRecorder в экспериментальных настройках



###Ограничения
Mesh архитектура ограничивает голосовые каналы 5-6 одновременными пользователями

Качество звука зависит от пропускной способности интернета участников

Отсутствует запись голоса и воспроизведение

Текстовые сообщения ограничены 2000 символами