export const categories={fuel:'น้ำมัน',parts:'อะไหล่',repair:'ค่าแรงช่างซ่อม',tires:'ค่ายาง',tolls:'ค่าทางด่วน',wages:'ค่าแรงคนขับ',other:'ค่าใช้จ่ายอื่น'};
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
export function validMonth(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);}
export function money(n){return typeof n==='number'&&Number.isFinite(n)&&n>=0&&Math.abs(Math.round(n*100)-n*100)<1e-7;}
export function summarize(jobs,expenses){const billed=jobs.reduce((s,j)=>s+j.amount,0),received=jobs.reduce((s,j)=>s+j.received,0),cost=expenses.reduce((s,e)=>s+e.amount,0);return {billed:round(billed),received:round(received),outstanding:round(billed-received),cost:round(cost),profit:round(billed-cost),cashBalance:round(received-cost),trips:jobs.reduce((s,j)=>s+j.tripCount,0),jobs:jobs.length};}
// Fuel efficiency is the MONTHLY distance recorded on jobs divided by the liters
// recorded on fuel expenses in that same month. It is a planning indicator, not
// a tank-to-tank measurement: purchases and consumption can occur in different months.
export function distanceFuelSummary(jobs,expenses){
 const distanceKm=round(jobs.reduce((sum,j)=>sum+(Number(j.distanceKm)||0),0));
 const fuelLiters=round(expenses.filter(e=>e.category==='fuel').reduce((sum,e)=>sum+(Number(e.fuelLiters)||0),0));
 const fuelCost=round(expenses.filter(e=>e.category==='fuel').reduce((sum,e)=>sum+(Number(e.amount)||0),0));
 const distanceEntries=jobs.filter(j=>j.distanceKm!==null&&j.distanceKm!==undefined).length;
 const fuelExpenses=expenses.filter(e=>e.category==='fuel');
 const fuelEntries=fuelExpenses.filter(e=>e.fuelLiters!==null&&e.fuelLiters!==undefined).length;
 const complete=jobs.length>0&&fuelExpenses.length>0&&distanceEntries===jobs.length&&fuelEntries===fuelExpenses.length;
 return {distanceKm,fuelLiters,fuelCost,distanceEntries,fuelEntries,complete,kmPerLiter:complete&&fuelLiters>0?round(distanceKm/fuelLiters):null,litersPer100Km:complete&&distanceKm>0?round(fuelLiters*100/distanceKm):null,fuelBahtPerKm:complete&&distanceKm>0?round(fuelCost/distanceKm):null};
}
export const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export function eventRows(jobs,expenses){return [...jobs.map(j=>({id:String(j._id),date:j.date,type:'income',description:`ขนส่ง ${j.material} · ${j.customer}`,amount:j.received,vehicle:j.vehicle})),...expenses.map(e=>({id:String(e._id),date:e.date,type:'expense',description:`${categories[e.category]}${e.description?' · '+e.description:''}`,amount:-e.amount,vehicle:e.vehicle}))].filter(x=>x.amount!==0).sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));}
