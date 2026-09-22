import {
  KeyRound,
  Bell,
  Building2,
  Boxes,
  Car,
  ClipboardList,
  Calculator,
  FileSpreadsheet,
  WalletCards,
  Gauge,
  History,
  LogOut,
  Menu,
  MapPin,
  ShieldCheck,
  Sprout,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useBranch } from '../contexts/BranchContext.jsx';
import BrandMark from './BrandMark.jsx';
import { confirmAction } from '../utils/alerts.js';

const navBase = [
  { key: 'account', label: 'บัญชีของฉัน', short: 'บัญชี', eyebrow: 'เปลี่ยนรหัสผ่าน', icon: KeyRound },
  { key: 'dashboard', label: 'หน้าหลัก', short: 'หน้าหลัก', eyebrow: 'ภาพรวมระบบ', icon: Gauge, ownerOnly: true },
  { key: 'branches', label: 'จัดการสาขา', short: 'สาขา', eyebrow: 'เพิ่ม แก้ไข และแยกข้อมูล', icon: Building2, ownerOnly: true },
  { key: 'calculator', label: 'คำนวณน้ำมัน', short: 'คำนวณ', eyebrow: 'ระยะทางและค่าใช้จ่าย', icon: Calculator },
  { key: 'quick', label: 'บันทึกเติมน้ำมัน', short: 'บันทึก', eyebrow: 'สร้างรายการใหม่', icon: ClipboardList },
  { key: 'deliveries', label: 'รายการย้อนหลัง', short: 'รายการ', eyebrow: 'ค้นหาและตรวจสอบ', icon: History },
  { key: 'stocks', label: 'สต๊อกน้ำมัน', short: 'สต๊อก', eyebrow: 'ยอดคงเหลือเรียลไทม์', icon: Boxes },
  { key: 'availability', label: 'น้ำมันทุกสาขา', short: 'ทุกสาขา', eyebrow: 'สำหรับคนขับดูจุดเติม', icon: MapPin },
  { key: 'ledger', label: 'บัญชีงานขนส่ง', short: 'รับจ่าย', eyebrow: 'กำไร/ขาดทุนรายคัน', icon: WalletCards, ownerOnly: true },
  { key: 'reports', label: 'สรุปส่งบัญชี', short: 'รายงาน', eyebrow: 'รายงานประจำเดือน', icon: FileSpreadsheet, ownerOnly: true },
  { key: 'vehicles', label: 'รถและคนขับ', short: 'รถ', eyebrow: 'จัดการรถ', icon: Car, ownerOnly: true },
  { key: 'users', label: 'พนักงาน', short: 'ทีมงาน', eyebrow: 'บัญชีและสิทธิ์', icon: Users, ownerOnly: true },
  { key: 'notifications', label: 'แจ้งเตือน', short: 'แจ้งเตือน', eyebrow: 'รายการที่ต้องตรวจ', icon: Bell, ownerOnly: true },
];

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia('(max-width: 920px)').matches));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 920px)');
    const update = () => {
      const touchTablet = navigator.maxTouchPoints > 1 && window.innerWidth <= 1120;
      setIsMobile(media.matches || touchTablet);
    };
    update();
    media.addEventListener?.('change', update);
    window.addEventListener('resize', update, { passive: true });
    return () => {
      media.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return isMobile;
}

