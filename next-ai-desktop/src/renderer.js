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

async function refresh(){const s=await window.nextAI.status();$('state').textContent='Secure storage: '+(s.secureStorage?'ON':'UNAVAILABLE')+' · Gemini: '+(s.gemini?'SET':'NOT SET')+' · Groq: '+(s.groq?'SET':'NOT SET');if($('aiProvider'))$('aiProvider').value=s.provider||'auto';if($('hudSystem'))$('hudSystem').textContent=s.secureStorage?'SECURE CORE ONLINE':'SECURE STORAGE OFF';if($('hudEngine'))$('hudEngine').textContent=s.provider==='groq'&&s.groq?'GROQ ENGINE READY':s.gemini?'GEMINI ENGINE READY':s.groq?'GROQ ENGINE READY':'API KEY REQUIRED';}
$('save').onclick=async()=>{try{await window.nextAI.saveKeys({geminiKey:$('gemini').value,groqKey:$('groq').value,provider:$('aiProvider').value});$('gemini').value='';$('groq').value='';$('saveState').textContent='Saved securely.';await refresh();}catch(e){$('saveState').textContent=e.message;}};
$('testConnection').onclick=async()=>{const b=$('testConnection');b.disabled=true;$('saveState').textContent='Testing API connection…';try{const r=await window.nextAI.testConnection();$('saveState').textContent=r.provider+' connection successful · '+r.model;}catch(e){$('saveState').textContent='Connection failed: '+e.message;}finally{b.disabled=false;}};

let pendingTaskPlan=null;
$('runResearch').onclick=async()=>{
 const query=$('researchQuery').value.trim();if(!query)return;
 const button=$('runResearch');button.disabled=true;$('researchState').textContent='Searching the web and checking sources…';$('researchAnswer').textContent='';$('researchSources').textContent='';
 try{
  const result=await window.nextAI.webResearch(query);
  $('researchAnswer').textContent=result.answer;
  if(!result.sources.length)$('researchSources').textContent='Search response did not include source links.';
  for(const source of result.sources){
   const row=document.createElement('div');row.className='memory-item';
   const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.title;link.style.color='#75eaff';
   row.append(link);$('researchSources').append(row);
  }
  $('researchState').textContent='Research complete · '+result.sources.length+' source link(s).';
 }catch(e){$('researchState').textContent='Research failed: '+e.message;}
 finally{button.disabled=false;}
};
async function refreshTaskHistory(){
 try{
  const items=await window.nextAI.listTaskHistory();
  const box=document.createElement('div');box.className='memory-list';
  if(!items.length){box.textContent='No task history yet.';}
  for(const item of items){
   const row=document.createElement('div');row.className='memory-item';
   const label=document.createElement('span');label.textContent=item.goal+' · '+item.status+' · '+item.completed+'/'+item.total+' steps';
   row.append(label);box.append(row);
  }
  const old=$('taskHistoryList');if(old)old.replaceWith(box);else $('taskState').after(box);
  box.id='taskHistoryList';
 }catch(e){$('taskState').textContent='History unavailable: '+e.message;}
}
async function saveTaskRun(goal,status,completed,total){
 try{await window.nextAI.saveTaskHistory({id:Date.now().toString(),goal,status,completed,total,createdAt:new Date().toISOString()});await refreshTaskHistory();}catch(e){$('taskState').textContent+=' · History save failed: '+e.message;}
}
$('planTask').onclick=async()=>{
 const goal=$('taskGoal').value.trim();if(!goal)return;
 const button=$('planTask');button.disabled=true;$('executeTask').disabled=true;pendingTaskPlan=null;$('taskPlanList').textContent='';$('taskState').textContent='Creating a safe task proposal…';
 try{
  const plan=await window.nextAI.planTask(goal);pendingTaskPlan=plan;
  for(const step of plan.steps){
   const row=document.createElement('div');row.className='memory-item';
   const label=document.createElement('span');label.textContent=step.id+'. '+step.title+' · '+step.action.type;
   row.append(label);$('taskPlanList').append(row);
  }
  $('taskState').textContent=plan.steps.length+' safe step(s) proposed. Review them before approval.';
  $('executeTask').disabled=!plan.steps.length;
 }catch(e){$('taskState').textContent='Planning failed: '+e.message;}
 finally{button.disabled=false;}
};
$('executeTask').onclick=async()=>{
 if(!pendingTaskPlan||!pendingTaskPlan.steps.length)return;
 const approved=window.confirm('এই '+pendingTaskPlan.steps.length+'টি task step চালানোর অনুমতি দিচ্ছ? প্রতিটি website খোলার আগে আলাদা confirmation আসবে।');
 if(!approved)return;
 const button=$('executeTask');button.disabled=true;$('planTask').disabled=true;
 let completed=0;
 try{
  for(const step of pendingTaskPlan.steps){
   $('taskState').textContent='Executing '+step.id+'/'+pendingTaskPlan.steps.length+': '+step.title;
   const result=await window.nextAI.executeTaskStep(step.action);
   if(result.cancelled){$('taskState').textContent='Cancelled at step '+step.id+'. '+completed+' step(s) completed.';await saveTaskRun($('taskGoal').value.trim(),'cancelled',completed,pendingTaskPlan.steps.length);return;}
   completed++;
  }
  $('taskState').textContent='Task finished. '+completed+' approved step(s) completed.';await saveTaskRun($('taskGoal').value.trim(),'completed',completed,pendingTaskPlan.steps.length);
 }catch(e){$('taskState').textContent='Stopped after '+completed+' step(s): '+e.message;await saveTaskRun($('taskGoal').value.trim(),'failed',completed,pendingTaskPlan.steps.length);}
 finally{button.disabled=false;$('planTask').disabled=false;}
};

