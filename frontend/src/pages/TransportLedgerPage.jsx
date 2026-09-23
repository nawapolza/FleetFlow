import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Pencil, Plus, RefreshCcw, Trash2, Truck, WalletCards } from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';

const EXPENSES = ['น้ำมัน','อะไหล่','ค่าแรงช่างซ่อม','ค่ายาง','ค่าทางด่วน','ค่าแรงคนขับ','ค่าใช้จ่ายอื่น'];
const format = (v) => (Number(v || 0)/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => {const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const obj=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${obj.year}-${obj.month}-${obj.day}`;};
function initialForm() { return {date:today(),vehicle_id:'',type:'income',category:'ค่าขนส่ง',material:'',quantity:'',amount_baht:'',note:''}; }
function downloadCsv(rows, month) {
  const fields=[['date','วันที่'],['plate_no','ทะเบียนรถ'],['type','ประเภท'],['category','หมวด'],['material','วัสดุที่ขน'],['quantity','ปริมาณ/หน่วย'],['amount_satang','จำนวนเงิน(บาท)'],['note','หมายเหตุ']];
  const escape=(value)=>{const raw=String(value ?? ''); const safe=/^[=+@\-\t\r]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`;};
  const lines=[fields.map(([,name])=>escape(name)).join(',')];
  rows.forEach(row=>lines.push(fields.map(([key])=>escape(key==='amount_satang' ? (Number(row[key] || 0)/100).toFixed(2) : key==='type' ? (row.type==='income'?'รายรับ':'รายจ่าย') : row[key])).join(',')));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`kwanjai-transport-ledger-${month}.csv`;a.click();URL.revokeObjectURL(url);
}
export default function TransportLedgerPage() {
  const { activeBranchId, activeBranch }=useBranch();
  const [month,setMonth]=useState(today().slice(0,7));
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState('');
  const [form,setForm]=useState(initialForm);
  const [selectedVehicle,setSelectedVehicle]=useState('all');
  const load=useCallback(async()=>{
    if(!activeBranchId)return;
    setLoading(true);
    try {const response=await api.transportLedger(month);setData(response);}catch(err){alertError(err,'โหลดบัญชีงานขนส่งไม่สำเร็จ');}finally{setLoading(false);}
  },[activeBranchId,month]);
  useEffect(()=>{load();},[load]);
  const vehicles=data?.vehicles || [];
  const allRows=data?.rows || [];
  const rows=useMemo(()=>selectedVehicle==='all'?allRows:allRows.filter(r=>r.vehicle_id===selectedVehicle),[allRows,selectedVehicle]);
  const summary=useMemo(()=>{
    if(selectedVehicle==='all')return data?.total || {income_satang:0,expense_satang:0,profit_satang:0};
    return (data?.by_vehicle || []).find(v=>v.vehicle_id===selectedVehicle) || {income_satang:0,expense_satang:0,profit_satang:0};
  },[data,selectedVehicle]);
  const totals=useMemo(()=>{
    const by={};for(const r of rows){if(r.type==='expense')by[r.category]=(by[r.category] || 0)+Number(r.amount_satang || 0);}
    return by;
  },[rows]);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const newEntry=()=>{setEditing('');setForm({...initialForm(),date:month===today().slice(0,7)?today():`${month}-01`,vehicle_id:selectedVehicle==='all'?'':selectedVehicle});};
  const edit=(entry)=>{setEditing(entry.id);setForm({date:entry.date,vehicle_id:entry.vehicle_id,type:entry.type,category:entry.category,material:entry.material || '',quantity:entry.quantity || '',amount_baht:(Number(entry.amount_satang || 0)/100).toFixed(2),note:entry.note || ''});document.getElementById('ledger-editor')?.scrollIntoView({behavior:'smooth'});};
  const save=async(event)=>{
    event.preventDefault();setSaving(true);
    try{
      if(editing)await api.updateTransportLedger(editing,form);else await api.createTransportLedger(form);
      toastSuccess(editing?'แก้ไขรายการแล้ว':'บันทึกรายการแล้ว');newEntry();await load();
    }catch(err){alertError(err,'บันทึกรายการไม่สำเร็จ');}finally{setSaving(false);}
  };
  const remove=async(row)=>{if(!await confirmAction('ลบรายการนี้?',`${row.date} · ${row.plate_no} · ${format(row.amount_satang)} บาท`))return;try{await api.deleteTransportLedger(row.id);toastSuccess('ลบรายการแล้ว');if(editing===row.id)newEntry();await load();}catch(err){alertError(err,'ลบรายการไม่สำเร็จ');}};
  return <div className="page-shell ledger-page">
    <header className="ledger-hero">
      <div className="ledger-hero-copy"><span className="ledger-eyebrow"><WalletCards size={15}/> ขวัญใจดาวทองขนส่ง · TRANSPORT FINANCE</span><h1>บัญชีงานขนส่ง</h1><p>บันทึกรายรับ–รายจ่ายตามทะเบียนรถและวัสดุที่ขน ตรวจสอบยอดคงเหลือ กำไร/ขาดทุนรายเดือนในที่เดียว</p></div>
      <div className="ledger-hero-art"><img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="kw-logo-ledger"/></div>
    </header>
    <div className="ledger-filters card-clean"><label><span><CalendarDays size={16}/> เดือนที่ต้องการสรุป</span><input className="input" type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label><label><span><Truck size={16}/> ทะเบียนรถ</span><select className="input" value={selectedVehicle} onChange={e=>setSelectedVehicle(e.target.value)}><option value="all">ทุกคันในสาขา</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label><div className="ledger-actions"><button className="btn-soft" onClick={load} disabled={loading}><RefreshCcw size={16}/>{loading?'กำลังโหลด':'รีเฟรช'}</button><button className="btn-soft" onClick={()=>downloadCsv(rows,month)} disabled={!rows.length}><Download size={16}/> CSV</button><button className="btn-primary" onClick={()=>document.getElementById('ledger-editor')?.scrollIntoView({behavior:'smooth'})}><Plus size={16}/> เพิ่มรายการ</button></div></div>
    <p className="ledger-scope">สาขา: {activeBranch?.name || '-'} · ข้อมูลเฉพาะเดือนที่เลือก · ยอดรายรับและรายจ่ายกรอกด้วยตนเอง ไม่รวมค่าเติมน้ำมันจากเมนูอื่นโดยอัตโนมัติ เพื่อป้องกันการนับซ้ำ</p>
    <div className="ledger-kpis"><Metric label="รายรับรวม" amount={summary.income_satang} color="mint"/><Metric label="รายจ่ายรวม" amount={summary.expense_satang} color="rose"/><Metric label="คงเหลือ / กำไร(ขาดทุน)" amount={summary.profit_satang} color={summary.profit_satang<0?'rose':'violet'} signed/></div>
    <div className="ledger-grid">
      <section className="card-clean ledger-panel" id="ledger-editor"><div className="ledger-heading"><span className="ledger-heading-icon"><Plus size={19}/></span><div><h2>{editing?'แก้ไขรายการ':'บันทึกรายการใหม่'}</h2><p>แยกวันที่ ทะเบียน วัสดุที่ขน และหมวดค่าใช้จ่าย</p></div></div>
        <form onSubmit={save} className="ledger-form"><label>วันที่<input className="input" type="date" value={form.date} onChange={e=>set('date',e.target.value)} required/></label><label>ทะเบียนรถ<select className="input" value={form.vehicle_id} onChange={e=>set('vehicle_id',e.target.value)} required><option value="">เลือกทะเบียนรถ</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label><label>ประเภทรายการ<select className="input" value={form.type} onChange={e=>setForm(old=>({...old,type:e.target.value,category:e.target.value==='income'?'ค่าขนส่ง':'น้ำมัน'}))}><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></label><label>หมวดรายการ<select className="input" value={form.category} onChange={e=>set('category',e.target.value)}>{(form.type==='income'?['ค่าขนส่ง']:EXPENSES).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          {form.type==='income'&&<><label>วัสดุที่ขน<input className="input" value={form.material} onChange={e=>set('material',e.target.value)} placeholder="เช่น หิน ทราย ดิน ปูน" maxLength={120} required/></label><label>ปริมาณ / หน่วย (ไม่บังคับ)<input className="input" value={form.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="เช่น 30.045 ตัน หรือ 1 เที่ยว" maxLength={60}/></label></>}
          <label>จำนวนเงิน (บาท)<input className="input" type="number" min="0.01" step="0.01" max="99999999999.99" value={form.amount_baht} onChange={e=>set('amount_baht',e.target.value)} placeholder="0.00" required/></label><label className="ledger-wide">หมายเหตุ / เลขที่เอกสาร<input className="input" value={form.note} onChange={e=>set('note',e.target.value)} placeholder="รายละเอียดประกอบ" maxLength={500}/></label><div className="ledger-form-buttons ledger-wide"><button className="btn-primary" type="submit" disabled={saving || !vehicles.length}>{saving?'กำลังบันทึก...':editing?'บันทึกการแก้ไข':'บันทึกรายการ'}</button>{editing&&<button className="btn-soft" type="button" onClick={newEntry}>ยกเลิกแก้ไข</button>}</div></form>
        {!vehicles.length&&<p className="ledger-note">ยังไม่มีทะเบียนรถในสาขานี้ กรุณาเพิ่มที่เมนู “รถและคนขับ” ก่อนบันทึกบัญชี</p>}
      </section>
      <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><WalletCards size={19}/></span><div><h2>รายจ่ายแยกหมวด</h2><p>สรุปจากรายการรายจ่ายที่บันทึกในเดือนนี้</p></div></div><div className="ledger-categories">{EXPENSES.map(cat=><div key={cat}><span>{cat}</span><strong>{format(totals[cat])} ฿</strong></div>)}</div></section>
    </div>
    <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><Truck size={19}/></span><div><h2>สรุปกำไร/ขาดทุนต่อคัน</h2><p>ประจำเดือน {month} · รายรับ − รายจ่าย = คงเหลือ</p></div></div><div className="ledger-table-scroll"><table className="ledger-table"><thead><tr><th>ทะเบียนรถ</th><th>รายรับ</th><th>รายจ่าย</th><th>คงเหลือ / กำไร(ขาดทุน)</th><th>รายการ</th></tr></thead><tbody>{(data?.by_vehicle || []).filter(v=>selectedVehicle==='all'||v.vehicle_id===selectedVehicle).map(v=><tr key={v.vehicle_id}><td><strong>{v.plate_no}</strong></td><td>{format(v.income_satang)} ฿</td><td>{format(v.expense_satang)} ฿</td><td className={v.profit_satang<0?'ledger-negative':'ledger-positive'}>{format(v.profit_satang)} ฿</td><td>{v.entries}</td></tr>)}</tbody></table></div></section>
    <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><CalendarDays size={19}/></span><div><h2>รายการรับ–จ่ายย้อนหลัง</h2><p>{rows.length} รายการ · คลิกแก้ไขหรือลบข้อมูลได้</p></div></div><div className="ledger-table-scroll"><table className="ledger-table"><thead><tr><th>วันที่</th><th>ทะเบียนรถ</th><th>ประเภท / หมวด</th><th>วัสดุที่ขน / จำนวน</th><th>จำนวนเงิน</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.date}</td><td><strong>{r.plate_no}</strong></td><td><span className={`ledger-pill ${r.type}`}>{r.type==='income'?'รายรับ':'รายจ่าย'}</span><div className="ledger-cell-sub">{r.category}</div></td><td>{r.material||'-'}<div className="ledger-cell-sub">{r.quantity||''}</div></td><td className={r.type==='income'?'ledger-positive':'ledger-negative'}>{r.type==='income'?'+':'−'}{format(r.amount_satang)} ฿</td><td>{r.note||'-'}</td><td><div className="ledger-row-actions"><button type="button" title="แก้ไข" onClick={()=>edit(r)}><Pencil size={15}/></button><button type="button" title="ลบ" onClick={()=>remove(r)}><Trash2 size={15}/></button></div></td></tr>)}{!rows.length&&<tr><td colSpan={7} className="ledger-empty">{loading?'กำลังโหลด...':'ยังไม่มีรายการในเดือนที่เลือก'}</td></tr>}</tbody></table></div></section>
  </div>;
}
function Metric({label,amount,color,signed=false}){return <div className={`ledger-kpi ${color}`}><span>{label}</span><strong>{signed&&amount>0?'+':''}{format(amount)} <small>บาท</small></strong></div>;}