export default function Layout({ page, setPage, children }) {
  const { user, logout, isOwner } = useAuth();
  const { activeBranch, activeBranches, activeBranchId, selectBranch } = useBranch();
  const isMobile = useMobileViewport();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuCloseRef = useRef(null);
  const navItems = useMemo(() => navBase.filter((item) => !item.ownerOnly || isOwner), [isOwner]);
  const currentItem = navItems.find((item) => item.key === page) || navItems[0];
  const CurrentIcon = currentItem.icon;
  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    [],
  );

  const mobileItems = useMemo(() => {
    const keys = isOwner ? ['dashboard', 'ledger', 'quick', 'reports', 'notifications'] : ['quick', 'calculator', 'deliveries', 'stocks'];
    return keys.map((key) => navItems.find((item) => item.key === key)).filter(Boolean);
  }, [isOwner, navItems]);

  useEffect(() => {
    document.documentElement.dataset.device = isMobile ? 'mobile' : 'desktop';
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => menuCloseRef.current?.focus());
    const closeOnEscape = (event) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      previousActiveElement?.focus?.();
    };
  }, [menuOpen]);

  async function doLogout() {
    const ok = await confirmAction('ออกจากระบบตอนนี้?', 'ข้อมูลที่บันทึกแล้วจะไม่หาย และคุณสามารถกลับมาเข้าสู่ระบบใหม่ได้');
    if (ok) logout();
  }

  function go(key) {
    setPage(key);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="nova-app">
      {!isMobile && (
        <aside className="nova-rail">
          <button className="nova-brand" onClick={() => go(isOwner ? 'dashboard' : 'quick')} aria-label="กลับหน้าแรก">
            <span className="nova-brand-mark"><BrandMark compact /></span>
            <span className="nova-brand-copy">
              <strong>Test System</strong>
              <small>Operations Management Platform</small>
            </span>
          </button>

          <div className="nova-system-pill"><Zap size={13} /><span>ระบบพร้อมใช้งาน</span><i /></div>

          <div className="nova-branch-panel">
            <div className="nova-branch-panel-label"><Building2 size={14} /><span>สาขาที่กำลังใช้งาน</span></div>
            <BranchSelector compact={!isOwner} isOwner={isOwner} branches={activeBranches} value={activeBranchId} onChange={selectBranch} />
          </div>

          <nav className="nova-route" aria-label="เมนูหลัก">
            {navItems.map((item) => (
              <NavButton key={item.key} item={item} active={page === item.key} onClick={() => go(item.key)} />
            ))}
          </nav>

          <div className="nova-rail-foot">
            <div className="nova-user-card">
              <span className="nova-user-avatar"><Sprout size={19} /></span>
              <span className="nova-user-copy">
                <strong>{user?.name || user?.username}</strong>
                <small><ShieldCheck size={12} /> {isOwner ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</small>
              </span>
            </div>
            <button onClick={doLogout} className="nova-logout" title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={18} /></button>
          </div>
        </aside>
      )}

      <section className="nova-workspace">
        <header className="nova-topbar">
          {isMobile ? (
            <>
              <button className="nova-mobile-brand" onClick={() => go(isOwner ? 'dashboard' : 'quick')}>
                <span><BrandMark compact /></span>
                <div><small>{activeBranch?.name || currentItem.eyebrow}</small><strong>{currentItem.label}</strong></div>
              </button>
              <button className="nova-menu-trigger" onClick={() => setMenuOpen(true)} aria-label="เปิดเมนู"><Menu size={21} /></button>
            </>
          ) : (
            <>
              <div className="nova-page-context">
                <span className="nova-command-icon"><CurrentIcon size={20} /></span>
                <div><small>{currentItem.eyebrow}</small><h1>{currentItem.label}</h1></div>
              </div>
              <div className="nova-top-actions">
                <div className="nova-top-branch">
                  <MapPin size={16} />
                  <BranchSelector isOwner={isOwner} branches={activeBranches} value={activeBranchId} onChange={selectBranch} />
                </div>
                <div className="nova-date-chip"><span>{todayLabel}</span></div>
                {isOwner && (
                  <button className={`nova-notification-button ${page === 'notifications' ? 'is-active' : ''}`} onClick={() => go('notifications')} aria-label="เปิดแจ้งเตือน">
                    <Bell size={18} />
                  </button>
                )}
                <div className="nova-account-chip">
                  <span className="nova-account-avatar">{String(user?.name || user?.username || 'H').slice(0, 1).toUpperCase()}</span>
                  <span><strong>{user?.name || user?.username}</strong><small>{isOwner ? 'Admin' : 'User'}</small></span>
                </div>
              </div>
            </>
          )}
        </header>

        <main className="nova-main">{children}</main>
      </section>

      {isMobile && (
        <nav className="nova-mobile-dock" aria-label="เมนูหลักบนมือถือ">
          <div className="nova-mobile-dock-inner">
            {mobileItems.map((item) => {
              const Icon = item.icon;
              const isCapture = item.key === 'quick';
              return (
                <button key={item.key} onClick={() => go(item.key)} className={`nova-dock-item ${isCapture ? 'is-capture' : ''} ${page === item.key ? 'is-active' : ''}`}>
                  <span><Icon size={isCapture ? 24 : 20} /></span><small>{item.short}</small>
                </button>
              );
            })}
            <button onClick={() => setMenuOpen(true)} className={`nova-dock-item ${!mobileItems.some((item) => item.key === page) ? 'is-active' : ''}`}>
              <span><Menu size={20} /></span><small>เมนู</small>
            </button>
          </div>
        </nav>
      )}

      {isMobile && menuOpen && (
        <div className="nova-sheet-layer">
          <button className="nova-sheet-backdrop" onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู" />
          <section className="nova-sheet" role="dialog" aria-modal="true" aria-label="เมนูทั้งหมด">
            <div className="nova-sheet-handle" />
            <div className="nova-sheet-head">
              <div className="nova-sheet-identity">
                <span><BrandMark compact /></span>
                <div><strong>Test System</strong><small>{user?.name || user?.username} · {isOwner ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</small></div>
              </div>
              <button ref={menuCloseRef} onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู"><X size={21} /></button>
            </div>
            <div className="nova-sheet-branch">
              <span><Building2 size={17} /> สาขาที่กำลังใช้งาน</span>
              <BranchSelector isOwner={isOwner} branches={activeBranches} value={activeBranchId} onChange={selectBranch} />
            </div>
            <div className="nova-sheet-grid">
              {navItems.map((item) => <NavButton key={item.key} item={item} active={page === item.key} onClick={() => go(item.key)} mobile />)}
            </div>
            <button onClick={doLogout} className="nova-sheet-logout"><LogOut size={18} /> ออกจากระบบ</button>
          </section>
        </div>
      )}
    </div>
  );
}

function BranchSelector({ branches, value, onChange, isOwner, compact = false }) {
  if (!isOwner) {
    const branch = branches.find((item) => item.id === value) || branches[0];
    return <div className={`branch-readonly-chip ${compact ? 'is-compact' : ''}`}><strong>{branch?.name || 'ไม่พบสาขา'}</strong><small>{branch?.code || '-'}</small></div>;
  }
  return (
    <select className={`branch-global-select ${compact ? 'is-compact' : ''}`} value={value || ''} onChange={(event) => onChange(event.target.value)} aria-label="เลือกสาขา">
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
    </select>
  );
}

function NavButton({ item, active, onClick, mobile = false }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={`${mobile ? 'nova-sheet-nav' : 'nova-route-item'} ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span className={mobile ? 'nova-sheet-nav-icon' : 'nova-route-node'}><Icon size={19} /></span>
      <span className="nova-route-copy"><strong>{item.label}</strong><small>{item.eyebrow}</small></span>
    </button>
  );
}
