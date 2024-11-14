const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: String,
    rooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }]
});

module.exports = mongoose.model('Group', groupSchema);