$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';setCoreState('thinking','Analyzing: '+q);try{const answer=await window.nextAI.chat(q);$('chat').textContent=answer;lastExchange={question:q,answer};$('saveConversation').disabled=false;$('reviewLearning').disabled=false;$('conversationState').textContent='Conversation ready. Save only if you want NEXT to remember it.';setCoreState('speaking','Response ready');speak(answer);}catch(e){$('chat').textContent='Error: '+e.message;setCoreState('', 'Request failed');}finally{setTimeout(()=>setCoreState('', 'Awaiting input'),2200);}};
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
  const routed=await window.nextAI.classifyVoice(raw);
  if(routed){
   if(routed.intent==='open-app'){await window.nextAI.runAction({type:'open-app',app:routed.app});speak('Opening '+routed.app.replace('-', ' '));return;}
   if(routed.intent==='youtube-open'){await window.nextAI.runAction({type:'youtube-open'});speak('Opening YouTube');return;}
   if(routed.intent==='youtube-search'){await window.nextAI.runAction({type:'youtube-search',query:routed.query});speak('Searching YouTube');return;}
   if(routed.intent==='web-search'){$('researchQuery').value=routed.query;$('runResearch').click();speak('Starting web research');return;}
   if(routed.intent==='media-toggle'){await window.nextAI.runAction({type:'media',command:'playpause'});speak('Media control requested');return;}
   if(routed.intent==='ask-ai'){$('prompt').value=routed.prompt;$('send').click();return;}
   if(routed.intent==='type-text'){const result=await window.nextAI.runAction({type:'write-text',text:routed.text});speak(result.cancelled?'Cancelled':'Typing requested');return;}
  }
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

refreshTaskHistory();


async function refreshFolderItems(){
 try{
  const result=await window.nextAI.listFolder();
  $('folderState').textContent='Approved folder: '+result.folder;
  const box=$('folderItems');box.innerHTML='';
  if(!result.items.length){box.textContent='Folder is empty.';return;}
  for(const item of result.items){
   const row=document.createElement('div');row.className='memory-item';
   const label=document.createElement('span');
   const size=item.type==='file'?' · '+(item.size<1024?' '+item.size+' B':(item.size/1024).toFixed(1)+' KB'):'';
   label.textContent=(item.type==='folder'?'📁 ':'📄 ')+item.name+size;
   row.append(label);
   if(item.type==='file'){
    const open=document.createElement('button');open.textContent='Open';open.onclick=async()=>{try{await window.nextAI.openFileItem(item.name);$('folderState').textContent='Open request completed.';}catch(e){$('folderState').textContent=e.message;}};
    const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=async()=>{try{const out=await window.nextAI.copyFileItem(item.name);$('folderState').textContent=out.cancelled?'Copy cancelled.':'Copied: '+out.name;}catch(e){$('folderState').textContent=e.message;}};
    row.append(open,copy);
   }
   box.append(row);
  }
 }catch(e){$('folderState').textContent=e.message;}
}
$('chooseFolder').onclick=async()=>{try{const result=await window.nextAI.chooseFolder();if(result.cancelled)return;await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('refreshFolder').onclick=refreshFolderItems;
$('createFolder').onclick=async()=>{const name=window.prompt('নতুন folder-এর নাম লিখো:');if(!name)return;try{const result=await window.nextAI.createFolder(name);if(result.cancelled)return;$('folderState').textContent='Folder created: '+result.name;await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('browserOpen').onclick=async()=>{const button=$('browserOpen');button.disabled=true;$('browserState').textContent='Opening secure browser…';try{const result=await window.nextAI.openBrowser($('browserAddress').value);$('browserAddress').value=result.url;$('browserState').textContent='Secure Browser opened: '+result.url;}catch(e){$('browserState').textContent='Browser error: '+e.message;}finally{button.disabled=false;}};
for(const [id,direction] of [['browserBack','back'],['browserForward','forward'],['browserReload','reload']]){
 $(id).onclick=async()=>{try{await window.nextAI.browserNavigate(direction);$('browserState').textContent='Browser '+direction+' requested.';}catch(e){$('browserState').textContent=e.message;}};
}

