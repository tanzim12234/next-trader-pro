'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');

test('keeps one unified JARVIS HUD and assistant command surface',()=>{
 assert.match(html,/id="jarvisStage"/);
 assert.match(html,/id="coreCommandPanel"/);
 assert.match(html,/main>\.panel\{display:none!important\}/);
 assert.match(html,/main>#coreCommandPanel\{display:block!important;/);
 assert.doesNotMatch(html,/nextDashboard|legacy-runtime|nd-(?:top|left|center|lower|bottom|core|chat)/);
 assert.doesNotMatch(html,/3,380 Stored|2 Running|4 Connected|SYSTEM STATUS\s+.*OPTIMAL/);
});

test('retains live CPU, RAM, GPU, battery and network telemetry fields',()=>{
 assert.match(html,/id="hudSystem"/);
 assert.match(html,/id="hudGpu"/);
 assert.match(html,/id="hudPower"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
});

const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');

test('clears stale HUD telemetry and network sampling baseline after a polling failure',()=>{
 assert.match(renderer,/catch\(e\)\{\s*networkSnapshot=null;/);
 assert.match(renderer,/formatHudUnavailable\(\)/);
 assert.match(renderer,/hudSystem\)\$\('hudSystem'\)\.textContent=unavailable\.system/);
 assert.match(renderer,/hudGpu\)\$\('hudGpu'\)\.textContent=unavailable\.gpu/);
 assert.match(renderer,/hudPower\)\$\('hudPower'\)\.textContent=unavailable\.power/);
});
