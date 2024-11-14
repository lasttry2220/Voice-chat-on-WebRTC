const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const Group = require('./models/Group');
const Room = require('./models/Room');

const app = express();

// Устанавливаем директорию для статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Добавляем middleware для CORS
app.use(cors());

// Добавляем маршрут для корневого URL, чтобы обслуживать index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer({
    key: fs.readFileSync(path.join(__dirname, 'certs', 'private.key')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt'))
}, app);

const io = socketIo(httpsServer);

// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/webrtc')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

io.on('connection', (socket) => {
    const clientIp = socket.request.connection.remoteAddress;
    console.log(`New client connected from IP: ${clientIp}`);

    socket.on('createGroup', async (groupName) => {
        try {
            const group = new Group({ name: groupName });
            await group.save();
            socket.emit('groupCreated', { groupCode: group._id, groupName: group.name });
            console.log(`Group created with code: ${group._id}`);
        } catch (error) {
            console.error('Error creating group:', error);
        }
    });

    socket.on('joinGroup', async (groupCode) => {
        try {
            const group = await Group.findById(groupCode);
            if (group) {
                socket.join(groupCode);
                console.log(`Client joined group: ${groupCode}`);
            } else {
                console.error(`Group with code ${groupCode} does not exist.`);
            }
        } catch (error) {
            console.error('Error joining group:', error);
        }
    });

    socket.on('createRoom', async (groupCode) => {
        try {
            const group = await Group.findById(groupCode);
            if (group) {
                const room = new Room({ name: `Room-${uuidv4()}` });
                await room.save();
                group.rooms.push(room._id);
                await group.save();
                io.to(groupCode).emit('roomCreated', { roomCode: room._id, roomName: room.name });
                console.log(`Room created with code: ${room._id}`);
            } else {
                console.error(`Group with code ${groupCode} does not exist.`);
            }
        } catch (error) {
            console.error('Error creating room:', error);
        }
    });

    socket.on('joinRoom', async ({ roomCode, groupCode }) => {
        try {
            const group = await Group.findById(groupCode);
            if (group) {
                const room = await Room.findById(roomCode);
                if (room) {
                    socket.join(roomCode);
                    console.log(`Client joined room: ${roomCode}`);
                } else {
                    console.error(`Room with code ${roomCode} does not exist in group ${groupCode}.`);
                }
            } else {
                console.error(`Group with code ${groupCode} does not exist.`);
            }
        } catch (error) {
            console.error('Error joining room:', error);
        }
    });

    socket.on('signal', (data) => {
        socket.to(data.room).emit('signal', data);
    });

    socket.on('getRooms', async (groupCode) => {
        try {
            const group = await Group.findById(groupCode).populate('rooms');
            if (group) {
                const rooms = group.rooms.map(room => ({ roomCode: room._id, roomName: room.name }));
                socket.emit('roomsList', rooms);
            } else {
                console.error(`Group with code ${groupCode} does not exist.`);
            }
        } catch (error) {
            console.error('Error getting rooms:', error);
        }
    });

    socket.on('getGroups', async () => {
        try {
            const groups = await Group.find({}, 'name');
            const groupList = groups.map(group => ({ groupCode: group._id, groupName: group.name }));
            socket.emit('groupsList', groupList);
        } catch (error) {
            console.error('Error getting groups:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

httpServer.listen(HTTP_PORT, () => console.log(`HTTP Server running on port ${HTTP_PORT}`));
httpsServer.listen(HTTPS_PORT, () => console.log(`HTTPS Server running on port ${HTTPS_PORT}`));