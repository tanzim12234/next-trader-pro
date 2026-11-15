const $=id=>document.getElementById(id);
let recognition=null, listening=false, awaitingCommand=false, lastExchange=null;
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
$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';setCoreState('thinking','Analyzing: '+q);try{const answer=await window.nextAI.chat(q);$('chat').textContent=answer;lastExchange={question:q,answer};$('saveConversation').disabled=false;$('conversationState').textContent='Conversation ready. Save only if you want NEXT to remember it.';setCoreState('speaking','Response ready');speak(answer);}catch(e){$('chat').textContent='Error: '+e.message;setCoreState('', 'Request failed');}finally{setTimeout(()=>setCoreState('', 'Awaiting input'),2200);}};
$('openTextFile').onclick=async()=>{try{const file=await window.nextAI.openTextFile();if(file.cancelled)return;$('fileName').value=file.name;$('fileContent').value=file.content;$('fileState').textContent='Opened: '+file.name;}catch(e){$('fileState').textContent='Open failed: '+e.message;}};
$('saveTextFile').onclick=async()=>{try{const result=await window.nextAI.saveTextFile({name:$('fileName').value,content:$('fileContent').value});if(!result.cancelled)$('fileState').textContent='Saved: '+result.name;}catch(e){$('fileState').textContent='Save failed: '+e.message;}};
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
$('openNotepad').onclick=()=>window.nextAI.runAction({type:'open-app',app:'notepad'});
$('openCalculator').onclick=()=>window.nextAI.runAction({type:'open-app',app:'calculator'});
$('openExplorer').onclick=()=>window.nextAI.runAction({type:'open-app',app:'file-explorer'});
function speak(text){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang=$('voiceLanguage')?.value||'bn-BD';u.onstart=()=>setCoreState('speaking','Voice output active');u.onend=()=>setCoreState('', 'Awaiting input');speechSynthesis.speak(u);}
async function runVoiceCommand(raw){
 let text=raw.trim().toLowerCase();
 text=text.replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').trim();
 if(!text){awaitingCommand=true;$('voiceState').textContent='Wake word heard — say a command';speak('Yes?');return;}
 awaitingCommand=false;
 try{
  const appCommands=[
   {pattern:/^(open|launch)\s+notepad$|^নোটপ্যাড\s*(খোলো|চালু করো)$/i,app:'notepad',label:'Notepad'},
   {pattern:/^(open|launch)\s+calculator$|^(ক্যালকুলেটর|ক্যালকুলেটরটা)\s*(খোলো|চালু করো)$/i,app:'calculator',label:'Calculator'},
   {pattern:/^(open|launch)\s+(file explorer|explorer)$|^(ফাইল এক্সপ্লোরার|ফাইল ম্যানেজার)\s*(খোলো|চালু করো)$/i,app:'file-explorer',label:'File Explorer'}
  ];
  const appMatch=appCommands.find(item=>item.pattern.test(text));
  if(appMatch){await window.nextAI.runAction({type:'open-app',app:appMatch.app});speak('Opening '+appMatch.label);return;}
  if(/^(open|launch)\s+youtube$/.test(text)||/^(ইউটিউব\s*(খোলো|চালু করো|ওপেন করো))$/.test(text)){
   await window.nextAI.runAction({type:'youtube-open'});speak('Opening YouTube');return;
  }
  let query='';
  if(text.startsWith('search ')) query=text.slice(7).trim();
  else if(text.startsWith('সার্চ ')) query=text.slice(6).trim();
  else {
   const match=text.match(/^(ইউটিউবে|ইউটিউব)\s+(.+?)\s*(খোঁজো|সার্চ করো|সার্চ দাও)$/);
   if(match)query=match[2].trim();
  }
  if(query){await window.nextAI.runAction({type:'youtube-search',query});speak('Searching YouTube');return;}
  if(/^(play|pause|play music|pause music|play this music|pause this music|গান চালাও|গান বন্ধ করো|মিউজিক চালাও|মিউজিক বন্ধ করো|প্লে|পজ)$/.test(text)){
   await window.nextAI.runAction({type:'media',command:'playpause'});speak('Media toggle sent');return;
  }
  if(text.startsWith('write ')||text.startsWith('লিখো ')||text.startsWith('লিখে দাও ')){
   const value=raw.trim().replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').replace(/^(write|লিখো|লিখে দাও)\s*/i,'');
   const r=await window.nextAI.runAction({type:'write-text',text:value});speak(r.cancelled?'Cancelled':'Paste requested');return;
  }
  if(text.startsWith('ask ')||text.startsWith('জিজ্ঞেস করো ')||text.startsWith('প্রশ্ন করো ')){
   const q=raw.trim().replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').replace(/^(ask|জিজ্ঞেস করো|প্রশ্ন করো)\s*/i,'');
   $('prompt').value=q;$('send').click();return;
  }
  speak('I did not recognize that command.');$('voiceState').textContent='Unknown command: '+raw;
 }catch(e){$('voiceState').textContent=e.message;speak('The action failed');}
}
function startVoice(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('voiceState').textContent='Speech recognition is not available in this Electron build. Use the chat box.';return;}
 recognition=new SR();recognition.lang=$('voiceLanguage')?.value||'bn-BD';recognition.continuous=true;recognition.interimResults=false;
 recognition.onstart=()=>{$('voiceState').textContent='Listening for “Hey NEXT”…';setCoreState('listening','Wake word detection active');};
 recognition.onresult=async ev=>{
  const result=ev.results[ev.results.length-1];if(!result.isFinal)return;
  const phrase=result[0].transcript.trim();$('voiceState').textContent='Heard: '+phrase;
  if(/(?:\bhey\s+next\b|হেই\s+নেক্সট|হে\s+নেক্সট)/i.test(phrase)){await runVoiceCommand(phrase);return;}
  if(awaitingCommand){await runVoiceCommand(phrase);return;}
 };
 recognition.onerror=ev=>{$('voiceState').textContent='Voice error: '+ev.error;};
 recognition.onend=()=>{if(listening){try{recognition.start();}catch{}}else {$('voiceState').textContent='Voice stopped';setCoreState('', 'Voice standby');}};
 listening=true;recognition.start();$('voice').textContent='Stop voice listening';
}
function stopVoice(){listening=false;if(recognition)recognition.stop();$('voice').textContent='Start voice listening';}
$('voice').onclick=()=>listening?stopVoice():startVoice();
refresh();

