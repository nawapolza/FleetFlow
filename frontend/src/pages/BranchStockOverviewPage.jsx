import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function BranchStockOverviewPage(){
 const [rows,setRows]=useState([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{api.get('/stocks/all-branches-status').then(r=>setRows(r.data||[])).finally(()=>setLoading(false))},[]);
 return <div className="space-y-4">
  <div><h1 className="text-2xl font-bold">น้ำมันพร้อมใช้ทุกสาขา</h1><p>สำหรับคนขับรถดูสาขาที่มีน้ำมันก่อนเข้ารับบริการ</p></div>
  {loading?<div>กำลังโหลด...</div>:rows.map(b=><div key={b.branch_id} className="rounded-xl border p-4">
   <div className="font-bold text-lg">{b.branch_name} ({b.branch_code})</div>
   {b.items.length?b.items.map(i=><div key={i.item_type} className="flex justify-between py-2">
    <span>{i.item_type}</span><b>{i.balance_liters.toLocaleString()} ลิตร</b>
   </div>):<div>ยังไม่มีข้อมูล</div>}
  </div>)}
 </div>
}
