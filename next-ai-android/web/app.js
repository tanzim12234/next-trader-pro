const $ = id => document.getElementById(id);
const native = () => window.Capacitor?.Plugins || {};
const secure = () => native().NextSecureStorage;
const speech = () => native().SpeechRecognition;
let busy = false;

async function saveKey() {
  const provider = $('provider').value.trim().toLowerCase();
  const key = $('apiKey').value.trim();
  if (!['gemini','groq'].includes(provider) || !key) throw new Error('Provider gemini/groq এবং API key দাও।');
  if (!secure()) throw new Error('Android Keystore plugin পাওয়া যায়নি।');
  await secure().set({key: provider + 'Key', value: key});
  $('apiKey').value = '';
  $('keyStatus').textContent = provider.toUpperCase() + ' key Android Keystore দিয়ে encrypted storage-এ রাখা হয়েছে।';
}
async function getKey(provider) {
  const result = await secure().get({key: provider + 'Key'});
  return result.value || '';
}
async function askAI(message) {
  if (busy) return;
  busy = true; $('answer').textContent = 'NEXT ভাবছে…';
  try {
    let key = await getKey('gemini');
    if (key) {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:message}]}]})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');
      $('answer').textContent = data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || 'উত্তর পাওয়া যায়নি।';
    } else {
      key = await getKey('groq');
      if (!key) throw new Error('Settings-এ Gemini অথবা Groq API key যোগ করো।');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'user',content:message}]})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
      $('answer').textContent = data.choices?.[0]?.message?.content || 'উত্তর পাওয়া যায়নি।';
    }
  } catch(e) { $('answer').textContent = 'সমস্যা: ' + e.message; }
  finally { busy = false; }
}
function say(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u0980-\u09FF]/.test(text) ? 'bn-BD' : 'en-US';
  speechSynthesis.speak(utterance);
}
async function runCommand(raw) {
  const t = raw.toLowerCase().replace(/^hey\s*next\s*/, '').trim();
  if (/^(open|launch) youtube$/.test(t) || /ইউটিউব খোলো|ইউটিউব চালু করো/.test(t)) {
    window.open('https://www.youtube.com','_blank'); say('YouTube খুলছি'); return;
  }
  if (t.startsWith('search ') || t.startsWith('সার্চ ') || t.startsWith('খুঁজে দাও ')) {
    const q = t.replace(/^(search|সার্চ|খুঁজে দাও)\s*/, '');
    window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(q),'_blank'); say('খুঁজছি'); return;
  }
  if (t.startsWith('write ') || t.startsWith('লিখে রাখো ') || t.startsWith('লিখো ')) {
    $('prompt').value = raw.replace(/^hey\s*next\s*/i,'').replace(/^(write|লিখে রাখো|লিখো)\s*/i,'');
    say('লেখাটি ইনপুটে বসিয়েছি'); return;
  }
  if (/^(pause|play|pause music|play music)$/.test(t) || /গান থামাও|গান চালাও/.test(t)) {
    say('Android নিরাপত্তার কারণে অন্য অ্যাপের media control এখনো চালু করা হয়নি'); return;
  }
  await askAI(raw);
}
$('saveKey').addEventListener('click', async()=>{try{await saveKey();}catch(e){$('keyStatus').textContent=e.message;}});
$('send').addEventListener('click',()=>{const q=$('prompt').value.trim();if(q)askAI(q);});
$('voice').addEventListener('click', async()=>{
  try {
    const sr = speech();
    if (!sr) throw new Error('Native speech recognition plugin পাওয়া যায়নি।');
    const permission = await sr.requestPermissions();
    if (permission.speechRecognition !== 'granted') throw new Error('Microphone permission দেওয়া হয়নি।');
    const availability = await sr.available();
    if (!availability.available) throw new Error('এই ডিভাইসে speech recognition service নেই।');
    $('voiceStatus').textContent = 'শুনছি…';
    const result = await sr.start({language:'bn-BD',maxResults:3,prompt:'NEXT-কে command বলো',partialResults:false,popup:true});
    const phrase = result.matches?.[0];
    if (!phrase) { $('voiceStatus').textContent='কথা বোঝা যায়নি। আবার চেষ্টা করো।'; return; }
    $('voiceStatus').textContent = 'শুনেছি: ' + phrase;
    await runCommand(phrase);
  } catch(e) { $('voiceStatus').textContent = 'Voice error: ' + e.message; }
});
