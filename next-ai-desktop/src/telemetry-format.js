(function exposeTelemetryFormat(root){
 'use strict';
 function formatRate(bytesPerSecond){
  const value=Number(bytesPerSecond);
  if(!Number.isFinite(value)||value<0)return 'N/A';
  if(value<1024)return Math.round(value)+' B/s';
  if(value>=1024*1024)return (value/(1024*1024)).toFixed(1)+' MB/s';
  return (value/1024).toFixed(1)+' KB/s';
 }
 const batteryStatusLabels=Object.freeze({
  1:'Other',
  2:'Unknown',
  3:'Fully charged',
  4:'Low',
  5:'Critical',
  6:'Charging',
  7:'Charging (high)',
  8:'Charging (low)',
  9:'Charging (critical)',
  10:'Undefined',
  11:'Partially charged'
 });
 function formatBatteryStatus(status){
  if(status===null||status===undefined||status==='')return 'State unavailable';
  const value=Number(status);
  if(!Number.isFinite(value))return 'State unavailable';
  return batteryStatusLabels[value]||('Unknown status ('+value+')');
 }
 function batteryHudSuffix(status){
  if(status===null||status===undefined||status==='')return '';
  const value=Number(status);
  if(value===3)return ' FULL';
  if(value===4)return ' LOW';
  if(value===5)return ' CRITICAL';
  if([6,7,8,9].includes(value))return ' CHARGING';
  if(value===11)return ' PARTIAL';
  return '';
 }
 function formatHudPower(input={}){
  const rawBattery=input.batteryPercent;
  const batteryAvailable=rawBattery!==null&&rawBattery!==undefined&&rawBattery!==''&&Number.isFinite(Number(rawBattery));
  const percent=batteryAvailable?Math.max(0,Math.min(100,Number(rawBattery))):null;
  const battery=percent===null?'BATTERY N/A':'BAT '+percent+'%'+batteryHudSuffix(input.batteryStatus);
  let network='NET UNAVAILABLE';
  if(input.networkAvailable===true){
   network=input.networkSampling===true?'NET SAMPLING':'NET ↓'+formatRate(input.receivedBytesPerSecond)+' ↑'+formatRate(input.sentBytesPerSecond);
  }
  return battery+' · '+network;
 }
 const api=Object.freeze({formatRate,formatBatteryStatus,formatHudPower});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NextTelemetryFormat=api;
})(typeof window!=='undefined'?window:globalThis);
