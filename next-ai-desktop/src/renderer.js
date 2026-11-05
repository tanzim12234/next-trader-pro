const $=id=>document.getElementById(id);
let recognition=null, listening=false, awaitingCommand=false;
async function refresh(){const s=await window.nextAI.status();$('state').textContent='Secure storage: '+(s.secureStorage?'ON':'UNAVAILABLE')+' · Gemini: '+(s.gemini?'SET':'NOT SET')+' · Groq: '+(s.groq?'SET':'NOT SET');}
$('save').onclick=async()=>{try{await window.nextAI.saveKeys({geminiKey:$('gemini').value,groqKey:$('groq').value});$('gemini').value='';$('groq').value='';$('saveState').textContent='Saved securely.';await refresh();}catch(e){$('saveState').textContent=e.message;}};
$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';try{$('chat').textContent=await window.nextAI.chat(q);}catch(e){$('chat').textContent='Error: '+e.message;}};
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
function speak(text){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='en-US';speechSynthesis.speak(u);}
async function runVoiceCommand(raw){
 let text=raw.trim().toLowerCase();
 if(text.startsWith('hey next')) text=text.slice(8).trim();
 if(!text){awaitingCommand=true;$('voiceState').textContent='Wake word heard — say a command';speak('Yes?');return;}
 awaitingCommand=false;
 try{
  if(/^(open|launch) youtube$/.test(text)){await window.nextAI.runAction({type:'youtube-open'});speak('Opening YouTube');return;}
  if(text.startsWith('search ')){const q=text.slice(7).trim();await window.nextAI.runAction({type:'youtube-search',query:q});speak('Searching YouTube');return;}
  if(/^(play|pause|play music|pause music|play this music|pause this music)$/.test(text)){await window.nextAI.runAction({type:'media',command:'playpause'});speak('Media toggle sent');return;}
  if(text.startsWith('write ')){const value=raw.trim().replace(/^hey next\s*/i,'').replace(/^write\s*/i,'');const r=await window.nextAI.runAction({type:'write-text',text:value});speak(r.cancelled?'Cancelled':'Paste requested');return;}
  if(text.startsWith('ask ')){const q=raw.trim().replace(/^hey next\s*/i,'').replace(/^ask\s*/i,'');$('prompt').value=q;$('send').click();return;}
  speak('I did not recognize that command.');$('voiceState').textContent='Unknown command: '+raw;
 }catch(e){$('voiceState').textContent=e.message;speak('The action failed');}
}
function startVoice(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('voiceState').textContent='Speech recognition is not available in this Electron build. Use the chat box.';return;}
 recognition=new SR();recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=false;
 recognition.onstart=()=>{$('voiceState').textContent='Listening for “Hey NEXT”…';};
 recognition.onresult=async ev=>{
  const result=ev.results[ev.results.length-1];if(!result.isFinal)return;
  const phrase=result[0].transcript.trim();$('voiceState').textContent='Heard: '+phrase;
  if(/\bhey next\b/i.test(phrase)){await runVoiceCommand(phrase);return;}
  if(awaitingCommand){await runVoiceCommand(phrase);return;}
 };
 recognition.onerror=ev=>{$('voiceState').textContent='Voice error: '+ev.error;};
 recognition.onend=()=>{if(listening){try{recognition.start();}catch{}}else $('voiceState').textContent='Voice stopped';};
 listening=true;recognition.start();$('voice').textContent='Stop voice listening';
}
function stopVoice(){listening=false;if(recognition)recognition.stop();$('voice').textContent='Start voice listening';}
$('voice').onclick=()=>listening?stopVoice():startVoice();
refresh();
