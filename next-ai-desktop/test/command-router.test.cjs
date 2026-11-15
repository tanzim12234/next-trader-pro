'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyVoiceCommand, normalizeVoiceText } = require('../src/command-router.cjs');

test('normalizes punctuation and whitespace without losing Bangla text', () => {
  assert.equal(normalizeVoiceText('  হেই   নেক্সট!  '), 'হেই নেক্সট');
});
test('understands English and Bangla app launch commands', () => {
  assert.equal(classifyVoiceCommand('Hey NEXT, please open calculator').app, 'calculator');
  assert.equal(classifyVoiceCommand('নোটপ্যাড খুলে দাও').app, 'notepad');
  assert.equal(classifyVoiceCommand('ফাইল ম্যানেজার চালু করো').app, 'file-explorer');
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
