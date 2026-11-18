'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const telemetry=require('../src/telemetry-format.js');

test('formats network throughput using B/s, KB/s and MB/s units',()=>{
 assert.equal(telemetry.formatRate(512),'512 B/s');
 assert.equal(telemetry.formatRate(1024),'1.0 KB/s');
 assert.equal(telemetry.formatRate(1048576),'1.0 MB/s');
});

test('rejects invalid network rate values',()=>{
 assert.equal(telemetry.formatRate(-1),'N/A');
 assert.equal(telemetry.formatRate(Number.NaN),'N/A');
});

test('shows unavailable metrics honestly when battery or network data is missing',()=>{
 assert.equal(telemetry.formatHudPower({networkAvailable:false}),'BATTERY N/A · NET UNAVAILABLE');
});

test('shows sampling state until a network delta is available',()=>{
 assert.equal(telemetry.formatHudPower({batteryPercent:86,networkAvailable:true,networkSampling:true}),'BAT 86% · NET SAMPLING');
});

test('shows battery full state',()=>{
 assert.equal(telemetry.formatHudPower({batteryPercent:100,batteryStatus:3,networkAvailable:false}),'BAT 100% FULL · NET UNAVAILABLE');
});

test('shows live receive and send rates plus battery charge state',()=>{
 assert.equal(telemetry.formatHudPower({batteryPercent:75,batteryStatus:6,networkAvailable:true,networkSampling:false,receivedBytesPerSecond:1048576,sentBytesPerSecond:512}),'BAT 75% CHARGING · NET ↓1.0 MB/s ↑512 B/s');
});

test('clamps battery percentage to the valid range',()=>{
 assert.equal(telemetry.formatHudPower({batteryPercent:140,networkAvailable:false}),'BAT 100% · NET UNAVAILABLE');
 assert.equal(telemetry.formatHudPower({batteryPercent:-4,networkAvailable:false}),'BAT 0% · NET UNAVAILABLE');
});
