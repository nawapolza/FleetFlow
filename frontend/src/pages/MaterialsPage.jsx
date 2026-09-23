import { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Pencil, Trash2, RefreshCw, Search, Save, X } from 'lucide-react';
import { api } from '../api.js';
import { useBranch } from '../contexts/BranchContext.jsx';
import { alertError, confirmAction, toastSuccess } from '../utils/alerts.js';
import './materials.css';

export default function MaterialsPage() {
  const {activeBranchId} = useBranch();
  const [rows,setRows]=useState([]),[name,setName]=useState(''),[edit,setEdit]=useState(null);
  const [search,setSearch]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try { const response=await api.transportMaterials();setRows(response.data||[]); }catch(error){alertError(error,'โหลดวัสดุไม่สำเร็จ');}finally{setLoading(false);}},[activeBranchId]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{ const onFocus=()=>{if(!document.hidden)load();}; window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[load]);
  const filtered=rows.filter(r=>r.name.toLocaleLowerCase('th').includes(search.trim().toLocaleLowerCase('th')));
  async function save(e){e.preventDefault();if(!name.trim()||busy)return;setBusy(true);try{
    if(edit)await api.updateTransportMaterial(edit.id,{name:name.trim()});else await api.createTransportMaterial({name:name.trim()});
    toastSuccess(edit?'แก้ไขวัสดุแล้ว':'เพิ่มวัสดุแล้ว');setEdit(null);setName('');await load();
  }catch(error){alertError(error,'บันทึกวัสดุไม่สำเร็จ');}finally{setBusy(false);}}
  async function remove(row){if(busy||!await confirmAction('ปิดการใช้งานวัสดุ?',`วัสดุ ${row.name} จะไม่ปรากฏให้เลือกในงานใหม่ แต่ข้อมูลเที่ยวงานย้อนหลังจะยังคงอยู่`))return;
    setBusy(true);try{await api.deleteTransportMaterial(row.id);if(edit?.id===row.id){setEdit(null);setName('');}toastSuccess('ปิดการใช้งานวัสดุแล้ว');await load();}catch(error){alertError(error,'ลบวัสดุไม่สำเร็จ');}finally{setBusy(false);}}
  return <main className="materials-page">
    <section className="materials-hero"><div className="materials-hero-icon"><Package size={28}/></div><div><span>ADMIN · MASTER DATA</span><h1>จัดการวัสดุ</h1><p>ศูนย์กลางรายการวัสดุของสาขา · ใช้ร่วมกันในบันทึกงานและบัญชีคนขับ</p></div><button type="button" onClick={load} disabled={loading||busy}><RefreshCw size={17}/> รีเฟรช</button></section>
    <div className="materials-cards"><div><small>วัสดุที่เปิดใช้งาน</small><strong>{rows.length}</strong><span>รายการในสาขาปัจจุบัน</span></div><div><small>การเชื่อมต่อ</small><strong>ส่วนกลาง</strong><span>บันทึกงาน · บัญชีคนขับ</span></div></div>
    <div className="materials-grid"><section className="materials-panel"><div className="materials-panel-title"><Plus size={19}/><h2>{edit?'แก้ไขวัสดุ':'เพิ่มวัสดุใหม่'}</h2></div><form onSubmit={save}><label htmlFor="material-name">ชื่อวัสดุ</label><input id="material-name" maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="เช่น ทราย หิน ดิน ไม้สับ" required/><p>ตั้งชื่อให้ตรงกับที่ใช้งานจริง ระบบป้องกันชื่อซ้ำในสาขาเดียวกัน</p><div className="materials-form-actions">{edit&&<button type="button" className="materials-cancel" onClick={()=>{setEdit(null);setName('');}}><X size={16}/> ยกเลิก</button>}<button type="submit" disabled={busy||!name.trim()}><Save size={17}/>{busy?'กำลังบันทึก...':edit?'บันทึกการแก้ไข':'เพิ่มวัสดุ'}</button></div></form></section>
    <section className="materials-panel"><div className="materials-panel-title"><Package size={19}/><h2>รายการวัสดุทั้งหมด</h2><span className="materials-count">{filtered.length} รายการ</span></div><label className="materials-search"><Search size={17}/><input aria-label="ค้นหาวัสดุ" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อวัสดุ..."/></label><div className="materials-list">{loading?<p className="materials-empty">กำลังโหลด...</p>:filtered.length?filtered.map(row=><article key={row.id} className="materials-item"><span className="materials-item-icon"><Package size={19}/></span><div><strong>{row.name}</strong><small>พร้อมใช้งานในรายการใหม่</small></div><button type="button" title={`แก้ไข ${row.name}`} disabled={busy} onClick={()=>{setEdit(row);setName(row.name);window.scrollTo({top:0,behavior:'smooth'});}}><Pencil size={17}/></button><button type="button" title={`ปิดการใช้งาน ${row.name}`} className="materials-delete" disabled={busy} onClick={()=>remove(row)}><Trash2 size={17}/></button></article>):<p className="materials-empty">ยังไม่มีรายการวัสดุที่ตรงกับการค้นหา</p>}</div></section></div>
    <div className="materials-note">ข้อมูลเที่ยวงานและบัญชีที่บันทึกไปแล้วจะเก็บชื่อวัสดุเดิมเป็นหลักฐานย้อนหลัง การแก้ไขชื่อที่นี่จะเปลี่ยนตัวเลือกสำหรับงานใหม่ ไม่แก้เอกสารย้อนหลังโดยอัตโนมัติ</div>
  </main>;
}
