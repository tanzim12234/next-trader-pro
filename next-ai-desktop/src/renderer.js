const $=id=>document.getElementById(id);
async function refresh(){const s=await window.nextAI.status();$('state').textContent='Secure storage: '+(s.secureStorage?'ON':'UNAVAILABLE')+' · Gemini: '+(s.gemini?'SET':'NOT SET')+' · Groq: '+(s.groq?'SET':'NOT SET');}
$('save').onclick=async()=>{try{await window.nextAI.saveKeys({geminiKey:$('gemini').value,groqKey:$('groq').value});$('gemini').value='';$('groq').value='';$('saveState').textContent='Saved securely.';await refresh();}catch(e){$('saveState').textContent=e.message;}};
$('send').onclick=async()=>{const q=$('prompt').value.trim();if(!q)return;$('chat').textContent='NEXT is thinking…';try{$('chat').textContent=await window.nextAI.chat(q);}catch(e){$('chat').textContent='Error: '+e.message;}};
$('yt').onclick=()=>window.nextAI.runAction({type:'youtube-open'});
$('play').onclick=()=>window.nextAI.runAction({type:'media',command:'playpause'});
$('pause').onclick=()=>window.nextAI.runAction({type:'media',command:'pause'});
refresh();
