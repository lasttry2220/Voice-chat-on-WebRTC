const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  type: { type: String, enum: ['voice', 'text'], default: 'voice' }  // Добавлено поле type
});

module.exports = mongoose.model('Channel', channelSchema);