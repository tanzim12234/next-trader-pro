'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyVoiceCommand, normalizeVoiceText } = require('../src/command-router.cjs');

test('normalizes punctuation and whitespace without losing Bangla text', () => {
  assert.equal(normalizeVoiceText('  হেই   নেক্সট!  '), 'হেই নেক্সট');
});
test('understands English and Bangla app launch commands', () => {
  assert.equal(classifyVoiceCommand('Hey NEXT, open calculator please').app, 'calculator');
  assert.equal(classifyVoiceCommand('নোটপ্যাড খুলে দাও').app, 'notepad');
  assert.equal(classifyVoiceCommand('ফাইল ম্যানেজার চালু করো').app, 'file-explorer');
});
test('understands new English and Bangla desktop utility commands', () => {
  assert.equal(classifyVoiceCommand('Hey NEXT, open Task Manager').app, 'task-manager');
  assert.equal(classifyVoiceCommand('স্নিপিং টুল খুলে দাও').app, 'snipping-tool');
  assert.equal(classifyVoiceCommand('পেইন্ট চালু করো').app, 'paint');
});
test('understands YouTube, web search, media and assistant questions', () => {
  assert.equal(classifyVoiceCommand('ইউটিউবে বাংলা গান খোঁজো').query, 'বাংলা গান');
  assert.equal(classifyVoiceCommand('Google latest AI news').intent, 'web-search');
  assert.equal(classifyVoiceCommand('গান চালাও').intent, 'media-toggle');
  assert.equal(classifyVoiceCommand('আমাকে বলো black hole কী').intent, 'ask-ai');
});
test('limits user-provided command payloads and rejects unknown commands', () => {
  assert.equal(classifyVoiceCommand('search youtube ' + 'x'.repeat(300)).query.length, 200);
  assert.equal(classifyVoiceCommand('x'.repeat(2001)), null);
  assert.equal(classifyVoiceCommand('delete all files'), null);
});

test('recognizes English and Bangla smart-home voice intents',()=>{
  const on=classifyVoiceCommand('turn on living room light');
  assert.equal(on.intent,'home-control');assert.equal(on.service,'turn_on');assert.equal(on.deviceQuery,'living room light');
  const off=classifyVoiceCommand('লিভিং রুমের লাইট বন্ধ করো');
  assert.equal(off.service,'turn_off');
  const temp=classifyVoiceCommand('set bedroom thermostat to 22 degrees');
  assert.equal(temp.service,'set_temperature');assert.equal(temp.temperature,22);
  assert.equal(classifyVoiceCommand('lock front door').service,'lock');
});
