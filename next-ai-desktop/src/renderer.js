const $=id=>document.getElementById(id);
let recognition=null, listening=false, awaitingCommand=false, voiceProcessing=false, lastExchange=null, dictationMode=false, selectedSkillId=null,currentPatchId=null;
const metricsHistory=[];
let networkSnapshot=null,systemStatsBusy=false;
const stage=$('jarvisStage');
function setHudActivity(activity){
 const act=$('hudActivity');
 if(act&&activity)act.textContent=String(activity).toUpperCase().replace(/\s+/g,' ').slice(0,30);
}
function setCoreState(state, activity){
 if(!stage)return;
 stage.classList.remove('listening','thinking','speaking');
 if(state)stage.classList.add(state);
 stage.dataset.state=state||'standby';
 const labels={listening:'VOICE LISTENING',thinking:'PROCESSING REQUEST',speaking:'VOICE RESPONSE'};
 const voice=$('hudVoice'),act=$('hudActivity');
 if(voice)voice.textContent=labels[state]||'VOICE STANDBY';
 if(act&&activity)act.textContent=activity.toUpperCase().replace(/\s+/g,' ').slice(0,30);
}

let updateAvailable=false;
if($('checkForUpdates'))void (async()=>{
 try{
  const result=await window.nextAI.checkForUpdates();
  if(result.available){
   updateAvailable=true;
   $('updateState').textContent='Signed update available · v'+result.latestVersion+' · '+Math.ceil(result.size/1024/1024)+' MB.';
   $('downloadUpdate').disabled=false;
  }else $('updateState').textContent=result.reason||('Current version '+result.currentVersion+' · '+result.latestVersion);
 }catch(error){$('updateState').textContent='Automatic update check unavailable: '+error.message;}
})();
if($('checkForUpdates'))$('checkForUpdates').onclick=async()=>{
 const button=$('checkForUpdates'),state=$('updateState');
 button.disabled=true;state.textContent='Checking signed GitHub release…';
 $('downloadUpdate').disabled=true;$('installUpdate').disabled=true;updateAvailable=false;
 try{
  const result=await window.nextAI.checkForUpdates();
  if(result.available){
   updateAvailable=true;
   state.textContent='Verified update available · v'+result.latestVersion+' · '+Math.ceil(result.size/1024/1024)+' MB. Download only after verification.';
   $('downloadUpdate').disabled=false;
  }else state.textContent=result.reason||('Current version '+result.currentVersion+' · '+result.latestVersion);
 }catch(error){state.textContent='Secure update check failed: '+error.message;}
 finally{button.disabled=false;}
};
if($('downloadUpdate'))$('downloadUpdate').onclick=async()=>{
 const button=$('downloadUpdate');button.disabled=true;$('updateState').textContent='Downloading and verifying installer integrity…';
 try{
  const result=await window.nextAI.downloadUpdate();
  $('updateState').textContent='Installer verified and staged · version '+result.version+' · '+Math.ceil(result.size/1024/1024)+' MB. Installation still requires confirmation.';
  $('installUpdate').disabled=false;
 }catch(error){$('updateState').textContent='Update download failed: '+error.message;button.disabled=false;}
};
if($('installUpdate'))$('installUpdate').onclick=async()=>{
 const button=$('installUpdate');button.disabled=true;$('updateState').textContent='Waiting for Windows confirmation…';
 try{
  const result=await window.nextAI.installUpdate();
  $('updateState').textContent=result.cancelled?'Installation cancelled.':'Verified installer launched. NEXT AI is closing.';
 }catch(error){$('updateState').textContent='Update installation failed: '+error.message;button.disabled=false;}
};
if($('analyzeLatestError'))$('analyzeLatestError').onclick=async()=>{
 const button=$('analyzeLatestError'),box=$('aiErrorAnalysis');
 button.disabled=true;box.textContent='NEXT AI is analyzing the latest recorded error…';
 try{
  const report=await window.nextAI.analyzeLatestError();
  box.textContent='SUMMARY: '+report.summary+'\n\nROOT CAUSE: '+report.rootCause+'\n\nCONFIDENCE: '+report.confidence+'\n\nSAFE NEXT STEPS:\n'+report.steps.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\nRISKS:\n'+report.risks.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\nHuman approval required. No code was executed.';
 }catch(error){box.textContent='AI analysis unavailable: '+error.message;}
 finally{button.disabled=false;}
};
if($('createRepairDraft'))$('createRepairDraft').onclick=async()=>{
 const button=$('createRepairDraft');
 button.disabled=true;$('aiErrorAnalysis').textContent='NEXT AI is analyzing the latest error and drafting a repair…';
 try{
  const proposal=await window.nextAI.createRepairProposal({path:$('patchTargetPath').value.trim()});
  $('codeLanguage').value='javascript';
  $('codeProposal').value=proposal.content;
  $('codeExplanation').textContent='REPAIR PROPOSAL · '+proposal.path+'\n'+proposal.explanation+'\n\nReview required. Validate, stage and approve separately.';
  $('codeLabState').textContent='Repair draft created · not applied · not executed.';
  $('aiErrorAnalysis').textContent='Repair proposal prepared for '+proposal.path+'. Review the full diff before applying.';
 }catch(error){$('aiErrorAnalysis').textContent='Repair proposal unavailable: '+error.message;}
 finally{button.disabled=false;}
};
if($('generateFeatureProposal'))$('generateFeatureProposal').onclick=async()=>{
 const button=$('generateFeatureProposal');
 button.disabled=true;$('codeLabState').textContent='NEXT AI is designing a reviewable feature proposal…';
 try{
  const proposal=await window.nextAI.createFeatureProposal({
   goal:$('codeGoal').value.trim(),
   path:$('patchTargetPath').value.trim(),
   source:$('codeSource').value
  });
  $('codeLanguage').value='javascript';
  $('codeProposal').value=proposal.content;
  $('codeExplanation').textContent='FEATURE PROPOSAL · '+proposal.path+'\n'+proposal.explanation+'\n\nNot applied. Review, validate, stage and approve separately.';
  $('codeLabState').textContent='Feature proposal generated · review required · no code executed.';
 }catch(error){$('codeLabState').textContent='Feature proposal failed: '+error.message;}
 finally{button.disabled=false;}
};
async function refreshSelfHealing(){
 const state=$('selfHealState'),count=$('selfHealCount'),details=$('selfHealDetails');
 if(!state||!count||!details)return;
 try{
  const status=await window.nextAI.getSelfHealingStatus();
  count.textContent=String(status.errorsRecorded||0);
  state.textContent=status.errorsRecorded?'MONITORING · '+status.errorsRecorded+' EVENT(S)':'SELF-HEALING ONLINE';
  details.textContent=(status.lastError
   ? 'Last event: '+status.lastError.source+' · '+status.lastError.message
   : 'No runtime errors recorded.')
   +(status.latestAnalysis?' · AI diagnosis: '+status.latestAnalysis.message:'')
   +' · Log: '+status.logPath;
 }catch(error){state.textContent='DIAGNOSTICS UNAVAILABLE';details.textContent=error.message;}
}
async function runSelfHealingDiagnostics(){
 const button=$('runSelfHeal'),state=$('selfHealState'),details=$('selfHealDetails');
 if(button)button.disabled=true;
 if(state)state.textContent='SCANNING SYSTEM…';
 try{
  const report=await window.nextAI.runSelfHealingDiagnostics();
  if(state)state.textContent=report.healthy?'ALL CHECKS PASSED':'ISSUES DETECTED · '+report.checks.filter(x=>!x.ok).length;
  if(details)details.textContent=report.checks.map(x=>(x.ok?'✓ ':'✕ ')+x.label+': '+x.detail).join(' · ')+(report.recommendedActions.length?' · Recommended: '+report.recommendedActions.map(x=>x.action).join(' '):'');
  await refreshSelfHealing();
 }catch(error){if(state)state.textContent='SCAN FAILED';if(details)details.textContent=error.message;}
 finally{if(button)button.disabled=false;}
}
if($('runSelfHeal'))$('runSelfHeal').onclick=runSelfHealingDiagnostics;
window.addEventListener('error',event=>{
 const error=event.error||new Error(event.message||'Renderer error');
 void window.nextAI.reportRuntimeError({message:error.message||event.message||'Renderer error',stack:error.stack||'',code:'WINDOW_ERROR'}).catch(()=>{});
});
window.addEventListener('unhandledrejection',event=>{
 const error=event.reason instanceof Error?event.reason:new Error(String(event.reason||'Unhandled promise rejection'));
 void window.nextAI.reportRuntimeError({message:error.message,stack:error.stack||'',code:'UNHANDLED_REJECTION'}).catch(()=>{});
});
async function refresh(){const s=await window.nextAI.status();$('state').textContent='Secure storage: '+(s.secureStorage?'ON':'UNAVAILABLE')+' · Gemini: '+(s.gemini?'SET':'NOT SET')+' · Groq: '+(s.groq?'SET':'NOT SET');if($('aiProvider'))$('aiProvider').value=s.provider||'auto';if($('hudSystem'))$('hudSystem').textContent=s.secureStorage?'SECURE CORE ONLINE':'SECURE STORAGE OFF';if($('hudEngine'))$('hudEngine').textContent=s.provider==='groq'&&s.groq?'GROQ ENGINE READY':s.gemini?'GEMINI ENGINE READY':s.groq?'GROQ ENGINE READY':'API KEY REQUIRED';if($('hudEnvironment'))$('hudEnvironment').textContent=(navigator.platform||'DESKTOP').toUpperCase().slice(0,24);if($('hudMemory'))$('hudMemory').textContent='MEMORY MODULE READY';}
$('save').onclick=async()=>{try{await window.nextAI.saveKeys({geminiKey:$('gemini').value,groqKey:$('groq').value,provider:$('aiProvider').value});$('gemini').value='';$('groq').value='';$('saveState').textContent='Saved securely.';await refresh();
void refreshSelfHealing();}catch(e){$('saveState').textContent=e.message;}};
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
   if($('hudMemory'))$('hudMemory').textContent='+'+result.saved+' NEW MEMORY';
   setHudActivity('PERSONAL BRAIN LEARNED');
   await refreshMemories();
  }else if(result){
   $('learningState').textContent='এই কথোপকথনে নতুন স্থায়ী তথ্য পাওয়া যায়নি।';
  }
 }catch(error){$('learningState').textContent='স্বয়ংক্রিয় শেখা সাময়িকভাবে হয়নি: '+error.message;}
}
$('send').onclick=()=>{const q=$('prompt').value.trim();if(!q||voiceProcessing)return;$('chat').textContent='NEXT request received…';void runVoiceCommand(q);};
$('generateCode').onclick=async()=>{
 const goal=$('codeGoal').value.trim();if(!goal)return;
 const button=$('generateCode');button.disabled=true;$('codeLabState').textContent='NEXT is preparing a reviewable code draft…';
 try{
  const proposal=await window.nextAI.generateCodeProposal({goal,language:$('codeLanguage').value,source:$('codeSource').value});
  $('codeProposal').value=proposal.code;
  $('codeExplanation').textContent=proposal.explanation;
  $('codeLabState').textContent='Draft generated. Review it, then validate syntax before saving.';
 }catch(e){$('codeLabState').textContent='Code generation failed: '+e.message;}
 finally{button.disabled=false;}
};
$('validateCode').onclick=async()=>{
 try{
  const result=await window.nextAI.validateCodeProposal({language:$('codeLanguage').value,code:$('codeProposal').value});
  $('codeLabState').textContent='Validation passed: '+result.checked+'. Code was not executed.';
 }catch(e){$('codeLabState').textContent='Validation failed: '+e.message;}
};
$('saveCodeProposal').onclick=()=>requestVoiceConfirmation('Save the reviewed Code Lab draft to a file using the native save dialog.',async()=>{
 try{
  const language=$('codeLanguage').value;
  const ext=language==='javascript'?'js':language==='json'?'json':language==='markdown'?'md':'txt';
  const result=await window.nextAI.saveTextFile({name:'NEXT-improvement-draft.'+ext,content:$('codeProposal').value});
  if(!result.cancelled)$('codeLabState').textContent='Draft saved: '+result.name;
 }catch(e){$('codeLabState').textContent='Could not save draft: '+e.message;throw e;}
});
$('stagePatch').onclick=async()=>{
 try{
  if($('codeLanguage').value!=='javascript')throw new Error('Patch staging currently accepts JavaScript source only.');
  const target=$('patchTargetPath').value.trim();
  const code=$('codeProposal').value;
  if(!target||!code)throw new Error('Target path and generated code are required.');
  await window.nextAI.validateCodeProposal({language:'javascript',code});
  const proposal=await window.nextAI.createPatchProposal({path:target,content:code});
  currentPatchId=proposal.id;
  $('applyPatch').disabled=false;$('rollbackPatch').disabled=true;
  $('patchState').textContent='Review required · '+proposal.files.length+' file(s) · ID '+proposal.id.slice(0,8)+'. Apply করতে voice + native confirmation লাগবে.';
  $('codeExplanation').textContent='PATCH DIFF\n'+proposal.files[0].diff+'\n\nOriginal hash: '+proposal.files[0].beforeHash.slice(0,12)+' · Proposed hash: '+proposal.files[0].afterHash.slice(0,12);
 }catch(e){$('patchState').textContent='Could not stage patch: '+e.message;}
};
$('applyPatch').onclick=()=>requestVoiceConfirmation('Apply the reviewed source-code patch to the selected project folder. NEXT will not run the code or tests.',async()=>{
 try{
  if(!currentPatchId)throw new Error('No staged patch is selected.');
  const result=await window.nextAI.applyPatchProposal(currentPatchId);
  if(result.cancelled){$('patchState').textContent='Patch application cancelled.';return;}
  $('patchState').textContent='Patch applied to '+result.files.join(', ')+'. Tests were NOT run. Run project tests/CI before using it.';
  $('applyPatch').disabled=true;$('rollbackPatch').disabled=false;
 }catch(e){$('patchState').textContent='Patch was not applied: '+e.message;throw e;}
});
$('rollbackPatch').onclick=()=>requestVoiceConfirmation('Rollback the last applied source-code patch. Restore the original file contents.',async()=>{
 try{
  if(!currentPatchId)throw new Error('No applied patch is selected.');
  const result=await window.nextAI.rollbackPatchProposal(currentPatchId);
  if(result.cancelled){$('patchState').textContent='Rollback cancelled.';return;}
  $('patchState').textContent='Rolled back: '+result.files.join(', ');
  $('rollbackPatch').disabled=true;
 }catch(e){$('patchState').textContent='Rollback failed: '+e.message;throw e;}
});
$('openTextFile').onclick=async()=>{try{const file=await window.nextAI.openTextFile();if(file.cancelled)return;$('fileName').value=file.name;$('fileContent').value=file.content;$('fileState').textContent='Opened: '+file.name;}catch(e){$('fileState').textContent='Open failed: '+e.message;}};
$('saveTextFile').onclick=()=>requestVoiceConfirmation('Save the current text as '+$('fileName').value+'. The native save dialog will let you choose its location.',async()=>{try{const result=await window.nextAI.saveTextFile({name:$('fileName').value,content:$('fileContent').value});if(!result.cancelled)$('fileState').textContent='Saved: '+result.name;}catch(e){$('fileState').textContent='Save failed: '+e.message;throw e;}});
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
$('openNotepad').onclick=()=>window.nextAI.runAction({type:'open-app',app:'notepad'});
$('openCalculator').onclick=()=>window.nextAI.runAction({type:'open-app',app:'calculator'});
$('openExplorer').onclick=()=>window.nextAI.runAction({type:'open-app',app:'file-explorer'});
$('openTaskManager').onclick=()=>window.nextAI.runAction({type:'open-app',app:'task-manager'});
$('openSnippingTool').onclick=()=>window.nextAI.runAction({type:'open-app',app:'snipping-tool'});
$('openPaint').onclick=()=>window.nextAI.runAction({type:'open-app',app:'paint'});
function speak(text,after){if(!('speechSynthesis'in window)){if(typeof after==='function')after();return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||''));u.lang=$('voiceLanguage')?.value||'bn-BD';u.onstart=()=>setCoreState('speaking','Voice output active');u.onend=()=>{setCoreState(listening?'listening':'',listening?'Wake word detection active':'Awaiting input');if(typeof after==='function')after();};u.onerror=()=>{setCoreState(listening?'listening':'',listening?'Wake word detection active':'Voice output unavailable');if(typeof after==='function')after();};speechSynthesis.speak(u);}
let pendingVoiceConfirmation=null,pendingVoiceCancel=null;
function requestVoiceConfirmation(question,action,onCancel){
 if(listening){listening=false;if(recognition)recognition.stop();$('voice').textContent='Start voice listening';}
 pendingVoiceConfirmation=action;pendingVoiceCancel=typeof onCancel==='function'?onCancel:null;awaitingCommand=false;
 $('voiceState').textContent='Confirmation required · say “Yes sure” or “No”';
 speak(question+' Sir, are you sure? Say “Yes sure” to continue or “No” to cancel.',()=>{if(!listening)startVoice();});
}
async function handleVoiceConfirmation(phrase){
 if(!pendingVoiceConfirmation)return false;
 const decision=await window.nextAI.classifyVoiceConfirmation(phrase);
 if(!decision){speak('Please say yes sure to continue, or no to cancel.');return true;}
 const action=pendingVoiceConfirmation,cancel=pendingVoiceCancel;pendingVoiceConfirmation=null;pendingVoiceCancel=null;
 if(decision==='no'){if(cancel)cancel();$('voiceState').textContent='Voice action cancelled.';speak('Understood. Action cancelled.');return true;}
 $('voiceState').textContent='Voice confirmation accepted. Executing…';voiceProcessing=true;
 try{await action();$('voiceState').textContent='Confirmed action completed.';speak('Confirmed. The action has been completed.');}
 catch(e){$('voiceState').textContent='Confirmed action failed: '+e.message;speak('The confirmed action failed.');}
 finally{voiceProcessing=false;}
 return true;
}
function setDictationMode(enabled){
 dictationMode=!!enabled;
 const button=$('voiceTyping');
 if(button){button.textContent=dictationMode?'Stop voice typing':'Start voice typing';button.setAttribute('aria-pressed',String(dictationMode));}
 $('voiceState').textContent=dictationMode?'Voice typing active · speak to type in the focused app':'Voice typing stopped.';
 if(dictationMode&&!listening)startVoice();
 if(!dictationMode)speak('Voice typing stopped.');
}
async function runVoiceCommand(raw){
 setCoreState('thinking','Interpreting voice command');
 let text=raw.trim().toLowerCase();
 text=text.replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').trim();
 if(!text){awaitingCommand=true;$('voiceState').textContent='Wake word heard — say a command';speak('Yes?');return;}
 awaitingCommand=false;
 if(voiceProcessing)return;
 voiceProcessing=true;
 try{
  const routed=await window.nextAI.classifyVoice(raw);
  if(routed){
   if(routed.intent==='voice-typing-start'){setDictationMode(true);speak('Voice typing is on. Speak naturally. Say stop voice typing when finished.');return;}
   if(routed.intent==='voice-typing-stop'){setDictationMode(false);return;}
   if(routed.intent==='lock-laptop'){
    requestVoiceConfirmation('Lock this Windows laptop now?',async()=>{await window.nextAI.runAction({type:'lock-workstation'});});
    return;
   }
   if(routed.intent==='shutdown-laptop'){
    requestVoiceConfirmation('Shut down this Windows laptop immediately? Unsaved work may be lost.',async()=>{await window.nextAI.runAction({type:'shutdown-workstation'});});
    return;
   }
   if(routed.intent==='unlock-laptop-guidance'){speak('Windows sign-in protection cannot be bypassed by voice. Use your PIN, password, or Windows Hello on the laptop.');$('voiceState').textContent='Unlock with Windows Hello, PIN or password.';return;}
   if(routed.intent==='power-on-guidance'){speak('A fully powered-off laptop cannot turn itself on using its own voice assistant. Use the power button, or configure supported BIOS automatic power on or Wake on LAN from another device.');$('voiceState').textContent='Power on by voice is not available while this laptop is fully off.';return;}
   if(routed.intent==='system-status'){
    const s=await window.nextAI.getSystemStats();
    const parts=['CPU '+(s.cpuPercent===null?'sampling':s.cpuPercent+' percent'),'memory '+s.memoryPercent+' percent'];
    if(s.disks?.length){const d=s.disks[0];parts.push('drive '+d.name+' '+Math.round((d.sizeBytes-d.freeBytes)/d.sizeBytes*100)+' percent used');}
    if(s.batteries?.some(b=>b.percent!==null)){const b=s.batteries.find(x=>x.percent!==null);parts.push('battery '+b.percent+' percent');}
    if(s.networks?.length)parts.push(s.networks.length+' network adapter statistics available');
    speak('Current system status. '+parts.join('. ')+'.');
    $('voiceState').textContent='Read current local system metrics.';
    return;
   }
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
   if(routed.intent==='ask-ai'){const answer=await window.nextAI.chat({message:routed.prompt,skillId:selectedSkillId});$('prompt').value=routed.prompt;$('chat').textContent=answer;lastExchange={question:routed.prompt,answer};$('saveConversation').disabled=false;$('reviewLearning').disabled=false;void autoLearnExchange(lastExchange);speak(answer);return;}
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
 if(!SR){if(pendingVoiceConfirmation){pendingVoiceConfirmation=null;if(pendingVoiceCancel){pendingVoiceCancel();pendingVoiceCancel=null;}}dictationMode=false;const button=$('voiceTyping');if(button){button.textContent='Start voice typing';button.setAttribute('aria-pressed','false');}$('voiceState').textContent='Speech recognition is not available in this Electron build. Sensitive action cancelled; use a supported microphone.';return;}
 recognition=new SR();recognition.lang=$('voiceLanguage')?.value||'bn-BD';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
 recognition.onstart=()=>{$('voiceState').textContent='Listening for “Hey NEXT”…';setCoreState('listening',dictationMode?'Voice typing active':'Wake word detection active');};
 recognition.onresult=async ev=>{
  if(voiceProcessing)return;
  for(let i=ev.resultIndex;i<ev.results.length;i++){
   const result=ev.results[i],phrase=result[0].transcript.trim();
   if(!result.isFinal){if(phrase){$('voiceState').textContent='Hearing: '+phrase;setHudActivity('HEARING: '+phrase);}continue;}
   if(!phrase)continue;
   $('voiceState').textContent='Heard: '+phrase;setHudActivity('VOICE INPUT RECEIVED');
    if(pendingVoiceConfirmation){await handleVoiceConfirmation(phrase);break;}
   const dictationText=phrase.replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i,'').trim();
   if(dictationMode&&/^(?:stop|end|disable) voice typing|^voice typing stop|^ভয়েস টাইপিং (?:বন্ধ|থামাও) করো|^কথা লেখা বন্ধ করো$/i.test(dictationText)){
    setDictationMode(false);break;
   }
   if(dictationMode){
    voiceProcessing=true;
    try{await window.nextAI.runAction({type:'write-text',text:phrase});$('voiceState').textContent='Typed: '+phrase.slice(0,90);}
    catch(e){$('voiceState').textContent='Voice typing failed: '+e.message;}
    finally{voiceProcessing=false;}
    continue;
   }
   if(/(?:\bhey\s+next\b|হেই\s+নেক্সট|হে\s+নেক্সট)/i.test(phrase)){await runVoiceCommand(phrase);break;}
   if(awaitingCommand){await runVoiceCommand(phrase);break;}
  }
 };
 recognition.onerror=ev=>{
  const messages={ 'not-allowed':'Microphone permission denied. Allow microphone access in Windows settings.', 'service-not-allowed':'Speech recognition service is blocked in this environment.', 'audio-capture':'No working microphone was found.', 'network':'Speech recognition needs an internet connection.' };
  if(pendingVoiceConfirmation&&['not-allowed','service-not-allowed','audio-capture'].includes(ev.error)){pendingVoiceConfirmation=null;if(pendingVoiceCancel){pendingVoiceCancel();pendingVoiceCancel=null;}}
  $('voiceState').textContent=messages[ev.error]||('Voice error: '+ev.error);
  if(['not-allowed','service-not-allowed','audio-capture'].includes(ev.error)){listening=false;dictationMode=false;const button=$('voiceTyping');if(button){button.textContent='Start voice typing';button.setAttribute('aria-pressed','false');}$('voice').textContent='Start voice listening';setCoreState('', 'Voice unavailable');}
 };
 recognition.onend=()=>{if(listening){$('voiceState').textContent='Reconnecting voice recognition…';setTimeout(()=>{if(!listening||!recognition)return;try{recognition.start();}catch(e){$('voiceState').textContent='Voice restart failed: '+e.message;}},450);}else {$('voiceState').textContent='Voice stopped';setCoreState('', 'Voice standby');}};
 listening=true;
 try{recognition.start();$('voice').textContent='Stop voice listening';}
 catch(e){listening=false;dictationMode=false;const button=$('voiceTyping');if(button){button.textContent='Start voice typing';button.setAttribute('aria-pressed','false');}if(pendingVoiceConfirmation){pendingVoiceConfirmation=null;if(pendingVoiceCancel){pendingVoiceCancel();pendingVoiceCancel=null;}}$('voice').textContent='Start voice listening';$('voiceState').textContent='Could not start microphone: '+e.message+' Sensitive action cancelled.';}
}
function stopVoice(){listening=false;awaitingCommand=false;dictationMode=false;const dictationButton=$('voiceTyping');if(dictationButton){dictationButton.textContent='Start voice typing';dictationButton.setAttribute('aria-pressed','false');}pendingVoiceConfirmation=null;if(pendingVoiceCancel){pendingVoiceCancel();pendingVoiceCancel=null;}if(recognition)recognition.stop();if('speechSynthesis'in window)speechSynthesis.cancel();$('voice').textContent='Start voice listening';}
$('voice').onclick=()=>listening?stopVoice():startVoice();
$('voiceTyping').onclick=()=>setDictationMode(!dictationMode);
refresh();

async function refreshSystemStats(){
 if(systemStatsBusy)return;systemStatsBusy=true;
 try{
  const s=await window.nextAI.getSystemStats();
  $('systemCpu').textContent=s.cpuPercent===null?'Sampling…':s.cpuPercent+'%';if($('hudSystem'))$('hudSystem').textContent='CPU '+(s.cpuPercent===null?'--':s.cpuPercent+'%')+' · RAM '+s.memoryPercent+'%';
  const used=(s.totalMemoryBytes-s.freeMemoryBytes)/1073741824;
  const total=s.totalMemoryBytes/1073741824;
  $('systemMemory').textContent=s.memoryPercent+'% · '+used.toFixed(1)+' / '+total.toFixed(1)+' GB';if($('hudActivity')&&(!stage||(!stage.classList.contains('listening')&&!stage.classList.contains('thinking')&&!stage.classList.contains('speaking'))))setHudActivity('SYSTEM TELEMETRY LIVE');
  if($('systemDisk'))$('systemDisk').textContent=s.disks?.length?s.disks.map(d=>{const usedBytes=Math.max(0,d.sizeBytes-d.freeBytes);const percent=Math.round(usedBytes/d.sizeBytes*100);return d.name+' '+percent+'%';}).join(' · '):'Unavailable';
  if($('systemDiskDetails'))$('systemDiskDetails').textContent=s.disks?.length?s.disks.slice(0,4).map(d=>{const usedBytes=Math.max(0,d.sizeBytes-d.freeBytes);return d.name+' · '+(usedBytes/1073741824).toFixed(1)+' / '+(d.sizeBytes/1073741824).toFixed(1)+' GB used';}).join(' | '):'Disk details unavailable on this system';
  if($('systemBattery')){const b=s.batteries?.find(x=>x.percent!==null);$('systemBattery').textContent=b?b.percent+'% · '+(b.status===3?'Full':([2,6,7,8,9].includes(b.status)?'Charging':'On battery')):'No battery detected';}
  if($('systemNetwork')){const now=Date.now();let received=0,sent=0;if(networkSnapshot&&s.networks?.length){const elapsed=Math.max(1,(now-networkSnapshot.time)/1000);for(const n of s.networks){const prev=networkSnapshot.adapters[n.name];if(prev){received+=Math.max(0,n.receivedBytes-prev.receivedBytes)/elapsed;sent+=Math.max(0,n.sentBytes-prev.sentBytes)/elapsed;}}$('systemNetwork').textContent='↓ '+(received/1024).toFixed(1)+' KB/s · ↑ '+(sent/1024).toFixed(1)+' KB/s';}else $('systemNetwork').textContent=s.detailsAvailable?'Sampling…':'Unavailable';networkSnapshot={time:now,adapters:Object.fromEntries((s.networks||[]).map(n=>[n.name,{receivedBytes:n.receivedBytes,sentBytes:n.sentBytes}]))};}
  if($('systemNetworkDetails'))$('systemNetworkDetails').textContent=s.networks?.length?s.networks.map(n=>n.name).join(' · '):'No active adapter statistics';
  const hours=Math.floor(s.uptimeSeconds/3600),minutes=Math.floor((s.uptimeSeconds%3600)/60);
  $('systemUptime').textContent=hours+'h '+minutes+'m';
  $('systemState').textContent=s.platform+' · '+s.arch+' · '+s.cpuCores+' CPU cores'+(s.detailsAvailable?' · Extended telemetry active':' · Extended telemetry unavailable')+' · Updated '+new Date().toLocaleTimeString();
  metricsHistory.push({time:Date.now(),cpu:s.cpuPercent,memory:s.memoryPercent});if(metricsHistory.length>60)metricsHistory.shift();
  const valid=metricsHistory.filter(x=>x.cpu!==null);
  const trend=(key)=>{if(valid.length<6)return null;const first=valid[0],last=valid[valid.length-1],seconds=(last.time-first.time)/1000;if(seconds<20)return null;return (last[key]-first[key])/seconds;};
  const memSlope=trend('memory'),cpuSlope=trend('cpu');
  const memForecast=memSlope===null?null:Math.max(0,Math.min(100,s.memoryPercent+memSlope*300));
  const cpuForecast=cpuSlope===null||s.cpuPercent===null?null:Math.max(0,Math.min(100,s.cpuPercent+cpuSlope*300));
  const warnings=[];if(s.memoryPercent>=90)warnings.push('High memory use now');if(s.cpuPercent>=95)warnings.push('High CPU use now');if(memForecast>=95)warnings.push('Memory may reach critical level within ~5 min');
  $('systemPrediction').textContent=(memForecast===null?'Collecting trend samples…':'5-min estimate · RAM '+memForecast.toFixed(1)+'%'+(cpuForecast===null?'':' · CPU '+cpuForecast.toFixed(1)+'%'))+(warnings.length?' · ALERT: '+warnings.join('; '):' · No critical threshold detected');
 }catch(e){$('systemState').textContent='Monitoring unavailable: '+e.message;}
 finally{systemStatsBusy=false;}
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
   const del=document.createElement('button');del.textContent='Forget';del.onclick=()=>requestVoiceConfirmation('Forget this saved memory: '+String(item.text||'').slice(0,140)+'.',async()=>{await window.nextAI.forgetMemory(item.id);await refreshMemories();$('memoryState').textContent='Memory forgotten.';});
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
$('clearMemory').onclick=()=>requestVoiceConfirmation('Delete all Personal Brain memories. This cannot be undone.',async()=>{
 try{await window.nextAI.clearMemories();await refreshMemories();$('memoryState').textContent='All saved memories cleared.';}
 catch(e){$('memoryState').textContent='Memory clear failed: '+e.message;throw e;}
});
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
    const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=()=>requestVoiceConfirmation('Copy the file '+item.name+' to the destination you choose.',async()=>{try{const out=await window.nextAI.copyFileItem(item.name);$('folderState').textContent='Copied: '+out.name;}catch(e){$('folderState').textContent='Copy failed: '+e.message;throw e;}});
    row.append(open,copy);
   }
   box.append(row);
  }
 }catch(e){$('folderState').textContent=e.message;}
}
$('chooseFolder').onclick=async()=>{try{const result=await window.nextAI.chooseFolder();if(result.cancelled)return;await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('refreshFolder').onclick=refreshFolderItems;
$('parentFolder').onclick=async()=>{try{await window.nextAI.goParentFolder();await refreshFolderItems();}catch(e){$('folderState').textContent=e.message;}};
$('createFolder').onclick=()=>{const name=window.prompt('নতুন folder-এর নাম লিখো:');if(!name)return;requestVoiceConfirmation('Create a new folder named '+name+'.',async()=>{try{const result=await window.nextAI.createFolder(name);$('folderState').textContent='Folder created: '+result.name;await refreshFolderItems();}catch(e){$('folderState').textContent='Folder creation failed: '+e.message;throw e;}});};
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
   const addAction=(service,title,extra={})=>{const button=document.createElement('button');button.textContent=title;const perform=async()=>{button.disabled=true;try{await window.nextAI.callHomeService({domain:entity.domain,entityId:entity.entityId,service,...extra});$('homeState').textContent='Device action completed.';await refreshHomeEntities();}catch(e){$('homeState').textContent='Device action failed: '+e.message;throw e;}finally{button.disabled=false;}};button.onclick=()=>['lock','unlock'].includes(service)?requestVoiceConfirmation(service.toUpperCase()+' '+entity.name+'.',perform):perform();row.append(button);};
   if(['light','switch'].includes(entity.domain)){addAction('turn_on','On');addAction('turn_off','Off');}
   else if(entity.domain==='climate'){
    const temp=document.createElement('input');temp.type='number';temp.min='5';temp.max='35';temp.step='0.5';temp.placeholder='°C';temp.style.maxWidth='85px';row.append(temp);
    const button=document.createElement('button');button.textContent='Set °C';button.onclick=async()=>{button.disabled=true;try{const result=await window.nextAI.callHomeService({domain:'climate',entityId:entity.entityId,service:'set_temperature',temperature:Number(temp.value)});$('homeState').textContent=result.cancelled?'Action cancelled.':'Temperature updated.';await refreshHomeEntities();}catch(e){$('homeState').textContent=e.message;}finally{button.disabled=false;}};row.append(button);
   }else if(entity.domain==='media_player'){addAction('media_play_pause','Play / Pause');addAction('turn_off','Off');}
   else if(entity.domain==='lock'){addAction('lock','Lock');addAction('unlock','Unlock');}
   box.append(row);
  }
  $('homeState').textContent=entities.length+' supported device(s) loaded. Routine controls are direct; lock/unlock require spoken confirmation.';
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
  for(const item of items){const row=document.createElement('div');row.className='memory-item';const label=document.createElement('span');label.textContent=new Date(item.createdAt).toLocaleString()+' · '+item.files+' encrypted file(s)';const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=()=>{restore.disabled=true;requestVoiceConfirmation('Restore the encrypted backup created '+new Date(item.createdAt).toLocaleString()+'. This can replace current memory, settings and task history.',async()=>{try{const result=await window.nextAI.restoreBackup(item.id);$('backupState').textContent='Restored '+result.restored+' encrypted file(s). Restart NEXT AI if settings do not refresh.';await refreshBackups();}catch(e){$('backupState').textContent='Restore failed: '+e.message;throw e;}finally{restore.disabled=false;}},()=>{restore.disabled=false;$('backupState').textContent='Restore cancelled.';});};row.append(label,restore);box.append(row);}
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


// GitHub Skill Library: downloaded Markdown remains inert and untrusted.
async function refreshSkillLibrary(){
 const box=$('installedSkills'); if(!box)return;
 box.textContent='Loading installed skills…';
 try{
  const skills=await window.nextAI.listSkills();box.textContent='';
  if(!skills.length){box.textContent='No skills installed yet.';return;}
  for(const skill of skills){
   const row=document.createElement('div');row.className='memory-item';
   const info=document.createElement('div');info.style.flex='1';
   const title=document.createElement('strong');title.textContent=skill.name;
   const desc=document.createElement('p');desc.className='hint';desc.textContent=(skill.description||'No description')+' · '+skill.trust+' · '+(skill.enabled?'Enabled':'Disabled');
   info.append(title,desc);
   const use=document.createElement('button');use.textContent=selectedSkillId===skill.id?'Selected for AI':(skill.enabled?'Use in AI':'Enable & use');
   use.disabled=selectedSkillId===skill.id;
   use.onclick=async()=>{
    use.disabled=true;
    try{
     if(!skill.enabled)await window.nextAI.setSkillEnabled({id:skill.id,enabled:true});
     selectedSkillId=skill.id;
     $('activeSkillState').textContent='AI reference selected: '+skill.name+' · downloaded content is untrusted and will not execute.';
     await refreshSkillLibrary();
    }catch(e){$('skillPreview').textContent='Could not select skill: '+e.message;use.disabled=false;}
   };
   const toggle=document.createElement('button');toggle.textContent=skill.enabled?'Disable':'Enable';
   toggle.onclick=async()=>{
    try{
     await window.nextAI.setSkillEnabled({id:skill.id,enabled:!skill.enabled});
     if(!skill.enabled){$('activeSkillState').textContent='Skill enabled. Select “Use in AI” to attach it to a chat.';}
     else if(selectedSkillId===skill.id){selectedSkillId=null;$('activeSkillState').textContent='Selected skill disabled; no skill reference is active.';}
     await refreshSkillLibrary();
    }catch(e){$('skillPreview').textContent='Enable/disable failed: '+e.message;}
   };
   const inspect=document.createElement('button');inspect.textContent='Inspect';inspect.onclick=async()=>{
    try{const item=await window.nextAI.readSkill(skill.id);$('skillPreview').textContent='UNTRUSTED SKILL · '+item.metadata.name+'\nSource: '+item.metadata.sourceUrl+'\n\n'+item.content;}
    catch(e){$('skillPreview').textContent='Could not read skill: '+e.message;}
   };
   const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=async()=>{
    if(!confirm('Remove this locally installed Markdown skill?'))return;
    try{await window.nextAI.removeSkill(skill.id);if(selectedSkillId===skill.id){selectedSkillId=null;$('activeSkillState').textContent='Selected skill removed; no skill reference is active.';} $('skillPreview').textContent='Skill removed.';await refreshSkillLibrary();}
    catch(e){$('skillPreview').textContent='Remove failed: '+e.message;}
   };
   row.append(info,use,toggle,inspect,remove);box.append(row);
  }
 }catch(e){box.textContent='Skill library unavailable: '+e.message;}
}
$('searchSkills').onclick=async()=>{
 const query=$('skillSearch').value.trim();if(!query)return;
 const button=$('searchSkills'),box=$('skillSearchResults');button.disabled=true;box.textContent='Searching GitHub…';
 try{
  const results=await window.nextAI.searchSkills(query);box.textContent='';
  if(!results.length){box.textContent='No matching public repositories found.';return;}
  for(const item of results){
   const row=document.createElement('div');row.className='memory-item';
   const info=document.createElement('div');info.style.flex='1';
   const title=document.createElement('strong');title.textContent=item.fullName;
   const desc=document.createElement('p');desc.className='hint';desc.textContent=(item.description||'No description')+' · ★ '+item.stars;
   const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View repository';link.style.color='#75eaff';
   info.append(title,desc,link);
   const install=document.createElement('button');install.textContent='Install SKILL.md';install.onclick=async()=>{
    install.disabled=true;
    try{const installed=await window.nextAI.installSkill({repo:item.fullName,path:'SKILL.md'});$('skillPreview').textContent='Installed as disabled, untrusted Markdown: '+installed.name+'\nReview it before use.';await refreshSkillLibrary();}
    catch(e){$('skillPreview').textContent='Install failed: '+e.message;}
    finally{install.disabled=false;}
   };
   row.append(info,install);box.append(row);
  }
 }catch(e){box.textContent='GitHub search failed: '+e.message;}
 finally{button.disabled=false;}
};
$('refreshSkills').onclick=refreshSkillLibrary;
$('clearActiveSkill').onclick=()=>{selectedSkillId=null;$('activeSkillState').textContent='No skill reference selected.';void refreshSkillLibrary();};
refreshSkillLibrary();


// Start hands-free wake-word listening automatically when the desktop UI is ready.
// Electron/Windows may still request microphone permission on first launch.
window.addEventListener('DOMContentLoaded', () => {
 setTimeout(() => {
  if (typeof startVoice === 'function' && !listening) startVoice();
 }, 1400);
}, { once: true });
