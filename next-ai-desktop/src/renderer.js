const $=id=>document.getElementById(id);
let recognition=null, listening=false, awaitingCommand=false, voiceProcessing=false, lastExchange=null;
const metricsHistory=[];
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
async function executeVoiceTaskPlan(plan,goal){
 let completed=0;
 $('executeTask').disabled=true;$('planTask').disabled=true;
 try{
  for(const step of plan.steps){
   $('taskState').textContent='Voice command · executing '+step.id+'/'+plan.steps.length+': '+step.title;
   const result=await window.nextAI.executeTaskStep(step.action);
   if(result.cancelled)throw new Error('Action was cancelled.');
   completed++;
  }
  $('taskState').textContent='Voice task completed · '+completed+' safe action(s) executed without repeat prompts.';
  await saveTaskRun(goal,'completed',completed,plan.steps.length);
  speak('Done. I completed '+completed+' actions.');
 }catch(e){
  $('taskState').textContent='Voice task stopped after '+completed+' action(s): '+e.message;
  await saveTaskRun(goal,'failed',completed,plan.steps.length);
  speak('I stopped because an action failed.');
 }finally{
  $('executeTask').disabled=true;
  $('planTask').disabled=false;
 }
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

async function autoLearnExchange(exchange){
 try{
  const result=await window.nextAI.suggestLearning(exchange);
  if(result && result.saved){
   $('learningState').textContent='NEXT নিজে '+result.saved+'টি স্থায়ী তথ্য Personal Brain-এ শিখেছে।';
   await refreshMemories();
  }else if(result){
   $('learningState').textContent='এই কথোপকথনে নতুন স্থায়ী তথ্য পাওয়া যায়নি।';
  }
 }catch(error){$('learningState').textContent='স্বয়ংক্রিয় শেখা সাময়িকভাবে হয়নি: '+error.message;}
}
$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';setCoreState('thinking','Analyzing: '+q);try{const answer=await window.nextAI.chat(q);$('chat').textContent=answer;lastExchange={question:q,answer};$('saveConversation').disabled=false;$('reviewLearning').disabled=false;$('conversationState').textContent='NEXT কথোপকথন থেকে স্থায়ী জ্ঞান শেখার চেষ্টা করছে…';setCoreState('speaking','Response ready');speak(answer);void autoLearnExchange(lastExchange);}catch(e){$('chat').textContent='Error: '+e.message;setCoreState('', 'Request failed');}finally{setTimeout(()=>setCoreState('', 'Awaiting input'),2200);}};
$('openTextFile').onclick=async()=>{try{const file=await window.nextAI.openTextFile();if(file.cancelled)return;$('fileName').value=file.name;$('fileContent').value=file.content;$('fileState').textContent='Opened: '+file.name;}catch(e){$('fileState').textContent='Open failed: '+e.message;}};
$('saveTextFile').onclick=async()=>{try{const result=await window.nextAI.saveTextFile({name:$('fileName').value,content:$('fileContent').value});if(!result.cancelled)$('fileState').textContent='Saved: '+result.name;}catch(e){$('fileState').textContent='Save failed: '+e.message;}};
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
$('openNotepad').onclick=()=>window.nextAI.runAction({type:'open-app',app:'notepad'});
$('openCalculator').onclick=()=>window.nextAI.runAction({type:'open-app',app:'calculator'});
$('openExplorer').onclick=()=>window.nextAI.runAction({type:'open-app',app:'file-explorer'});
$('openTaskManager').onclick=()=>window.nextAI.runAction({type:'open-app',app:'task-manager'});
$('openSnippingTool').onclick=()=>window.nextAI.runAction({type:'open-app',app:'snipping-tool'});
$('openPaint').onclick=()=>window.nextAI.runAction({type:'open-app',app:'paint'});
function speak(text,after){if(!('speechSynthesis'in window)){if(typeof after==='function')after();return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||''));u.lang=$('voiceLanguage')?.value||'bn-BD';u.onstart=()=>setCoreState('speaking','Voice output active');u.onend=()=>{setCoreState('', 'Awaiting input');if(typeof after==='function')after();};u.onerror=()=>{setCoreState('', 'Voice output unavailable');if(typeof after==='function')after();};speechSynthesis.speak(u);}
let pendingVoiceConfirmation=null;
function requestVoiceConfirmation(question,action){
 pendingVoiceConfirmation=action;awaitingCommand=false;
 $('voiceState').textContent='Confirmation required · say “Yes sure” or “No”';
 speak(question+' Sir, are you sure? Say “Yes sure” to continue or “No” to cancel.',()=>{if(!listening)startVoice();});
}
async function handleVoiceConfirmation(phrase){
 if(!pendingVoiceConfirmation)return false;
 const decision=await window.nextAI.classifyVoiceConfirmation(phrase);
 if(!decision){speak('Please say yes sure to continue, or no to cancel.');return true;}
 const action=pendingVoiceConfirmation;pendingVoiceConfirmation=null;
 if(decision==='no'){$('voiceState').textContent='Voice action cancelled.';speak('Understood. Action cancelled.');return true;}
 $('voiceState').textContent='Voice confirmation accepted. Executing…';voiceProcessing=true;
 try{await action();$('voiceState').textContent='Confirmed action completed.';speak('Confirmed. The action has been completed.');}
 catch(e){$('voiceState').textContent='Confirmed action failed: '+e.message;speak('The confirmed action failed.');}
 finally{voiceProcessing=false;}
 return true;
}
async function runVoiceCommand(raw){
 let text=raw.trim().toLowerCase();
 text=text.replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').trim();
 if(!text){awaitingCommand=true;$('voiceState').textContent='Wake word heard — say a command';speak('Yes?');return;}
 awaitingCommand=false;
 if(voiceProcessing)return;
 voiceProcessing=true;
 try{
  const routed=await window.nextAI.classifyVoice(raw);
  if(routed){
   if(routed.intent==='home-control'){
    const entities=await window.nextAI.listHomeEntities();
    const wanted=routed.deviceQuery.toLocaleLowerCase('en-US').trim();
    const matches=entities.filter(item=>item.name.toLocaleLowerCase('en-US')===wanted||item.entityId.toLocaleLowerCase('en-US')===wanted||item.name.toLocaleLowerCase('en-US').includes(wanted));
    if(matches.length!==1){speak(matches.length?'I found more than one matching device. Please use its exact name.':'I could not find that device in Home Assistant.');$('voiceState').textContent='Smart-home device match count: '+matches.length;return;}
    const device=matches[0];
    const callDevice=async()=>{
     const result=await window.nextAI.callHomeService({domain:device.domain,entityId:device.entityId,service:routed.service,temperature:routed.temperature});
     if(result.cancelled)throw new Error('Device action was cancelled.');
     speak('Done. Device command completed.');$('voiceState').textContent='Smart-home action: '+device.name+' · '+routed.service;
    };
    if(routed.service==='lock'||routed.service==='unlock'){
     requestVoiceConfirmation('I am about to '+routed.service+' '+device.name+'.',callDevice);return;
    }
    await callDevice();return;
   }
   if(routed.intent==='open-app'){await window.nextAI.runAction({type:'open-app',app:routed.app});speak('Opening '+routed.app.replace('-', ' '));return;}
   if(routed.intent==='youtube-open'){await window.nextAI.runAction({type:'youtube-open'});speak('Opening YouTube');return;}
   if(routed.intent==='youtube-search'){await window.nextAI.runAction({type:'youtube-search',query:routed.query});speak('Searching YouTube');return;}
   if(routed.intent==='web-search'){$('researchQuery').value=routed.query;$('runResearch').click();speak('Starting web research');return;}
   if(routed.intent==='media-toggle'){await window.nextAI.runAction({type:'media',command:'playpause'});speak('Media control requested');return;}
   if(routed.intent==='ask-ai'){$('prompt').value=routed.prompt;$('send').click();return;}
   if(routed.intent==='type-text'){const result=await window.nextAI.runAction({type:'write-text',text:routed.text});speak('Done. Text pasted.');return;}
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
   const r=await window.nextAI.runAction({type:'write-text',text:value});speak('Done. Text pasted.');return;
  }
  if(text.startsWith('ask ')||text.startsWith('জিজ্ঞেস করো ')||text.startsWith('প্রশ্ন করো ')){
   const q=raw.trim().replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').replace(/^(ask|জিজ্ঞেস করো|প্রশ্ন করো)\s*/i,'');
   $('prompt').value=q;$('send').click();return;
  }
  $('voiceState').textContent='Understanding your request…';
  try{
   const proposal=await window.nextAI.planTask(raw);
   if(proposal.steps&&proposal.steps.length){
    pendingTaskPlan=proposal;$('taskPlanList').textContent='';
    for(const step of proposal.steps){const row=document.createElement('div');row.className='memory-item';const label=document.createElement('span');label.textContent=step.id+'. '+step.title+' · '+step.action.type;row.append(label);$('taskPlanList').append(row);}
    $('taskGoal').value=raw;
    $('taskState').textContent=proposal.steps.length+' allowlisted action(s) received directly from your voice command.';
    await executeVoiceTaskPlan(proposal,raw);
    return;
   }
  }catch{}
  const answer=await window.nextAI.chat(raw);
  $('chat').textContent=answer;lastExchange={question:raw,answer};
  $('saveConversation').disabled=false;$('reviewLearning').disabled=false;
  void autoLearnExchange(lastExchange);
  speak(answer);$('voiceState').textContent='Answered your voice request.';return;
 }catch(e){$('voiceState').textContent=e.message;speak('The action failed');}
 finally{voiceProcessing=false;}
}
function startVoice(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('voiceState').textContent='Speech recognition is not available in this Electron build. Use the chat box.';return;}
 recognition=new SR();recognition.lang=$('voiceLanguage')?.value||'bn-BD';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
 recognition.onstart=()=>{$('voiceState').textContent='Listening for “Hey NEXT”…';setCoreState('listening','Wake word detection active');};
 recognition.onresult=async ev=>{
  if(voiceProcessing)return;
  for(let i=ev.resultIndex;i<ev.results.length;i++){
   const result=ev.results[i],phrase=result[0].transcript.trim();
   if(!result.isFinal){if(phrase)$('voiceState').textContent='Hearing: '+phrase;continue;}
   if(!phrase)continue;
   $('voiceState').textContent='Heard: '+phrase;
    if(pendingVoiceConfirmation){await handleVoiceConfirmation(phrase);break;}
   if(/(?:\bhey\s+next\b|হেই\s+নেক্সট|হে\s+নেক্সট)/i.test(phrase)){await runVoiceCommand(phrase);break;}
   if(awaitingCommand){await runVoiceCommand(phrase);break;}
  }
 };
 recognition.onerror=ev=>{
  const messages={ 'not-allowed':'Microphone permission denied. Allow microphone access in Windows settings.', 'service-not-allowed':'Speech recognition service is blocked in this environment.', 'audio-capture':'No working microphone was found.', 'network':'Speech recognition needs an internet connection.' };
  $('voiceState').textContent=messages[ev.error]||('Voice error: '+ev.error);
  if(['not-allowed','service-not-allowed','audio-capture'].includes(ev.error)){listening=false;$('voice').textContent='Start voice listening';setCoreState('', 'Voice unavailable');}
 };
 recognition.onend=()=>{if(listening){$('voiceState').textContent='Reconnecting voice recognition…';setTimeout(()=>{if(!listening||!recognition)return;try{recognition.start();}catch(e){$('voiceState').textContent='Voice restart failed: '+e.message;}},450);}else {$('voiceState').textContent='Voice stopped';setCoreState('', 'Voice standby');}};
 listening=true;
 try{recognition.start();$('voice').textContent='Stop voice listening';}
 catch(e){listening=false;$('voice').textContent='Start voice listening';$('voiceState').textContent='Could not start microphone: '+e.message;}
}
function stopVoice(){listening=false;awaitingCommand=false;pendingVoiceConfirmation=null;if(recognition)recognition.stop();if('speechSynthesis'in window)speechSynthesis.cancel();$('voice').textContent='Start voice listening';}
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
  metricsHistory.push({time:Date.now(),cpu:s.cpuPercent,memory:s.memoryPercent});if(metricsHistory.length>60)metricsHistory.shift();
  const valid=metricsHistory.filter(x=>x.cpu!==null);
  const trend=(key)=>{if(valid.length<6)return null;const first=valid[0],last=valid[valid.length-1],seconds=(last.time-first.time)/1000;if(seconds<20)return null;return (last[key]-first[key])/seconds;};
  const memSlope=trend('memory'),cpuSlope=trend('cpu');
  const memForecast=memSlope===null?null:Math.max(0,Math.min(100,s.memoryPercent+memSlope*300));
  const cpuForecast=cpuSlope===null||s.cpuPercent===null?null:Math.max(0,Math.min(100,s.cpuPercent+cpuSlope*300));
  const warnings=[];if(s.memoryPercent>=90)warnings.push('High memory use now');if(s.cpuPercent>=95)warnings.push('High CPU use now');if(memForecast>=95)warnings.push('Memory may reach critical level within ~5 min');
  $('systemPrediction').textContent=(memForecast===null?'Collecting trend samples…':'5-min estimate · RAM '+memForecast.toFixed(1)+'%'+(cpuForecast===null?'':' · CPU '+cpuForecast.toFixed(1)+'%'))+(warnings.length?' · ALERT: '+warnings.join('; '):' · No critical threshold detected');
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
$('importLearningFile').onclick=async()=>{
 const button=$('importLearningFile');button.disabled=true;$('documentImportState').textContent='Extracting text / running Bengali + English OCR locally…';
 try{
  const result=await window.nextAI.extractLearningFile();if(result.cancelled)return;
  $('knowledgeText').value=result.text;
  const learned=await window.nextAI.teachKnowledge({text:result.text,category:$('knowledgeCategory').value});
  $('knowledgeState').textContent='Automatically learned '+learned.saved+' searchable chunk(s) from '+result.name+'.';
  $('documentImportState').textContent=result.name+' · '+result.characters.toLocaleString()+' characters · '+(result.note||'text extraction')+(result.truncated?' · first 50,000 characters saved':'')+'. Automatically saved to encrypted Personal Brain.';
  await refreshMemories();
  $('knowledgeText').focus();
 }catch(e){$('documentImportState').textContent='Import failed: '+e.message;}
 finally{button.disabled=false;}
};
$('teachKnowledge').onclick=async()=>{
 const text=$('knowledgeText').value.trim();if(!text)return;
 const button=$('teachKnowledge');button.disabled=true;$('knowledgeState').textContent='Processing lesson into searchable memory…';
 try{
  const result=await window.nextAI.teachKnowledge({text,category:$('knowledgeCategory').value});
  $('knowledgeText').value='';
  $('knowledgeState').textContent='Lesson saved: '+result.saved+' searchable memory chunk(s).';
  await refreshMemories();
 }catch(e){$('knowledgeState').textContent='Could not save lesson: '+e.message;}
 finally{button.disabled=false;}
};
$('refreshMemory').onclick=refreshMemories;
$('clearMemory').onclick=async()=>{
 try{const r=await window.nextAI.clearMemories();if(r.cancelled)return;await refreshMemories();$('memoryState').textContent='All saved memories cleared.';}
 catch(e){$('memoryState').textContent=e.message;}
};
let memorySearchTimer = null;
$('memorySearch').addEventListener('input',()=>{
 clearTimeout(memorySearchTimer);
 const query=$('memorySearch').value;
 $('memoryState').textContent=query?'Searching saved memories locally…':'';
 memorySearchTimer=setTimeout(()=>refreshMemories(query),350);
});
$('refreshBrainGraph').onclick=refreshBrainGraph;
async function refreshBrainGraph(){
 try{
  const graph=await window.nextAI.getBrainGraph();
  const box=$('brainGraphList');box.innerHTML='';
  $('brainGraphState').textContent=graph.nodes.length+' nodes · '+graph.edges.length+' topic connections · generated locally.';
  if(!graph.edges.length){box.textContent='আরও সম্পর্কিত জ্ঞান শেখালে এখানে সংযোগ দেখা যাবে।';return;}
  const labels=new Map(graph.nodes.map(node=>[node.id,node.label]));
  for(const edge of graph.edges.slice(0,30)){
   const row=document.createElement('div');row.className='memory-item';
   const label=document.createElement('span');
   label.textContent=(labels.get(edge.source)||'Memory').slice(0,72)+'  ↔  '+(labels.get(edge.target)||'Memory').slice(0,72)+' · '+edge.topics.join(', ');
   row.append(label);box.append(row);
  }
 }catch(e){$('brainGraphState').textContent='Knowledge graph unavailable: '+e.message;}
}
refreshMemories();
refreshBrainGraph();

