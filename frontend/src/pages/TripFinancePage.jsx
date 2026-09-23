import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, Pencil, Plus, ReceiptText, Save, Search, Trash2, Truck, Wallet, X } from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import CompactPager, { useCompactList } from '../components/CompactPager.jsx';
import './driverIncome.css';

const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const cash = n => (Number(n || 0) / 100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const newTrip = () => ({date:today(),vehicle_id:'',driver_name:'',material:'',quantity:'',origin_place:'',destination_place:'',reference:'',income_baht:'',note:''});
const newAdvance = () => ({date:today(),vehicle_id:'',driver_name:'',amount_baht:'',note:''});
const toBaht = v => (Number(v||0)/100).toFixed(2);
function Cell({label,children,wide=false}) {return <label className={`di-field ${wide?'di-wide':''}`}><span>{label}</span>{children}</label>;}
function Value({label,value}) {return <div className="di-total"><span>{label}</span><strong>{cash(value)} บาท</strong></div>;}
function OptionVehicles({vehicles}) {return <><option value="">เลือกทะเบียนรถ</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}{v.driver_name?` · ${v.driver_name}`:''}</option>)}</>;}
function RowButtons({onEdit,onRemove}) {return <div className="di-actions"><button type="button" onClick={onEdit} aria-label="แก้ไข"><Pencil size={16}/> แก้ไข</button><button type="button" onClick={onRemove} aria-label="ลบ"><Trash2 size={16}/> ลบ</button></div>;}

