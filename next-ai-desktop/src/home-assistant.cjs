'use strict';

const ALLOWED_SERVICES = Object.freeze({
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  climate: ['set_temperature', 'turn_on', 'turn_off'],
  media_player: ['media_play_pause', 'volume_set', 'turn_on', 'turn_off'],
  lock: ['lock', 'unlock']
});

function normalizeHomeAssistantUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Home Assistant URL is required.');
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Use a valid HTTP/HTTPS Home Assistant URL without credentials or query parameters.');
  const host = url.hostname.toLowerCase();
  const localHost = host === 'localhost' || host.endsWith('.local') || host === '::1' ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
  if (url.protocol === 'http:' && !localHost) throw new Error('Public Home Assistant hosts must use HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function validateServiceCall(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid device action.');
  const { entityId, service, domain } = input;
  if (!Object.hasOwn(ALLOWED_SERVICES, domain) || !ALLOWED_SERVICES[domain].includes(service))
    throw new Error('This device service is not allowed.');
  if (typeof entityId !== 'string' || !new RegExp('^' + domain + '\\.[a-z0-9_]+.test(entityId))
    throw new Error('Invalid device entity ID.');
  const data = { entity_id: entityId };
  if (service === 'set_temperature') {
    const temperature = Number(input.temperature);
    if (!Number.isFinite(temperature) || temperature < 5 || temperature > 35) throw new Error('Temperature must be between 5 and 35°C.');
    data.temperature = temperature;
  }
  if (service === 'volume_set') {
    const volume = Number(input.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Volume must be between 0 and 1.');
    data.volume_level = volume;
  }
  return { domain, service, data };
}

function createHomeAssistantClient({ baseUrl, token, fetchImpl = fetch }) {
  const root = normalizeHomeAssistantUrl(baseUrl);
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('Home Assistant long-lived access token is invalid.');
  async function request(path, options = {}) {
    const response = await fetchImpl(root + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(12000)
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('Home Assistant request failed (' + response.status + ').');
    try { return raw ? JSON.parse(raw) : null; } catch { throw new Error('Home Assistant returned invalid JSON.'); }
  }
  return {
    async test() { await request('/api/'); return { ok: true }; },
    async listEntities() {
      const states = await request('/api/states');
      if (!Array.isArray(states)) throw new Error('Home Assistant returned an invalid entity list.');
      return states.filter(item => item && typeof item.entity_id === 'string' && Object.hasOwn(ALLOWED_SERVICES, item.entity_id.split('.')[0]))
        .slice(0, 300).map(item => ({ entityId: item.entity_id, state: String(item.state || '').slice(0, 80), name: String(item.attributes?.friendly_name || item.entity_id).slice(0, 120), domain: item.entity_id.split('.')[0] }));
    },
    async call(input) {
      const action = validateServiceCall(input);
      return request('/api/services/' + action.domain + '/' + action.service, { method: 'POST', body: JSON.stringify(action.data) });
    }
  };
}

module.exports = { ALLOWED_SERVICES, normalizeHomeAssistantUrl, validateServiceCall, createHomeAssistantClient };
).test(entityId))
    throw new Error('Invalid device entity ID.');
  const data = { entity_id: entityId };
  if (service === 'set_temperature') {
    const temperature = Number(input.temperature);
    if (!Number.isFinite(temperature) || temperature < 5 || temperature > 35) throw new Error('Temperature must be between 5 and 35°C.');
    data.temperature = temperature;
  }
  if (service === 'volume_set') {
    const volume = Number(input.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Volume must be between 0 and 1.');
    data.volume_level = volume;
  }
  return { domain, service, data };
}

function createHomeAssistantClient({ baseUrl, token, fetchImpl = fetch }) {
  const root = normalizeHomeAssistantUrl(baseUrl);
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('Home Assistant long-lived access token is invalid.');
  async function request(path, options = {}) {
    const response = await fetchImpl(root + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(12000)
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('Home Assistant request failed (' + response.status + ').');
    try { return raw ? JSON.parse(raw) : null; } catch { throw new Error('Home Assistant returned invalid JSON.'); }
  }
  return {
    async test() { await request('/api/'); return { ok: true }; },
    async listEntities() {
      const states = await request('/api/states');
      if (!Array.isArray(states)) throw new Error('Home Assistant returned an invalid entity list.');
      return states.filter(item => item && typeof item.entity_id === 'string' && Object.hasOwn(ALLOWED_SERVICES, item.entity_id.split('.')[0]))
        .slice(0, 300).map(item => ({ entityId: item.entity_id, state: String(item.state || '').slice(0, 80), name: String(item.attributes?.friendly_name || item.entity_id).slice(0, 120), domain: item.entity_id.split('.')[0] }));
    },
    async call(input) {
      const action = validateServiceCall(input);
      return request('/api/services/' + action.domain + '/' + action.service, { method: 'POST', body: JSON.stringify(action.data) });
    }
  };
}

module.exports = { ALLOWED_SERVICES, normalizeHomeAssistantUrl, validateServiceCall, createHomeAssistantClient };
