// Focused unit tests without MongoDB or network. Extract pure functions from server.js.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const code=section('const LEDGER_EXPENSES =','router.get(\'/transport-ledger\'');
const ctx={nowIso:()=> '2026-09-22T00:00:00Z',cleanString:v=>String(v??'').trim(),branchFields:b=>({branch_id:b.id}),today:()=> '2026-09-22'};
vm.createContext(ctx);
vm.runInContext(code+'\nthis.testSummary=ledgerSummary;this.testPayload=ledgerPayload;',ctx);
const v1={_id:'v1',plate_no:'AA-100'},v2={_id:'v2',plate_no:'BB-200'};
const rows=[{vehicle_id:'v1',type:'income',material:'หิน',amount_satang:100000},{vehicle_id:'v1',type:'expense',category:'น้ำมัน',amount_satang:30000},{vehicle_id:'v1',type:'expense',category:'ค่ายาง',amount_satang:10000},{vehicle_id:'v2',type:'expense',category:'อะไหล่',amount_satang:1000}];
const report=ctx.testSummary(rows,[v1,v2]);
assert.equal(report.total.income_satang,100000);
assert.equal(report.total.expense_satang,41000);
assert.equal(report.total.profit_satang,59000);
assert.equal(report.by_vehicle.find(v=>v.vehicle_id==='v1').profit_satang,60000);
assert.equal(report.by_vehicle.find(v=>v.vehicle_id==='v2').profit_satang,-1000);
const valid={date:'2026-09-20',type:'income',category:'ค่าขนส่ง',amount_baht:'123.45',material:'ทราย'};
assert.equal(ctx.testPayload(valid,v1,{id:'branch1'},{id:'owner'}).amount_satang,12345);
assert.throws(()=>ctx.testPayload({...valid,date:'2026-02-30'},v1,{id:'branch1'},{id:'owner'}));
assert.throws(()=>ctx.testPayload({...valid,amount_baht:'-1'},v1,{id:'branch1'},{id:'owner'}));
assert.throws(()=>ctx.testPayload({...valid,amount_baht:'1.999'},v1,{id:'branch1'},{id:'owner'}));
console.log('PASS: ledger totals per vehicle, integer satang, month data validation, invalid amounts');