export default function TripFinancePage(){
  const {activeBranchId}=useBranch();
  const [mode,setMode]=useState('month');
  const [period,setPeriod]=useState(today().slice(0,7));
  const [vehicleFilter,setVehicleFilter]=useState('all');
  const [driverFilter,setDriverFilter]=useState('all');
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [panel,setPanel]=useState('trip');
  const [trip,setTrip]=useState(newTrip);
  const [advance,setAdvance]=useState(newAdvance);
  const [materialName,setMaterialName]=useState('');
  const [materialEdit,setMaterialEdit]=useState(null);
  const [editing,setEditing]=useState(null);
  const [preview,setPreview]=useState(null);
  const seq=useRef(0),editor=useRef(null),submitBusy=useRef(false);
  const load=useCallback(async()=>{
    if(!activeBranchId)return;
    const turn=++seq.current;setBusy(true);
    try {const result=await api.driverFinance(period);if(turn===seq.current)setData(result);}
    catch(err){if(turn===seq.current)alertError(err,'โหลดบัญชีคนขับไม่สำเร็จ');}
    finally{if(turn===seq.current)setBusy(false);}
  },[activeBranchId,period]);
  useEffect(()=>{load();return()=>{seq.current++;};},[load]);
  const vehicles=data?.vehicles||[];
  const allTrips=data?.trips||[];
  const allAdvances=data?.advances||[];
  const names=useMemo(()=>[...new Set([...allTrips,...allAdvances].map(r=>r.driver_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),[allTrips,allAdvances]);
  const matches=r=>(vehicleFilter==='all'||r.vehicle_id===vehicleFilter)&&(driverFilter==='all'||r.driver_name===driverFilter);
  const rows=allTrips.filter(matches),withdrawals=allAdvances.filter(matches);
  const totals=useMemo(()=>{
    const income=rows.reduce((sum,r)=>sum+Number(r.income_satang||0),0);
    const paid=withdrawals.reduce((sum,r)=>sum+Number(r.amount_satang||0),0);
    return {income,paid,balance:income-paid};
  },[rows,withdrawals]);
  const grouped=useMemo(()=>{
    const out=new Map();
    for(const r of [...rows,...withdrawals]){
      const key=`${r.vehicle_id}\u0000${r.driver_name?.trim().toLocaleLowerCase('th')}`;
      if(!out.has(key))out.set(key,{key,plate_no:r.plate_no,driver_name:r.driver_name,trips:0,income:0,paid:0});
      const target=out.get(key);
      if('income_satang' in r){target.trips++;target.income+=Number(r.income_satang||0);}
      else target.paid+=Number(r.amount_satang||0);
    }
    return [...out.values()].sort((a,b)=>a.plate_no.localeCompare(b.plate_no,'th')||a.driver_name.localeCompare(b.driver_name,'th'));
  },[rows,withdrawals]);
  const pager=useCompactList(rows,r=>[r.date,r.plate_no,r.driver_name,r.material,r.reference,r.origin_place,r.destination_place]);
  const advancePager=useCompactList(withdrawals,r=>[r.date,r.plate_no,r.driver_name,r.note]);
  const materialPager=useCompactList(data?.materials||[],r=>[r.name]);
  const selectVehicle=(target,id,setter)=>{
    const v=vehicles.find(item=>item.id===id);
    setter(old=>({...old,vehicle_id:id,driver_name:v?.driver_name||old.driver_name||''}));
  };
  function start(type,row){
    setPanel(type);setEditing(row?{type,id:row.id}:null);
    if(type==='trip')setTrip(row?{date:row.date,vehicle_id:row.vehicle_id,driver_name:row.driver_name,material:row.material,quantity:row.quantity||'',origin_place:row.origin_place||'',destination_place:row.destination_place||'',reference:row.reference||'',income_baht:toBaht(row.income_satang),note:row.note||''}:newTrip());
    if(type==='advance')setAdvance(row?{date:row.date,vehicle_id:row.vehicle_id,driver_name:row.driver_name,amount_baht:toBaht(row.amount_satang),note:row.note||''}:newAdvance());
    if(type==='material'){setMaterialName(row?.name||'');setMaterialEdit(row||null);}
    editor.current?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function save(e){e.preventDefault();if(submitBusy.current)return;submitBusy.current=true;setSaving(true);
    try{
      if(panel==='trip')editing?.type==='trip'?await api.updateDriverTrip(editing.id,trip):await api.createDriverTrip(trip);
      else if(panel==='advance')editing?.type==='advance'?await api.updateDriverAdvance(editing.id,advance):await api.createDriverAdvance(advance);
      else materialEdit?await api.updateTransportMaterial(materialEdit.id,{name:materialName}):await api.createTransportMaterial({name:materialName});
      toastSuccess('บันทึกข้อมูลแล้ว');setEditing(null);setMaterialEdit(null);setMaterialName('');setTrip(newTrip());setAdvance(newAdvance());await load();
    }catch(err){alertError(err,'บันทึกไม่สำเร็จ');}finally{submitBusy.current=false;setSaving(false);}
  }
  async function remove(type,row){
    if(!await confirmAction('ยืนยันการลบรายการ?',type==='material'?row.name:`${row.date} · ${row.plate_no} · ${row.driver_name}`))return;
    try{
      if(type==='trip')await api.deleteDriverTrip(row.id);
      else if(type==='advance')await api.deleteDriverAdvance(row.id);
      else await api.deleteTransportMaterial(row.id);
      toastSuccess('ลบรายการแล้ว');await load();
    }catch(err){alertError(err,'ลบรายการไม่สำเร็จ');}
  }
  const materials=[...new Set(['ทราย','หิน','ดิน','หินคลุก','ทรายถม',...(data?.materials||[]).map(m=>m.name)])];
  return <div className="di-page">
    <header className="di-hero"><div><span><Truck size={16}/> ขวัญใจดาวทองขนส่ง</span><h1>รายได้คนขับ</h1><p>บันทึกรายได้ต่อเที่ยว · เบิกเงินล่วงหน้า · สรุปยอดสิ้นเดือน</p></div><img src="/kwanjai-logo.png" alt="โลโก้ขวัญใจดาวทองขนส่ง"/></header>
    <section className="di-panel di-filter">
      <div className="di-tabs"><button className={mode==='month'?'active':''} onClick={()=>{setMode('month');setPeriod(today().slice(0,7));}}>รายเดือน</button><button className={mode==='year'?'active':''} onClick={()=>{setMode('year');setPeriod(today().slice(0,4));}}>รายปี</button></div>
      <Cell label={mode==='month'?'เดือน':'ปี'}><input className="input" type={mode==='month'?'month':'number'} min={mode==='year'?'2000':undefined} max={mode==='year'?'2100':undefined} value={period} onChange={e=>setPeriod(e.target.value)}/></Cell>
      <Cell label="ทะเบียน"><select className="input" value={vehicleFilter} onChange={e=>setVehicleFilter(e.target.value)}><option value="all">ทุกทะเบียน</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></Cell>
      <Cell label="คนขับ"><select className="input" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}><option value="all">ทุกคน</option>{names.map(n=><option key={n} value={n}>{n}</option>)}</select></Cell>
    </section>
    <section className="di-totals"><Value label="รายได้คนขับรวม" value={totals.income}/><Value label="เบิกล่วงหน้า" value={totals.paid}/><Value label="คงรับสิ้นงวด" value={totals.balance}/></section>
    <section className="di-panel"><h2>สรุปแยกคนขับและทะเบียน</h2><div className="di-table"><table><thead><tr><th>ทะเบียน</th><th>คนขับ</th><th>เที่ยว</th><th>รายได้</th><th>เบิก</th><th>คงรับ</th></tr></thead><tbody>{grouped.map(r=><tr key={r.key}><td>{r.plate_no}</td><td>{r.driver_name}</td><td>{r.trips}</td><td>{cash(r.income)} ฿</td><td>{cash(r.paid)} ฿</td><td><strong>{cash(r.income-r.paid)} ฿</strong></td></tr>)}{!grouped.length&&<tr><td colSpan={6}>ไม่มีข้อมูลในช่วงเวลาที่เลือก</td></tr>}</tbody></table></div><p className="di-hint">ยอดคงรับ = รายได้คนขับ − เงินเบิกล่วงหน้า (ไม่ใช่กำไรของบริษัท) · เงินเบิกมากกว่ารายได้จะแสดงยอดติดลบ</p></section>
    {mode==='year'&&<section className="di-panel"><h2>สรุปรายเดือนในปี {period}</h2><div className="di-table"><table><thead><tr><th>เดือน</th><th>รายได้</th><th>เบิก</th><th>คงรับ</th></tr></thead><tbody>{[...new Set([...rows,...withdrawals].map(r=>r.date.slice(0,7)))].sort().reverse().map(month=>{const income=rows.filter(r=>r.date.startsWith(month)).reduce((s,r)=>s+Number(r.income_satang||0),0);const paid=withdrawals.filter(r=>r.date.startsWith(month)).reduce((s,r)=>s+Number(r.amount_satang||0),0);return <tr key={month}><td>{month}</td><td>{cash(income)} ฿</td><td>{cash(paid)} ฿</td><td>{cash(income-paid)} ฿</td></tr>;})}</tbody></table></div></section>}
    <section className="di-panel di-editor" ref={editor}>
      <div className="di-tabs di-edit-tabs"><button type="button" className={panel==='trip'?'active':''} onClick={()=>start('trip')}><Plus size={16}/> รายได้ต่อเที่ยว</button><button type="button" className={panel==='advance'?'active':''} onClick={()=>start('advance')}><Wallet size={16}/> เบิกเงิน</button><button type="button" className={panel==='material'?'active':''} onClick={()=>start('material')}><ClipboardList size={16}/> จัดการวัสดุ</button></div>
      <h2>{panel==='trip'?(editing?'แก้ไขรายได้ต่อเที่ยว':'เพิ่มรายได้คนขับต่อเที่ยว'):panel==='advance'?(editing?'แก้ไขรายการเบิก':'บันทึกเบิกเงินล่วงหน้า'):(materialEdit?'แก้ไขชื่อวัสดุ':'เพิ่มวัสดุที่ขน')}</h2>
      <form onSubmit={save} className="di-form">
        {panel==='material'?<Cell label="ชื่อวัสดุ *" wide><input className="input" value={materialName} maxLength={120} required onChange={e=>setMaterialName(e.target.value)} placeholder="เช่น ทราย / หิน / ดิน"/></Cell>:<>
          <Cell label="วันที่ *"><input className="input" type="date" required value={panel==='trip'?trip.date:advance.date} onChange={e=>panel==='trip'?setTrip(v=>({...v,date:e.target.value})):setAdvance(v=>({...v,date:e.target.value}))}/></Cell>
          <Cell label="ทะเบียนรถ *"><select className="input" required value={panel==='trip'?trip.vehicle_id:advance.vehicle_id} onChange={e=>panel==='trip'?selectVehicle(trip,e.target.value,setTrip):selectVehicle(advance,e.target.value,setAdvance)}><OptionVehicles vehicles={vehicles}/></select></Cell>
          <Cell label="คนขับ *" wide><input className="input" required maxLength={120} value={panel==='trip'?trip.driver_name:advance.driver_name} onChange={e=>panel==='trip'?setTrip(v=>({...v,driver_name:e.target.value})):setAdvance(v=>({...v,driver_name:e.target.value}))} placeholder="ชื่อคนขับ"/></Cell>
          {panel==='trip'?<>
            <Cell label="วัสดุที่ขน *"><input className="input" list="di-materials" required maxLength={120} value={trip.material} onChange={e=>setTrip(v=>({...v,material:e.target.value}))} placeholder="เลือกวัสดุ"/><datalist id="di-materials">{materials.map(m=><option key={m} value={m}/>)}</datalist></Cell>
            <Cell label="จำนวน / น้ำหนัก"><input className="input" value={trip.quantity} maxLength={80} onChange={e=>setTrip(v=>({...v,quantity:e.target.value}))} placeholder="เช่น 30 ตัน"/></Cell>
            <Cell label="จุดรับสินค้า"><input className="input" value={trip.origin_place} maxLength={200} onChange={e=>setTrip(v=>({...v,origin_place:e.target.value}))}/></Cell>
            <Cell label="จุดส่งสินค้า"><input className="input" value={trip.destination_place} maxLength={200} onChange={e=>setTrip(v=>({...v,destination_place:e.target.value}))}/></Cell>
            <Cell label="เลขที่ใบงาน"><input className="input" value={trip.reference} maxLength={90} onChange={e=>setTrip(v=>({...v,reference:e.target.value}))}/></Cell>
            <Cell label="รายได้คนขับเที่ยวนี้ (บาท) *"><input className="input" inputMode="decimal" type="number" required min="0" max="9999999999.99" step="0.01" value={trip.income_baht} onChange={e=>setTrip(v=>({...v,income_baht:e.target.value}))} placeholder="0.00"/></Cell>
            <Cell label="หมายเหตุ" wide><textarea className="input" rows={2} maxLength={500} value={trip.note} onChange={e=>setTrip(v=>({...v,note:e.target.value}))}/></Cell>
          </>:<>
            <Cell label="จำนวนเงินเบิก (บาท) *" wide><input className="input" inputMode="decimal" type="number" required min="0" max="9999999999.99" step="0.01" value={advance.amount_baht} onChange={e=>setAdvance(v=>({...v,amount_baht:e.target.value}))} placeholder="0.00"/></Cell>
            <Cell label="หมายเหตุการเบิก" wide><textarea className="input" rows={2} maxLength={500} value={advance.note} onChange={e=>setAdvance(v=>({...v,note:e.target.value}))}/></Cell>
          </>}
        </>}
        <div className="di-submit di-wide"><button type="submit" disabled={saving||(panel!=='material'&&!vehicles.length)}><Save size={17}/>{saving?'กำลังบันทึก...':editing||materialEdit?'บันทึกการแก้ไข':'บันทึกข้อมูล'}</button>{(editing||materialEdit)&&<button type="button" className="di-secondary" onClick={()=>start(panel)}><X size={16}/> ยกเลิก</button>}</div>
      </form>
    </section>
    <section className="di-panel"><h2>รายการรายได้ต่อเที่ยว</h2><CompactPager state={pager} label="ค้นหาวันที่ ทะเบียน คนขับ วัสดุ หรือเลขที่ใบงาน"/><div className="di-list">{pager.visible.map(r=><article key={r.id} className="di-entry"><div><small>{r.date} · {r.plate_no}</small><strong>{r.driver_name} · {r.material}</strong><span>{r.origin_place||'-'} → {r.destination_place||'-'} · {r.quantity||'-'}</span></div><div className="di-entry-side"><strong>{cash(r.income_satang)} ฿</strong><button type="button" onClick={()=>setPreview({kind:'trip',row:r})}>ดูรายละเอียด</button><RowButtons onEdit={()=>start('trip',r)} onRemove={()=>remove('trip',r)}/></div></article>)}{!pager.visible.length&&<p className="di-hint">{busy?'กำลังโหลด...':'ไม่พบรายการ'}</p>}</div></section>
    <section className="di-panel"><h2>รายการเบิกเงินล่วงหน้า</h2><CompactPager state={advancePager} label="ค้นหาวันที่ ทะเบียน คนขับ หรือหมายเหตุ"/><div className="di-list">{advancePager.visible.map(r=><article key={r.id} className="di-entry"><div><small>{r.date} · {r.plate_no}</small><strong>{r.driver_name}</strong><span>{r.note||'เบิกเงินล่วงหน้า'}</span></div><div className="di-entry-side"><strong>{cash(r.amount_satang)} ฿</strong><button type="button" onClick={()=>setPreview({kind:'advance',row:r})}>ดูรายละเอียด</button><RowButtons onEdit={()=>start('advance',r)} onRemove={()=>remove('advance',r)}/></div></article>)}{!advancePager.visible.length&&<p className="di-hint">ไม่มีรายการเบิกในช่วงเวลาที่เลือก</p>}</div></section>
    <section className="di-panel"><h2>วัสดุที่ Admin เพิ่มไว้</h2><CompactPager state={materialPager} label="ค้นหาชื่อวัสดุ"/><div className="di-list">{materialPager.visible.map(r=><article key={r.id} className="di-entry"><strong>{r.name}</strong><RowButtons onEdit={()=>start('material',r)} onRemove={()=>remove('material',r)}/></article>)}{!materialPager.visible.length&&<p className="di-hint">เพิ่มวัสดุใหม่ได้จากแบบฟอร์มด้านบน</p>}</div></section>
    {preview&&<div className="di-modal-bg" role="presentation" onClick={()=>setPreview(null)}><section className="di-modal" role="dialog" aria-modal="true" aria-label="รายละเอียดรายการ" onClick={e=>e.stopPropagation()}><button type="button" className="di-modal-close" onClick={()=>setPreview(null)}><X size={18}/> ปิด</button><h2>{preview.kind==='trip'?'รายละเอียดรายได้คนขับ':'รายละเอียดเบิกเงิน'}</h2><p>วันที่ {preview.row.date} · ทะเบียน {preview.row.plate_no}</p><p>คนขับ: {preview.row.driver_name}</p>{preview.kind==='trip'&&<><p>วัสดุ: {preview.row.material} · {preview.row.quantity||'-'}</p><p>เส้นทาง: {preview.row.origin_place||'-'} → {preview.row.destination_place||'-'}</p><p>เลขที่ใบงาน: {preview.row.reference||'-'}</p></>}<p>หมายเหตุ: {preview.row.note||'-'}</p><h2>{cash(preview.kind==='trip'?preview.row.income_satang:preview.row.amount_satang)} บาท</h2></section></div>}
  </div>;
}
