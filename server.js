const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// Устанавливаем директорию для статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Добавляем middleware для CORS
app.use(cors());

// Добавляем маршрут для корневого URL, чтобы обслуживать index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'testFour.html'));
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer({
    key: fs.readFileSync(path.join(__dirname, 'certs', 'private.key')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt'))
}, app);

const io = socketIo(httpsServer);

io.on('connection', (socket) => {
    const clientIp = socket.request.connection.remoteAddress;
    console.log(`New client connected from IP: ${clientIp}`);

    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Client joined room: ${room}`);

        socket.on('signal', (data) => {
            socket.to(room).emit('signal', data);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });
});

const HTTP_PORT = process.env.HTTP_PORT || 4000;
const HTTPS_PORT = process.env.HTTPS_PORT || 4001;

httpServer.listen(HTTP_PORT, () => console.log(`HTTP Server running on port ${HTTP_PORT}`));
httpsServer.listen(HTTPS_PORT, () => console.log(`HTTPS Server running on port ${HTTPS_PORT}`));



// var static = require('node-static');
// var http = require('http');
// var file = new(static.Server)();

// var app = http.createServer(function (req, res) {
//     file.serve(req, res);
// }).listen(4000, () => console.log(`Server running on port 4000`));

// var io = require('socket.io')(app);

// io.on('connection', function (socket) {
//     function log() {
//         var array = [">>> "];
//         for (var i = 0; i < arguments.length; i++) {
//             array.push(arguments[i]);
//         }
//         socket.emit('log', array);
//     }

//     socket.on('message', function (message) {
//         log('Got message: ', message);
//         io.to(socket.room).emit('message', message); // Отправляем сообщение только в комнату
//     });

//     socket.on('create or join', function (room) {
//         var numClients = Array.from(io.sockets.adapter.rooms.get(room) || []).length;

//         log('Room ' + room + ' has ' + numClients + ' client(s)');
//         log('Request to create or join room', room);

//         if (numClients == 0) {
//             socket.join(room);
//             socket.room = room; // Сохраняем комнату в сокете
//             socket.emit('created', room);
//         } else if (numClients == 1) {
//             io.to(room).emit('join', room);
//             socket.join(room);
//             socket.room = room; // Сохраняем комнату в сокете
//             socket.emit('joined', room);
//         } else { // max two clients
//             socket.emit('full', room);
//         }

//         socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
//         socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);
//     });
// });