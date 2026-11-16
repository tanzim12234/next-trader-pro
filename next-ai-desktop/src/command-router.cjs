'use strict';

function normalizeVoiceText(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[।!?！？]+$/g, '').replace(/\s+/g, ' ');
}

function classifyVoiceCommand(value) {
  const text = normalizeVoiceText(value)
    .replace(/^(hey\s+next|হেই\s+নেক্সট|হে\s+নেক্সট)\s*[,،]?\s*/i, '').trim();
  if (!text || text.length > 2000) return null;

  const appPatterns = [
    { re: /^(?:open|launch|start)\s+(?:notepad|নোটপ্যাড)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'notepad' },
    { re: /^(?:open|launch|start)\s+(?:calculator|ক্যালকুলেটর)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'calculator' },
    { re: /^(?:open|launch|start)\s+(?:file explorer|explorer|ফাইল এক্সপ্লোরার|ফাইল ম্যানেজার)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'file-explorer' },
    { re: /^(?:open|launch|start)\s+(?:task manager|টাস্ক ম্যানেজার)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'task-manager' },
    { re: /^(?:open|launch|start)\s+(?:snipping tool|snippingtool|স্নিপিং টুল)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'snipping-tool' },
    { re: /^(?:open|launch|start)\s+(?:paint|পেইন্ট)(?:\s*(?:please|খোলো|চালু করো))?$/i, app: 'paint' },
    { re: /^(?:(?:নোটপ্যাড|ক্যালকুলেটর|ফাইল এক্সপ্লোরার|ফাইল ম্যানেজার)\s*(?:খুলে দাও|খোলো|চালু করো))$/i, app: null },
    { re: /^(?:টাস্ক ম্যানেজার|স্নিপিং টুল|পেইন্ট)\s*(?:খুলে দাও|খোলো|চালু করো)$/i, app: null }
  ];
  for (const item of appPatterns) {
    if (!item.re.test(text)) continue;
    const app = item.app || (text.includes('নোটপ্যাড') ? 'notepad' : text.includes('ক্যালকুলেটর') ? 'calculator' : text.includes('টাস্ক ম্যানেজার') ? 'task-manager' : text.includes('স্নিপিং টুল') ? 'snipping-tool' : text.includes('পেইন্ট') ? 'paint' : 'file-explorer');
    return { intent: 'open-app', app, confidence: 0.99 };
  }

  const temperature = text.match(/^(?:set|change)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*(?:degrees?|°c)?$/i);
  if (temperature) return { intent: 'home-control', deviceQuery: temperature[1].trim(), service: 'set_temperature', temperature: Number(temperature[2]), confidence: 0.93 };
  const homePatterns = [
    { re: /^(?:turn on|switch on|enable)\s+(.+)$/i, service: 'turn_on' },
    { re: /^(?:turn off|switch off|disable)\s+(.+)$/i, service: 'turn_off' },
    { re: /^lock\s+(.+)$/i, service: 'lock' },
    { re: /^unlock\s+(.+)$/i, service: 'unlock' },
    { re: /^(.+?)\s+(?:জ্বালাও|চালু করো)$/i, service: 'turn_on' },
    { re: /^(.+?)\s+বন্ধ করো$/i, service: 'turn_off' },
    { re: /^(.+?)\s+লক করো$/i, service: 'lock' },
    { re: /^(.+?)\s+আনলক করো$/i, service: 'unlock' }
  ];
  for (const item of homePatterns) {
    const match = text.match(item.re);
    if (match?.[1]) return { intent: 'home-control', deviceQuery: match[1].trim(), service: item.service, confidence: 0.9 };
  }

  if (/^(?:open|launch|start)\s+youtube$|^ইউটিউব\s*(?:খোলো|খুলে দাও|চালু করো|ওপেন করো)$/i.test(text))
    return { intent: 'youtube-open', confidence: 0.99 };

  const yt = text.match(/^(?:search|find)\s+(?:on\s+)?youtube\s+(.+)$/i)
    || text.match(/^ইউটিউবে\s+(.+?)\s*(?:খোঁজো|সার্চ করো|সার্চ দাও)$/i);
  if (yt?.[1]) return { intent: 'youtube-search', query: yt[1].trim().slice(0, 200), confidence: 0.96 };

  const web = text.match(/^(?:search|google|find)\s+(?:the\s+web\s+for\s+)?(.+)$/i)
    || text.match(/^গুগলে\s+(.+?)\s*(?:খোঁজো|সার্চ করো|সার্চ দাও)$/i)
    || text.match(/^ওয়েবে\s+(.+?)\s*(?:খোঁজো|সার্চ করো|সার্চ দাও)$/i);
  if (web?.[1]) return { intent: 'web-search', query: web[1].trim().slice(0, 500), confidence: 0.94 };

  if (/^(?:play|pause|toggle music|play music|pause music|গান চালাও|গান বন্ধ করো|মিউজিক চালাও|মিউজিক বন্ধ করো|প্লে|পজ)$/i.test(text))
    return { intent: 'media-toggle', confidence: 0.98 };

  const ask = text.match(/^(?:ask|tell me|explain|জিজ্ঞেস করো|প্রশ্ন করো|আমাকে বলো)\s+(.+)$/i);
  if (ask?.[1]) return { intent: 'ask-ai', prompt: ask[1].trim().slice(0, 1500), confidence: 0.9 };

  const write = text.match(/^(?:write|type|লিখে দাও|লিখো|টাইপ করো)\s+(.+)$/i);
  if (write?.[1]) return { intent: 'type-text', text: write[1].trim().slice(0, 1000), confidence: 0.92 };

  return null;
}

function classifyVoiceConfirmation(phrase) {
  const value = normalizeVoiceText(phrase).replace(/[.!?।！？]+$/g, '').trim();
  if (/^(?:yes(?:\s+(?:sure|please|confirm|do it|go ahead))?|sure|confirm|confirmed|do it|go ahead|হ্যাঁ(?:\s+(?:নিশ্চিত|করো|করুন|ঠিক আছে))?|জি(?:\s+(?:হ্যাঁ|করুন))?|ঠিক আছে|নিশ্চিত|করো|করুন)$/i.test(value)) return 'yes';
  if (/^(?:no|nope|cancel|stop|don't|do not|না|নাহ|বাতিল|থামাও|করো না)$/i.test(value)) return 'no';
  return null;
}

module.exports = { normalizeVoiceText, classifyVoiceCommand, classifyVoiceConfirmation };
