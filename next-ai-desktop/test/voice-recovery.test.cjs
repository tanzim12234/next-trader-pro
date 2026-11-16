'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const voiceRecovery=require('../src/voice-recovery.js');

test('permission and device errors stop automatic retries',()=>{
 for(const code of ['not-allowed','service-not-allowed','audio-capture','language-not-supported']){
  assert.equal(voiceRecovery.isTerminalError(code),true,code);
 }
});
test('network errors use bounded exponential reconnect delays',()=>{
 assert.deepEqual([1,2,3,4,5,6].map(n=>voiceRecovery.retryDelay(n,'network')),[1200,2400,4800,9600,15000,15000]);
});
test('no-speech errors retry sooner but still back off safely',()=>{
 assert.deepEqual([1,2,3,4,5,6].map(n=>voiceRecovery.retryDelay(n,'no-speech')),[600,1200,2400,4800,9600,15000]);
});
test('unexpected transient errors remain recoverable',()=>{
 assert.equal(voiceRecovery.isTerminalError('network'),false);
 assert.equal(voiceRecovery.isTerminalError('aborted'),false);
 assert.equal(voiceRecovery.retryDelay(1,'other'),900);
});
test('voice errors expose actionable status text without hiding the error category',()=>{
 assert.match(voiceRecovery.getErrorMessage('network'),/connection lost/i);
 assert.match(voiceRecovery.getErrorMessage('audio-capture'),/microphone/i);
 assert.match(voiceRecovery.getErrorMessage('custom-error'),/custom-error/);
});
