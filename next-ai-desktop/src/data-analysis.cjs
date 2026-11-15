'use strict';

function parseCsv(input) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){if(ch==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"'&&cell==='')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(quoted)throw new Error('CSV contains an unclosed quoted field.');
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map((v,i)=>v.trim()||'column_'+(i+1));
  return rows.filter(r=>r.some(v=>v!=='' )).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

function summarizeRecords(records) {
  if(!Array.isArray(records)||!records.length)throw new Error('No data rows found.');
  if(records.length>10000)throw new Error('Analysis is limited to 10,000 rows.');
  const columns=[...new Set(records.flatMap(row=>Object.keys(row||{})))].slice(0,100);
  const summaries=columns.map(name=>{
    const values=records.map(row=>row?.[name]);
    const present=values.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
    const numeric=present.map(v=>typeof v==='number'?v:(typeof v==='string'&&v.trim()!==''?Number(v):NaN)).filter(Number.isFinite);
    const isNumeric=present.length>0&&numeric.length===present.length;
    const result={name,missing:values.length-present.length,kind:isNumeric?'numeric':'categorical'};
    if(isNumeric){
      const sorted=[...numeric].sort((a,b)=>a-b);
      result.min=sorted[0];result.max=sorted[sorted.length-1];
      result.mean=numeric.reduce((a,b)=>a+b,0)/numeric.length;
      result.median=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
    }else{
      const counts=new Map();for(const v of present){const key=String(v).slice(0,120);counts.set(key,(counts.get(key)||0)+1);}
      result.unique=counts.size;result.topValues=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([value,count])=>({value,count}));
    }
    return result;
  });
  return {rows:records.length,columns:columns.length,duplicateRows:records.length-new Set(records.map(r=>JSON.stringify(r))).size,columnsSummary:summaries};
}

function analyzeData(input, format='auto') {
  if(typeof input!=='string'||!input.trim()||input.length>1024*1024)throw new Error('Provide a data file under 1 MB.');
  let records,kind=format;
  if(format==='json'||(format==='auto'&&/^[\s]*[\[{]/.test(input))){
    const parsed=JSON.parse(input);
    if(Array.isArray(parsed))records=parsed;
    else if(parsed&&Array.isArray(parsed.data))records=parsed.data;
    else throw new Error('JSON must contain an array of records (or a data array).');
    kind='json';
  }else{
    records=parseCsv(input);kind='csv';
  }
  if(records.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('Each data row must be an object.');
  return {format:kind,...summarizeRecords(records)};
}

module.exports={parseCsv,summarizeRecords,analyzeData};
