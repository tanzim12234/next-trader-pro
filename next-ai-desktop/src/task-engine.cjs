'use strict';
const APPS = Object.freeze({
  notepad: { label: 'Notepad', command: 'notepad.exe' },
  calculator: { label: 'Calculator', command: 'calc.exe' },
  'file-explorer': { label: 'File Explorer', command: 'explorer.exe' }
});
function validateTaskStep(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('Invalid task action.');
  if (action.type === 'open-app') {
    if (!Object.prototype.hasOwnProperty.call(APPS, action.app)) throw new Error('App is not in the approved allowlist.');
    return { type: 'open-app', app: action.app };
  }
  if (action.type === 'open-url') {
    if (typeof action.url !== 'string' || action.url.length > 2048) throw new Error('Invalid URL.');
    let parsed;
    try { parsed = new URL(action.url); } catch { throw new Error('Invalid URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Only public HTTP or HTTPS URLs are allowed.');
    return { type: 'open-url', url: parsed.toString() };
  }
  if (action.type === 'youtube-search') {
    if (typeof action.query !== 'string' || !action.query.trim() || action.query.length > 200) throw new Error('Invalid YouTube search query.');
    return { type: 'youtube-search', query: action.query.trim() };
  }
  throw new Error('This task action is not supported.');
}
function normalizeTaskPlan(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw new Error('AI task plan was not valid JSON.'); }
  }
  const rawSteps = Array.isArray(parsed) ? parsed : parsed && parsed.steps;
  if (!Array.isArray(rawSteps)) throw new Error('AI did not return a task step list.');
  const steps = rawSteps.slice(0, 6).map((step, index) => {
    if (!step || typeof step.title !== 'string' || !step.action) return null;
    const title = step.title.trim().slice(0, 120);
    if (!title) return null;
    try { return { id: index + 1, title, action: validateTaskStep(step.action) }; } catch { return null; }
  }).filter(Boolean);
  if (!steps.length) throw new Error('এই কাজের জন্য কোনো অনুমোদিত action পাওয়া যায়নি।');
  return { steps };
}
module.exports = { APPS, normalizeTaskPlan, validateTaskStep };
