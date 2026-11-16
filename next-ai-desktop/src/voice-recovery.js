(function exposeVoiceRecovery(root){
 'use strict';
 const terminalErrors=new Set(['not-allowed','service-not-allowed','audio-capture','language-not-supported']);
 const messages=Object.freeze({
  'not-allowed':'Microphone permission denied. Allow NEXT AI microphone access in Windows settings.',
  'service-not-allowed':'Speech recognition service is blocked in this environment.',
  'audio-capture':'No working microphone was found. Connect or enable a microphone, then restart listening.',
  'language-not-supported':'The selected speech language is not supported by this recognition service.',
  'network':'Speech recognition service connection lost. Checking the connection and retrying…',
  'no-speech':'No speech detected. Voice recognition will reconnect automatically.',
  'aborted':'Voice recognition was interrupted. Reconnecting…'
 });
 function normalize(error){return String(error||'').trim().toLowerCase();}
 function isTerminalError(error){return terminalErrors.has(normalize(error));}
 function retryDelay(attempt,error){
  const count=Number.isFinite(Number(attempt))?Math.max(1,Math.floor(Number(attempt))):1;
  const code=normalize(error);
  const base=code==='network'?1200:code==='no-speech'?600:900;
  return Math.min(15000,base*Math.pow(2,Math.min(5,count-1)));
 }
 function getErrorMessage(error){
  const code=normalize(error);
  return messages[code]||('Voice recognition interrupted ('+(code||'unknown')+'). Reconnecting…');
 }
 const api=Object.freeze({isTerminalError,retryDelay,getErrorMessage});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextVoiceRecovery=api;
})(typeof window!=='undefined'?window:globalThis);