async function refreshSystemStats(){
 try{
  const s=await window.nextAI.getSystemStats();
  $('systemCpu').textContent=s.cpuPercent===null?'Sampling…':s.cpuPercent+'%';
  const used=(s.totalMemoryBytes-s.freeMemoryBytes)/1073741824;
  const total=s.totalMemoryBytes/1073741824;
  $('systemMemory').textContent=s.memoryPercent+'% · '+used.toFixed(1)+' / '+total.toFixed(1)+' GB';
  const hours=Math.floor(s.uptimeSeconds/3600),minutes=Math.floor((s.uptimeSeconds%3600)/60);
  $('systemUptime').textContent=hours+'h '+minutes+'m';
  $('systemState').textContent=s.platform+' · '+s.arch+' · '+s.cpuCores+' CPU cores · Updated '+new Date().toLocaleTimeString();
 }catch(e){$('systemState').textContent='Monitoring unavailable: '+e.message;}
}
refreshSystemStats();
setInterval(refreshSystemStats,5000);

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
$('memorySearch').addEventListener('input',()=>refreshMemories($('memorySearch').value));
refreshMemories();

$('reviewLearning').onclick=async()=>{
 if(!lastExchange)return;
 const button=$('reviewLearning');button.disabled=true;$('learningState').textContent='Reviewing conversation…';
 const list=$('learningSuggestions');list.textContent='';
 try{
  const suggestions=await window.nextAI.suggestLearning(lastExchange);
  if(!suggestions.length){$('learningState').textContent='এই কথোপকথন থেকে সংরক্ষণের মতো স্থায়ী তথ্য পাওয়া যায়নি।';return;}
  $('learningState').textContent=suggestions.length+'টি প্রস্তাব পাওয়া গেছে। যেগুলো রাখতে চাও শুধু সেগুলো Save করো।';
  for(const item of suggestions){
   const row=document.createElement('div');row.className='memory-item';
   const text=document.createElement('span');text.textContent=item.text;
   const save=document.createElement('button');save.textContent='Approve & Save';
   save.onclick=async()=>{save.disabled=true;try{await window.nextAI.remember({text:item.text,category:item.category});row.remove();$('learningState').textContent='Approved item saved securely.';await refreshMemories();}catch(e){save.disabled=false;$('learningState').textContent=e.message;}};
   row.append(text,save);list.append(row);
  }
 }catch(e){$('learningState').textContent='Review failed: '+e.message;}
 finally{button.disabled=false;}
};
$('saveConversation').onclick=async()=>{
 if(!lastExchange)return;
 const combined='User: '+lastExchange.question+' | NEXT: '+lastExchange.answer;
 const text=combined.length>1000?combined.slice(0,997)+'...':combined;
 try{
  await window.nextAI.remember({text,category:'conversation'});
  $('conversationState').textContent='Saved securely to Personal Brain.';
  await refreshMemories();
 }catch(e){$('conversationState').textContent='Save failed: '+e.message;}
};

const voiceLanguage=$('voiceLanguage');if(voiceLanguage){voiceLanguage.value=localStorage.getItem('next-ai-voice-language')||'bn-BD';voiceLanguage.addEventListener('change',()=>{localStorage.setItem('next-ai-voice-language',voiceLanguage.value);if(listening){stopVoice();startVoice();}});}
