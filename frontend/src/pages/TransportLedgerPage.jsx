import { useCallback, useEffect, useMemo, useState } from 'react';
import CompactPager, { useCompactList } from '../components/CompactPager.jsx';
import { CalendarDays, Download, Pencil, Plus, RefreshCcw, Trash2, Truck, WalletCards, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';

const EXPENSES = ['ค่าซ่อมรถ','น้ำมัน','อะไหล่','ค่าแรงช่างซ่อม','ค่ายาง','ค่าทางด่วน','ค่าแรงคนขับ','ค่าใช้จ่ายอื่น'];
const format = (v) => (Number(v || 0)/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => {const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const obj=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${obj.year}-${obj.month}-${obj.day}`;};
function initialForm() { return {date:today(),vehicle_id:'',type:'income',category:'ค่าขนส่ง',material:'',quantity:'',amount_baht:'',note:'',excluded_from_totals:false,matched_delivery_id:'',matched_job_id:''}; }
function downloadCsv(rows, month) {
  const fields=[['date','วันที่'],['plate_no','ทะเบียนรถ'],['type','ประเภท'],['category','หมวด'],['material','วัสดุที่ขน'],['quantity','ปริมาณ/หน่วย'],['amount_satang','จำนวนเงิน(บาท)'],['note','หมายเหตุ'],['excluded_from_totals','ไม่คิดยอดซ้ำ'],['matched_delivery_id','เลขบิลอ้างอิง']];
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
  const pager = useCompactList(rows, row => [row.date, row.plate_no, row.category, row.material, row.quantity, row.note, row.source_delivery_id]);
  const billOptions=useMemo(()=>allRows.filter(r=>r.is_auto && r.date===form.date && r.vehicle_id===form.vehicle_id),[allRows,form.date,form.vehicle_id]);
  const possibleDuplicateIds=new Set((data?.possible_duplicates || []).map(item=>item.manual_id));
  const reviewRows=rows.filter(r=>!r.is_auto && (r.excluded_from_totals || possibleDuplicateIds.has(r.id)));
  const summary=useMemo(()=>{
    if(selectedVehicle==='all')return data?.total || {income_satang:0,expense_satang:0,profit_satang:0};
    return (data?.by_vehicle || []).find(v=>v.vehicle_id===selectedVehicle) || {income_satang:0,expense_satang:0,profit_satang:0};
  },[data,selectedVehicle]);
  const totals=useMemo(()=>{
    const by={};for(const r of rows){if(r.type==='expense' && !r.excluded_from_totals)by[r.category]=(by[r.category] || 0)+Number(r.amount_satang || 0);}
    return by;
  },[rows]);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const newEntry=()=>{setEditing('');setForm({...initialForm(),date:month===today().slice(0,7)?today():`${month}-01`,vehicle_id:selectedVehicle==='all'?'':selectedVehicle});};
  const edit=(entry)=>{setEditing(entry.id);setForm({date:entry.date,vehicle_id:entry.vehicle_id,type:entry.type,category:entry.category,material:entry.material || '',quantity:entry.quantity || '',amount_baht:(Number(entry.amount_satang || 0)/100).toFixed(2),note:entry.note || '',excluded_from_totals:Boolean(entry.excluded_from_totals),matched_delivery_id:entry.matched_delivery_id || '',matched_job_id:entry.matched_job_id || ''});document.getElementById('ledger-editor')?.scrollIntoView({behavior:'smooth'});};
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
      <div className="ledger-hero-copy"><span className="ledger-eyebrow"><WalletCards size={15}/> ขวัญใจดาวทองขนส่ง · TRANSPORT FINANCE</span><h1>บัญชีงานขนส่ง</h1><p>กำไรต่อเที่ยวเข้าบัญชีอัตโนมัติ แยกตามทะเบียนรถ · บันทึกค่าซ่อมและรายจ่ายวันไม่ได้วิ่งได้เอง</p></div>
      <div className="ledger-hero-art"><img src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง" className="kw-logo-ledger"/></div>
    </header>
    <div className="ledger-filters card-clean"><label><span><CalendarDays size={16}/> เดือนที่ต้องการสรุป</span><input className="input" type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label><label><span><Truck size={16}/> ทะเบียนรถ</span><select className="input" value={selectedVehicle} onChange={e=>setSelectedVehicle(e.target.value)}><option value="all">ทุกคันในสาขา</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label><div className="ledger-actions"><button className="btn-soft" onClick={load} disabled={loading}><RefreshCcw size={16}/>{loading?'กำลังโหลด':'รีเฟรช'}</button><button className="btn-soft" onClick={()=>downloadCsv(rows,month)} disabled={!rows.length}><Download size={16}/> CSV</button><button className="btn-primary" onClick={()=>document.getElementById('ledger-editor')?.scrollIntoView({behavior:'smooth'})}><Plus size={16}/> เพิ่มรายการ</button></div></div>
    <p className="ledger-scope">สาขา: {activeBranch?.name || '-'} · ข้อมูลเฉพาะเดือนที่เลือก · กำไรสุทธิจากบิลงานขนส่งดึงให้อัตโนมัติ · รายจ่ายและรายการอื่นพี่กรอกเอง · ต้นทุนในบิลหักไปแล้ว ไม่ต้องกรอกซ้ำ</p>
    <div className="ledger-reconcile-summary"><ShieldCheck size={17}/> <span>ระบบนำกำไรจากแต่ละบิลมาคิดเพียงครั้งเดียว · รายการที่ยืนยันว่าซ้ำจะเก็บไว้ตรวจสอบ แต่ไม่หักหรือบวกยอดซ้ำ</span></div>
    {reviewRows.length>0 && <section className="card-clean ledger-review"><div className="ledger-heading"><span className="ledger-heading-icon"><AlertTriangle size={18}/></span><div><h2>ตรวจสอบรายการย้อนหลัง ({reviewRows.length})</h2><p>รายการที่อาจซ้ำเป็นเพียงข้อสังเกต ต้องเปิดตรวจเอกสารก่อนยืนยัน ไม่ลบข้อมูลหรือปรับยอดย้อนหลังให้อัตโนมัติ</p></div></div><div className="ledger-review-list">{reviewRows.map(row=><div key={row.id} className="ledger-review-row"><div><strong>{row.date} · {row.plate_no} · {row.category}</strong><small>{format(row.amount_satang)} บาท · {row.excluded_from_totals?'ยืนยันแล้วว่าอยู่ในบิล ไม่คิดยอดซ้ำ':'อาจซ้ำกับบิล กรุณาตรวจสอบ'}</small></div><button type="button" className="btn-soft" onClick={()=>edit(row)}>ตรวจสอบ / แก้ไข</button></div>)}</div></section>}
    {!loading && data && <div className="ledger-source-status" role="status">
      <strong>ตรวจสอบแหล่งรายรับอัตโนมัติ:</strong>
      <span>จากบิลงานขนส่ง {data.auto_delivery_trips ?? 0} เที่ยว · จากบัญชีต่อเที่ยวเดิม {data.auto_historical_trips ?? 0} เที่ยว · รายการที่พบว่าซ้ำกันและนับเพียงครั้งเดียว {data.matched_trip_records ?? 0} รายการ</span>
      {(!data.auto_trips && !data.total?.income_satang) && <span className="ledger-source-warning">ไม่พบรายได้ที่มีการบันทึกในช่วงเดือน/สาขานี้ ตรวจสอบวันที่บิล ทะเบียน รายได้ในบิล และสาขาที่เลือกก่อนเพิ่มรายรับเอง เพื่อไม่ให้ยอดซ้ำ</span>}
    </div>}
    <div className="ledger-kpis"><Metric label="กำไรเที่ยวงาน + รายรับอื่น" amount={summary.income_satang} color="mint"/><Metric label="รายจ่ายรวม" amount={summary.expense_satang} color="rose"/><Metric label="คงเหลือ / กำไร(ขาดทุน)" amount={summary.profit_satang} color={summary.profit_satang<0?'rose':'violet'} signed/></div>
    <div className="ledger-grid">
      <section className="card-clean ledger-panel" id="ledger-editor"><div className="ledger-heading"><span className="ledger-heading-icon"><Plus size={19}/></span><div><h2>{editing?'แก้ไขรายการ':'บันทึกรายการใหม่'}</h2><p>กรอกค่าซ่อมและรายจ่ายเพิ่มเติมเองเท่านั้น · หากรายการนี้อยู่ในบิลแล้ว ให้เลือกบิลอ้างอิงเพื่อป้องกันการนับซ้ำ</p></div></div>
        <form onSubmit={save} className="ledger-form"><label>วันที่<input className="input" type="date" value={form.date} onChange={e=>set('date',e.target.value)} required/></label><label>ทะเบียนรถ<select className="input" value={form.vehicle_id} onChange={e=>set('vehicle_id',e.target.value)} required><option value="">เลือกทะเบียนรถ</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate_no}</option>)}</select></label><label>ประเภทรายการ<select className="input" value={form.type} onChange={e=>setForm(old=>({...old,type:e.target.value,category:e.target.value==='income'?'ค่าขนส่ง':'น้ำมัน'}))}><option value="income">รายรับอื่น (กรอกเอง)</option><option value="expense">รายจ่าย (กรอกเอง)</option></select></label><label>หมวดรายการ<select className="input" value={form.category} onChange={e=>set('category',e.target.value)}>{(form.type==='income'?['ค่าขนส่ง']:EXPENSES).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          {form.type==='income'&&<><label>วัสดุที่ขน<input className="input" value={form.material} onChange={e=>set('material',e.target.value)} placeholder="เช่น หิน ทราย ดิน ปูน" maxLength={120} required/></label><label>ปริมาณ / หน่วย (ไม่บังคับ)<input className="input" value={form.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="เช่น 30.045 ตัน หรือ 1 เที่ยว" maxLength={60}/></label></>}
          <div className="ledger-wide ledger-reconcile-box">
            <label className="ledger-checkline"><input type="checkbox" checked={form.excluded_from_totals} onChange={e=>setForm(old=>({...old,excluded_from_totals:e.target.checked,matched_delivery_id:e.target.checked?old.matched_delivery_id:'',matched_job_id:e.target.checked?old.matched_job_id:''}))}/><span><strong>รายการนี้บันทึกต้นทุนหรือรายได้อยู่ในบิลแล้ว</strong><small>เก็บประวัติไว้ แต่ไม่นำรายการที่กรอกเองมาคำนวณซ้ำ (Admin ยืนยันเท่านั้น)</small></span></label>
            {form.excluded_from_totals && <label>เลือกบิลที่บันทึกรายการนี้ไว้แล้ว
              <select className="input" value={form.matched_delivery_id && form.matched_job_id ? `${form.matched_delivery_id}:${form.matched_job_id}` : ''} onChange={e=>{const source=billOptions.find(row=>row.id===e.target.value);setForm(old=>({...old,matched_delivery_id:source?.source_delivery_id || '',matched_job_id:source?.source_job_id || ''}));}} required>
                <option value="">เลือกเที่ยวงานเพื่ออ้างอิง</option>
                {billOptions.map(row=><option key={row.id} value={row.id}>{row.date} · {row.material || 'ไม่ระบุวัสดุ'} · งาน {row.source_job_id} · ต้นทุน {format(row.trip_cost_satang)} บาท</option>)}
              </select>
              {!billOptions.length&&<small className="ledger-warning">ไม่มีบิลในวันและทะเบียนนี้ หากเป็นค่าซ่อมเพิ่มเติม ให้ยกเลิกตัวเลือกนี้และบันทึกเป็นรายจ่ายปกติ</small>}
            </label>}
          </div>
          <label>จำนวนเงิน (บาท)<input className="input" type="number" min="0.01" step="0.01" max="99999999999.99" value={form.amount_baht} onChange={e=>set('amount_baht',e.target.value)} placeholder="0.00" required/></label><label className="ledger-wide">หมายเหตุ / เลขที่เอกสาร<input className="input" value={form.note} onChange={e=>set('note',e.target.value)} placeholder="รายละเอียดประกอบ" maxLength={500}/></label><div className="ledger-form-buttons ledger-wide"><button className="btn-primary" type="submit" disabled={saving || !vehicles.length}>{saving?'กำลังบันทึก...':editing?'บันทึกการแก้ไข':'บันทึกรายการ'}</button>{editing&&<button className="btn-soft" type="button" onClick={newEntry}>ยกเลิกแก้ไข</button>}</div></form>
        {!vehicles.length&&<p className="ledger-note">ยังไม่มีทะเบียนรถในสาขานี้ กรุณาเพิ่มที่เมนู “รถและคนขับ” ก่อนบันทึกบัญชี</p>}
      </section>
      <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><WalletCards size={19}/></span><div><h2>รายจ่ายแยกหมวด</h2><p>สรุปจากรายการรายจ่ายที่บันทึกในเดือนนี้</p></div></div><div className="ledger-categories">{EXPENSES.map(cat=><div key={cat}><span>{cat}</span><strong>{format(totals[cat])} ฿</strong></div>)}</div></section>
    </div>
    <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><Truck size={19}/></span><div><h2>สรุปยอดสุทธิต่อทะเบียน</h2><p>ประจำเดือน {month} · กำไรเที่ยวงาน + รายรับอื่น − รายจ่ายที่กรอกเอง</p></div></div><div className="ledger-table-scroll ledger-vehicle-results"><table className="ledger-table"><thead><tr><th>ทะเบียนรถ</th><th>กำไรจากบิล + รายรับอื่น</th><th>รายจ่ายที่กรอกเอง</th><th>คงเหลือ / กำไร(ขาดทุน)</th><th>รายการ</th></tr></thead><tbody>{(data?.by_vehicle || []).filter(v=>selectedVehicle==='all'||v.vehicle_id===selectedVehicle).map(v=><tr key={v.vehicle_id}><td data-label="ทะเบียนรถ"><strong>{v.plate_no}</strong></td><td data-label="รายรับ" className="ledger-money-nowrap">{format(v.income_satang)} ฿</td><td data-label="รายจ่าย" className="ledger-money-nowrap">{format(v.expense_satang)} ฿</td><td data-label="คงเหลือ" className={v.profit_satang<0?'ledger-negative':'ledger-positive'}>{format(v.profit_satang)} ฿</td><td data-label="จำนวนรายการ">{v.entries}</td></tr>)}</tbody></table></div></section>
    <section className="card-clean ledger-panel"><div className="ledger-heading"><span className="ledger-heading-icon"><CalendarDays size={19}/></span><div><h2>รายการกำไรเที่ยวงานและรับ–จ่ายย้อนหลัง</h2><p>{rows.length} รายการ · รายการเชื่อมอัตโนมัติแก้ที่บิล/บัญชีต่อเที่ยวต้นทาง · รายการที่กรอกเองแก้ไขหรือลบได้</p></div></div><CompactPager state={pager} label="ค้นหาวันที่ ทะเบียน วัสดุ หรือหมวดบัญชี"/><div className="ledger-table-scroll ledger-history-results"><table className="ledger-table"><thead><tr><th>วันที่</th><th>ทะเบียนรถ</th><th>ประเภท / หมวด</th><th>วัสดุที่ขน / จำนวน</th><th>จำนวนเงิน</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>{pager.visible.map(r=><tr key={r.id}><td data-label="วันที่" className="ledger-date-nowrap">{r.date}</td><td data-label="ทะเบียนรถ"><strong>{r.plate_no}</strong></td><td data-label="ประเภท / หมวด"><span className={`ledger-pill ${r.type}`}>{r.is_auto?(r.source_type==='trip_finance'?'กำไรจากบัญชีต่อเที่ยว':'กำไรจากบิล'):r.type==='income'?'รายรับอื่น':'รายจ่าย'}</span><div className="ledger-cell-sub">{r.category}</div></td><td data-label="วัสดุ / จำนวน">{r.material||'-'}<div className="ledger-cell-sub">{r.quantity||''}</div></td><td data-label="จำนวนเงิน" className={r.type==='income'?'ledger-positive':'ledger-negative'}>{r.excluded_from_totals?'ไม่คิดซ้ำ · ':r.type==='income'?'+':'−'}{format(r.amount_satang)} ฿</td><td data-label="หมายเหตุ" className="ledger-note-cell">{r.note||'-'}{r.excluded_from_totals&&<div className="ledger-cell-sub">ยืนยันรายการซ้ำกับบิลแล้ว · ไม่รวมยอด · บิล {r.matched_delivery_id}</div>}{possibleDuplicateIds.has(r.id)&&<div className="ledger-cell-sub">อาจซ้ำ กรุณาตรวจสอบ</div>}{r.is_auto&&<div className="ledger-cell-sub">รายรับเที่ยว {format(r.trip_income_satang)} · ต้นทุนในบิล {format(r.trip_cost_satang)} บาท</div>}</td><td data-label="จัดการ">{r.is_auto?<span className="ledger-auto-tag">{r.source_type==='trip_finance'?'เชื่อมจากบัญชีต่อเที่ยว':'เชื่อมจากบิล'}</span>:<div className="ledger-row-actions"><button type="button" title="แก้ไข" onClick={()=>edit(r)}><Pencil size={15}/></button><button type="button" title="ลบ" onClick={()=>remove(r)}><Trash2 size={15}/></button></div>}</td></tr>)}{!rows.length&&<tr><td colSpan={7} className="ledger-empty">{loading?'กำลังโหลด...':'ยังไม่มีรายการในเดือนที่เลือก'}</td></tr>}</tbody></table></div></section>
  </div>;
}
function Metric({label,amount,color,signed=false}){return <div className={`ledger-kpi ${color}`}><span>{label}</span><strong>{signed&&amount>0?'+':''}{format(amount)} <small>บาท</small></strong></div>;}