$('reviewLearning').onclick=async()=>{
 if(!lastExchange)return;
 const button=$('reviewLearning');button.disabled=true;
 try{await autoLearnExchange(lastExchange);}
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
   if(item.type==='folder'){
    const enter=document.createElement('button');enter.textContent='Open folder';enter.onclick=async()=>{try{await window.nextAI.enterFolder(item.name);await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};row.append(enter);
   }else{
    const open=document.createElement('button');open.textContent='Open';open.onclick=async()=>{try{await window.nextAI.openFileItem(item.name);$('folderState').textContent='Open request completed.';}catch(e){$('folderState').textContent=e.message;}};
    const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=()=>requestVoiceConfirmation('Copy the file '+item.name+' to the destination you choose.',async()=>{try{const out=await window.nextAI.copyFileItem(item.name);$('folderState').textContent='Copied: '+out.name;}catch(e){$('folderState').textContent='Copy failed: '+e.message;speak('File copy failed.');}});
    row.append(open,copy);
   }
   box.append(row);
  }
 }catch(e){$('folderState').textContent=e.message;}
}
$('chooseFolder').onclick=async()=>{try{const result=await window.nextAI.chooseFolder();if(result.cancelled)return;await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('refreshFolder').onclick=refreshFolderItems;
$('parentFolder').onclick=async()=>{try{await window.nextAI.goParentFolder();await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('createFolder').onclick=()=>{const name=window.prompt('নতুন folder-এর নাম লিখো:');if(!name)return;requestVoiceConfirmation('Create a new folder named '+name+'.',async()=>{try{const result=await window.nextAI.createFolder(name);$('folderState').textContent='Folder created: '+result.name;await refreshFolderItems();}catch(e){$('folderState').textContent='Folder creation failed: '+e.message;speak('Folder creation failed.');}});};
$('browserOpen').onclick=async()=>{const button=$('browserOpen');button.disabled=true;$('browserState').textContent='Opening secure browser…';try{const result=await window.nextAI.openBrowser($('browserAddress').value);$('browserAddress').value=result.url;$('browserState').textContent='Secure Browser opened: '+result.url;}catch(e){$('browserState').textContent='Browser error: '+e.message;}finally{button.disabled=false;}};
for(const [id,direction] of [['browserBack','back'],['browserForward','forward'],['browserReload','reload']]){
 $(id).onclick=async()=>{try{await window.nextAI.browserNavigate(direction);$('browserState').textContent='Browser '+direction+' requested.';}catch(e){$('browserState').textContent=e.message;}};
}



async function refreshHomeEntities(){
 try{
  const entities=await window.nextAI.listHomeEntities();
  const box=$('homeEntities');box.textContent='';
  if(!entities.length){box.textContent='No supported devices found.';return;}
  for(const entity of entities){
   const row=document.createElement('div');row.className='memory-item';
   const label=document.createElement('span');label.textContent=entity.name+' · '+entity.entityId+' · '+entity.state;
   row.append(label);
   const addAction=(service,title,extra={})=>{const button=document.createElement('button');button.textContent=title;button.onclick=async()=>{button.disabled=true;try{const result=await window.nextAI.callHomeService({domain:entity.domain,entityId:entity.entityId,service,...extra});$('homeState').textContent=result.cancelled?'Action cancelled.':'Device action completed.';await refreshHomeEntities();}catch(e){$('homeState').textContent='Device action failed: '+e.message;}finally{button.disabled=false;}};row.append(button);};
   if(['light','switch'].includes(entity.domain)){addAction('turn_on','On');addAction('turn_off','Off');}
   else if(entity.domain==='climate'){
    const temp=document.createElement('input');temp.type='number';temp.min='5';temp.max='35';temp.step='0.5';temp.placeholder='°C';temp.style.maxWidth='85px';row.append(temp);
    const button=document.createElement('button');button.textContent='Set °C';button.onclick=async()=>{button.disabled=true;try{const result=await window.nextAI.callHomeService({domain:'climate',entityId:entity.entityId,service:'set_temperature',temperature:Number(temp.value)});$('homeState').textContent=result.cancelled?'Action cancelled.':'Temperature updated.';await refreshHomeEntities();}catch(e){$('homeState').textContent=e.message;}finally{button.disabled=false;}};row.append(button);
   }else if(entity.domain==='media_player'){addAction('media_play_pause','Play / Pause');addAction('turn_off','Off');}
   else if(entity.domain==='lock'){addAction('lock','Lock');addAction('unlock','Unlock');}
   box.append(row);
  }
  $('homeState').textContent=entities.length+' supported device(s) loaded. Each action requires confirmation.';
 }catch(e){$('homeState').textContent='Device list unavailable: '+e.message;}
}
$('homeConnect').onclick=async()=>{
 const button=$('homeConnect');button.disabled=true;$('homeState').textContent='Testing Home Assistant connection…';
 try{await window.nextAI.connectHomeAssistant({url:$('homeUrl').value.trim(),token:$('homeToken').value.trim()});$('homeToken').value='';$('homeState').textContent='Connected. Token stored encrypted on this PC.';await refreshHomeEntities();}
 catch(e){$('homeState').textContent='Connection failed: '+e.message;}
 finally{button.disabled=false;}
};
$('homeRefresh').onclick=refreshHomeEntities;


$('analyzeData').onclick=async()=>{
 const content=$('fileContent').value;
 const ext=($('fileName').value.split('.').pop()||'').toLowerCase();
 const format=ext==='json'?'json':ext==='csv'?'csv':'auto';
 const button=$('analyzeData');button.disabled=true;$('dataState').textContent='Analyzing locally…';$('dataReport').textContent='';
 try{
  const report=await window.nextAI.analyzeData({content,format});
  const summary=document.createElement('div');summary.className='memory-item';summary.textContent=report.rows+' rows · '+report.columns+' columns · '+report.duplicateRows+' duplicate rows · '+report.format.toUpperCase();$('dataReport').append(summary);
  for(const col of report.columnsSummary){
   const row=document.createElement('div');row.className='memory-item';
   const details=col.kind==='numeric'?'min '+col.min+' · max '+col.max+' · mean '+col.mean.toFixed(3)+' · median '+col.median+' · missing '+col.missing:'unique '+col.unique+' · missing '+col.missing+' · top '+col.topValues.map(v=>v.value+' ('+v.count+')').join(', ');
   row.textContent=col.name+' ['+col.kind+'] · '+details;$('dataReport').append(row);
  }
  $('dataState').textContent='Analysis complete. All calculations ran locally; file content was not uploaded.';
 }catch(e){$('dataState').textContent='Analysis failed: '+e.message;}
 finally{button.disabled=false;}
};


async function refreshBackups(){
 try{
  const items=await window.nextAI.listBackups();const box=$('backupList');box.textContent='';
  if(!items.length){box.textContent='No encrypted backups yet.';return;}
  for(const item of items){const row=document.createElement('div');row.className='memory-item';const label=document.createElement('span');label.textContent=new Date(item.createdAt).toLocaleString()+' · '+item.files+' encrypted file(s)';const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=()=>{restore.disabled=true;requestVoiceConfirmation('Restore the encrypted backup created '+new Date(item.createdAt).toLocaleString()+'. This can replace current memory, settings and task history.',async()=>{try{const result=await window.nextAI.restoreBackup(item.id);$('backupState').textContent='Restored '+result.restored+' encrypted file(s). Restart NEXT AI if settings do not refresh.';await refreshBackups();}catch(e){$('backupState').textContent='Restore failed: '+e.message;speak('Backup restore failed.');}finally{restore.disabled=false;}});};row.append(label,restore);box.append(row);}
 }catch(e){$('backupState').textContent=e.message;}
}
$('createBackup').onclick=async()=>{const button=$('createBackup');button.disabled=true;try{const result=await window.nextAI.createBackup();$('backupState').textContent='Encrypted backup created · '+result.files+' file(s).';await refreshBackups();}catch(e){$('backupState').textContent='Backup failed: '+e.message;}finally{button.disabled=false;}};
refreshBackups();


async function refreshSecurityStatus(){
 try{
  const s=await window.nextAI.getSecurityStatus();const box=$('securityState');box.textContent='';
  const checks=[
   ['Encrypted local storage',s.secureStorage?'Available':'Unavailable'],
   ['Renderer isolation',s.contextIsolation?'Enabled':'Disabled'],
   ['Node integration',s.nodeIntegration?'Enabled · review required':'Disabled'],
   ['Renderer sandbox',s.rendererSandbox?'Enabled':'Disabled'],
   ['Browser site permissions',s.browserPermissions],
   ['Allowlisted desktop apps',(s.allowedDesktopApps||[]).join(', ')],
   ['Task execution actions',(s.allowedTaskActions||[]).join(', ')],
   ['Home Assistant',s.homeAssistantConfigured?'Configured':'Not configured'],
   ['Encrypted backup snapshots',String(s.encryptedBackups)]
  ];
  for(const [name,value] of checks){const row=document.createElement('div');row.className='memory-item';const left=document.createElement('span');left.textContent=name;const right=document.createElement('strong');right.textContent=value;row.append(left,right);box.append(row);}
 }catch(e){$('securityState').textContent='Security status unavailable: '+e.message;}
}
refreshSecurityStatus();


$('runBatchResearch').onclick=async()=>{
 const queries=$('batchQueries').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const button=$('runBatchResearch');button.disabled=true;$('batchResearchResults').textContent='Running up to three research tasks in parallel…';
 try{
  const results=await window.nextAI.batchResearch(queries);
  const box=$('batchResearchResults');box.textContent='';
  for(const result of results){
   const card=document.createElement('div');card.className='memory-item';card.style.display='block';
   const heading=document.createElement('strong');heading.textContent='Research: '+result.query;const answer=document.createElement('p');answer.textContent=result.answer;card.append(heading,answer);
   for(const source of result.sources){const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.title;link.style.display='block';link.style.color='#75eaff';card.append(link);}
   box.append(card);
  }
 }catch(e){$('batchResearchResults').textContent='Parallel research failed: '+e.message;}
 finally{button.disabled=false;}
};
