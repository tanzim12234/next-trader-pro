'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCsv,analyzeData}=require('../src/data-analysis.cjs');

test('parses quoted CSV cells and commas',()=>{
 const rows=parseCsv('name,value,note\nAlice,10,"hello, world"\nBob,20,ok');
 assert.equal(rows[0].note,'hello, world');
 assert.equal(rows.length,2);
});
test('summarizes numeric, categorical, missing and duplicate values',()=>{
 const report=analyzeData('name,score\nA,10\nB,20\nA,');
 assert.equal(report.rows,3);
 assert.equal(report.columns,2);
 assert.equal(report.duplicateRows,0);
 assert.equal(report.columnsSummary[1].mean,15);
 assert.equal(report.columnsSummary[1].missing,1);
});
test('analyzes JSON record arrays and rejects oversized or malformed input',()=>{
 const report=analyzeData('[{"x":1},{"x":3}]');
 assert.equal(report.format,'json');
 assert.equal(report.columnsSummary[0].median,2);
 assert.throws(()=>analyzeData(''));
 assert.throws(()=>analyzeData('x'.repeat(1024*1024+1)));
 assert.throws(()=>analyzeData('{"wrong":true}'));
});
