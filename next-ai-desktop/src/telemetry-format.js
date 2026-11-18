(function exposeTelemetryFormat(root){
 'use strict';
 function formatRate(bytesPerSecond){
  const value=Number(bytesPerSecond);
  if(!Number.isFinite(value)||value<0)return 'N/A';
  if(value<1024)return Math.round(value)+' B/s';
  if(value>=1024*1024)return (value/(1024*1024)).toFixed(1)+' MB/s';
  return (value/1024).toFixed(1)+' KB/s';
 }
 function formatHudPower(input={}){
  const rawBattery=input.batteryPercent;
  const batteryAvailable=rawBattery!==null&&rawBattery!==undefined&&rawBattery!==''&&Number.isFinite(Number(rawBattery));
  const percent=batteryAvailable?Math.max(0,Math.min(100,Number(rawBattery))):null;
  const status=Number(input.batteryStatus);
  const battery=percent===null?'BATTERY N/A':'BAT '+percent+'%'+(status===3?' FULL':([6,7,8,9].includes(status)?' CHARGING':''));
  let network='NET UNAVAILABLE';
  if(input.networkAvailable===true){
   network=input.networkSampling===true?'NET SAMPLING':'NET ↓'+formatRate(input.receivedBytesPerSecond)+' ↑'+formatRate(input.sentBytesPerSecond);
  }
  return battery+' · '+network;
 }
 const api=Object.freeze({formatRate,formatHudPower});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextTelemetryFormat=api;
})(typeof window!=='undefined'?window:globalThis);
