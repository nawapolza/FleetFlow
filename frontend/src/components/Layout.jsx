import {
  Activity, BarChart3, Bell, Building2, Calculator, ChevronDown, ClipboardList,
  FileSpreadsheet, History, KeyRound, LogOut, Menu, ReceiptText, Package, ShieldCheck,
  Truck, Users, WalletCards, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import { confirmAction } from '../utils/alerts.js';

const navigation = [
  { key: 'dashboard', label: 'ภาพรวม', icon: BarChart3, ownerOnly: true },
  { key: 'quick', label: 'บันทึกงาน', icon: ClipboardList },
  { key: 'deliveries', label: 'รายการย้อนหลัง', icon: History },
  { key: 'calculator', label: 'คำนวณระยะทาง', icon: Calculator },
  { key: 'trips', label: 'บัญชีคนขับ', icon: ReceiptText, ownerOnly: true },
  { key: 'ledger', label: 'บัญชีขนส่งเดิม', icon: WalletCards, ownerOnly: true },
  { key: 'reports', label: 'รายงานรายเดือน', icon: FileSpreadsheet, ownerOnly: true },
  { key: 'materials', label: 'จัดการวัสดุ', icon: Package, ownerOnly: true },
  { key: 'vehicles', label: 'รถและคนขับ', icon: Truck, ownerOnly: true },
  { key: 'branches', label: 'สาขา', icon: Building2, ownerOnly: true },
  { key: 'users', label: 'พนักงาน', icon: Users, ownerOnly: true },
  { key: 'notifications', label: 'แจ้งเตือน', icon: Bell, ownerOnly: true },
  { key: 'account', label: 'บัญชีของฉัน', icon: KeyRound },
];

export default function Layout({ page, setPage, children }) {
  const { user, logout, isOwner } = useAuth();
  const { activeBranch, activeBranches, activeBranchId, selectBranch } = useBranch();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navigation.filter(item => !item.ownerOnly || isOwner);
  const current = items.find(item => item.key === page) || items[0];
  const CurrentIcon = current.icon;
  const quickItems = isOwner ? ['dashboard', 'quick', 'trips', 'reports'] : ['quick', 'deliveries', 'calculator', 'account'];

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const close = event => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', close); };
  }, [menuOpen]);

  function go(key) {
    setPage(key);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function doLogout() {
    if (await confirmAction('ออกจากระบบ?', 'ข้อมูลที่บันทึกไว้จะยังคงอยู่')) logout();
  }

  return <div className="rf-shell">
    <header className="rf-header">
      <div className="rf-header-top">
        <button className="rf-wordmark" type="button" onClick={() => go(isOwner ? 'dashboard' : 'quick')} aria-label="กลับหน้าหลัก">
          <img className="kw-logo-header" src="/kwanjai-logo.png" alt="ขวัญใจดาวทองขนส่ง"/>
          <span><strong>ขวัญใจดาวทองขนส่ง</strong><small>ระบบบริหารงานขนส่ง</small></span>
        </button>
        <div className="rf-header-actions">
          <span className="rf-system-indicator"><span/> ระบบพร้อมใช้งาน</span>
          {isOwner && <label className="rf-branch-select"><Building2 size={16}/>
            <select value={activeBranchId || ''} onChange={event => selectBranch(event.target.value)} aria-label="เลือกสาขา">
              {activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select><ChevronDown size={14}/></label>}
          {!isOwner && <span className="rf-branch-label"><Building2 size={16}/> {activeBranch?.name || 'สาขาของฉัน'}</span>}
          <span className="rf-account-label"><ShieldCheck size={15}/>{user?.name || user?.username}</span>
          <button className="rf-logout" type="button" onClick={doLogout} title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={18}/></button>
          <button className="rf-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="เปิดเมนู"><Menu size={23}/></button>
        </div>
      </div>
      <nav className="rf-desktop-nav" aria-label="เมนูหลัก">
        {items.map(item => { const Icon = item.icon; return <button type="button" key={item.key} onClick={() => go(item.key)} className={page === item.key ? 'rf-tab is-active' : 'rf-tab'} aria-current={page === item.key ? 'page' : undefined}><Icon size={17}/><span>{item.label}</span></button>; })}
      </nav>
    </header>
    <main className="rf-main">
      <div className="rf-page-marker"><span><CurrentIcon size={18}/> {current.label}</span></div>
      {children}
    </main>
    <nav className="rf-mobile-dock" aria-label="เมนูด่วน">
      {quickItems.map(key => {const item=items.find(entry=>entry.key===key);if(!item)return null;const Icon=item.icon;return <button type="button" key={key} onClick={()=>go(key)} className={page===key?'is-active':''}><Icon size={20}/><span>{item.label}</span></button>;})}
      <button type="button" onClick={()=>setMenuOpen(true)} aria-label="เมนูเพิ่มเติม"><Menu size={20}/><span>เมนู</span></button>
    </nav>
    {menuOpen && <div className="rf-menu-layer" role="presentation" onClick={()=>setMenuOpen(false)}>
      <section className="rf-menu-panel" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด" onClick={event=>event.stopPropagation()}>
        <div className="rf-menu-title"><div><small>ขวัญใจดาวทองขนส่ง</small><h2>เมนูทั้งหมด</h2></div><button type="button" onClick={()=>setMenuOpen(false)} aria-label="ปิดเมนู"><X size={22}/></button></div>
        <div className="rf-menu-branch">{activeBranch?.name || 'สาขาของฉัน'}</div>
        <div className="rf-menu-items">{items.map(item=>{const Icon=item.icon;return <button type="button" key={item.key} className={page===item.key?'is-active':''} onClick={()=>go(item.key)}><Icon size={20}/>{item.label}</button>;})}</div>
        <button type="button" className="rf-menu-logout" onClick={doLogout}><LogOut size={18}/> ออกจากระบบ</button>
      </section>
    </div>}
  </div>;
}
