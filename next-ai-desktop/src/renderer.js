const $=id=>document.getElementById(id);
let recognition=null, listening=false, awaitingCommand=false;
const stage=$('jarvisStage');
function setCoreState(state, activity){
 if(!stage)return;
 stage.classList.remove('listening','thinking','speaking');
 if(state)stage.classList.add(state);
 const labels={listening:'VOICE LISTENING',thinking:'PROCESSING REQUEST',speaking:'VOICE RESPONSE'};
 const voice=$('hudVoice'),act=$('hudActivity');
 if(voice)voice.textContent=labels[state]||'VOICE STANDBY';
 if(act&&activity)act.textContent=activity.toUpperCase().slice(0,30);
}

async function refresh(){const s=await window.nextAI.status();$('state').textContent='Secure storage: '+(s.secureStorage?'ON':'UNAVAILABLE')+' · Gemini: '+(s.gemini?'SET':'NOT SET')+' · Groq: '+(s.groq?'SET':'NOT SET');if($('hudSystem'))$('hudSystem').textContent=s.secureStorage?'SECURE CORE ONLINE':'SECURE STORAGE OFF';if($('hudEngine'))$('hudEngine').textContent=s.gemini?'GEMINI ENGINE READY':s.groq?'GROQ ENGINE READY':'API KEY REQUIRED';}
$('save').onclick=async()=>{try{await window.nextAI.saveKeys({geminiKey:$('gemini').value,groqKey:$('groq').value});$('gemini').value='';$('groq').value='';$('saveState').textContent='Saved securely.';await refresh();}catch(e){$('saveState').textContent=e.message;}};
$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';setCoreState('thinking','Analyzing: '+q);try{$('chat').textContent=await window.nextAI.chat(q);setCoreState('speaking','Response ready');speak($('chat').textContent);}catch(e){$('chat').textContent='Error: '+e.message;setCoreState('', 'Request failed');}finally{setTimeout(()=>setCoreState('', 'Awaiting input'),2200);}};
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
function speak(text){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.onstart=()=>setCoreState('speaking','Voice output active');u.onend=()=>setCoreState('', 'Awaiting input');speechSynthesis.speak(u);}
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
 recognition.onstart=()=>{$('voiceState').textContent='Listening for “Hey NEXT”…';setCoreState('listening','Wake word detection active');};
 recognition.onresult=async ev=>{
  const result=ev.results[ev.results.length-1];if(!result.isFinal)return;
  const phrase=result[0].transcript.trim();$('voiceState').textContent='Heard: '+phrase;
  if(/\bhey next\b/i.test(phrase)){await runVoiceCommand(phrase);return;}
  if(awaitingCommand){await runVoiceCommand(phrase);return;}
 };
 recognition.onerror=ev=>{$('voiceState').textContent='Voice error: '+ev.error;};
 recognition.onend=()=>{if(listening){try{recognition.start();}catch{}}else {$('voiceState').textContent='Voice stopped';setCoreState('', 'Voice standby');}};
 listening=true;recognition.start();$('voice').textContent='Stop voice listening';
}
function stopVoice(){listening=false;if(recognition)recognition.stop();$('voice').textContent='Start voice listening';}
$('voice').onclick=()=>listening?stopVoice():startVoice();
refresh();

async function refreshMemories(query=''){
 try{
  const [items,allItems]=await Promise.all([window.nextAI.listMemories(query),window.nextAI.listMemories()]);
  $('memoryList').innerHTML='';
  if($('hudMemory'))$('hudMemory').textContent=allItems.length+' MEMORY RECORDS';if(!items.length){$('memoryList').textContent='No saved memories yet.';return;}
  for(const item of items){
   const row=document.createElement('div');row.className='memory-item';
   const text=document.createElement('span');text.textContent=item.text;
   const del=document.createElement('button');del.textContent='Forget';del.onclick=async()=>{await window.nextAI.forgetMemory(item.id);await refreshMemories();};
   row.append(text,del);$('memoryList').append(row);
  }
  $('memoryState').textContent=(query?items.length+' matching':' '+allItems.length+' saved')+' memory item(s). Stored encrypted on this PC.';
 }catch(e){$('memoryState').textContent=e.message;}
}
$('remember').onclick=async()=>{
 const text=$('memoryText').value.trim();if(!text)return;
 try{await window.nextAI.remember({text,category:'personal'});$('memoryText').value='';$('memoryState').textContent='Saved to your encrypted Personal Brain.';await refreshMemories();}
 catch(e){$('memoryState').textContent=e.message;}
};
$('refreshMemory').onclick=refreshMemories;
$('clearMemory').onclick=async()=>{
 try{const r=await window.nextAI.clearMemories();if(r.cancelled)return;await refreshMemories();$('memoryState').textContent='All saved memories cleared.';}
 catch(e){$('memoryState').textContent=e.message;}
};
refreshMemories();
