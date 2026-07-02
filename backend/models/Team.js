/* eslint-disable */
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  teamNumber: { type: Number, unique: true },
  observer: String,
  creator: String,
  player1: String,
  player2: String,
  round: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  status: { type: String, default: 'pending' }, // pending, approved, active, penalized, banned
  sessionId: { type: String, default: null },
  timeLeft: Number,
  totalTime: Number,
  observerText: String,
  creatorText: String,
  tabSwitchCount: { type: Number, default: 0 },
  fullscreenExits: { type: Number, default: 0 },
  warnings: { type: Number, default: 0 },
  r1Link: String,
  r2Link: String,
  r3Link: String,
  r1Img: String,
  r2Img: String,
  r3Img: String,
  finalImage: String,
  referenceImageUrl: String,
  finalImageUrl: String,
  phase: { type: String, default: 'register' },
  disqualifiedReason: String
});

module.exports = mongoose.model('Team', teamSchema);


