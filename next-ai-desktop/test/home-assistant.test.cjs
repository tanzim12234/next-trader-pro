'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHomeAssistantUrl, validateServiceCall, createHomeAssistantClient } = require('../src/home-assistant.cjs');

test('accepts private LAN Home Assistant over HTTP and public hosts only over HTTPS', () => {
  assert.equal(normalizeHomeAssistantUrl('http://192.168.1.20:8123/'), 'http://192.168.1.20:8123');
  assert.throws(() => normalizeHomeAssistantUrl('http://example.com'), /HTTPS/);
  assert.match(normalizeHomeAssistantUrl('https://ha.example.com/'), /^https:/);
});
test('allows only allowlisted device domains, services and bounded values', () => {
  assert.equal(validateServiceCall({domain:'light',service:'turn_on',entityId:'light.living_room'}).data.entity_id, 'light.living_room');
  assert.equal(validateServiceCall({domain:'climate',service:'set_temperature',entityId:'climate.room',temperature:22}).data.temperature, 22);
  assert.throws(() => validateServiceCall({domain:'light',service:'delete',entityId:'light.room'}));
  assert.throws(() => validateServiceCall({domain:'climate',service:'set_temperature',entityId:'climate.room',temperature:80}));
  assert.throws(() => validateServiceCall({domain:'lock',service:'unlock',entityId:'switch.front_door'}));
});
test('uses bearer auth and returns only supported entities', async () => {
  const calls=[];
  const client=createHomeAssistantClient({baseUrl:'http://homeassistant.local:8123',token:'x'.repeat(30),fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify([{entity_id:'light.desk',state:'on',attributes:{friendly_name:'Desk'}},{entity_id:'sensor.temp',state:'21'}])};}});
  const entities=await client.listEntities();
  assert.equal(entities.length,2);
  assert.equal(entities[0].name,'Desk');
  assert.equal(entities[1].domain,'sensor');
  assert.match(calls[0].options.headers.Authorization,/^Bearer /);
});
