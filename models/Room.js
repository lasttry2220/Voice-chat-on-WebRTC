const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: String,
    participants: [String]
});

module.exports = mongoose.model('Room', roomSchema);