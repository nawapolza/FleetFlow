import { Building2, CheckCircle2 } from 'lucide-react';
import { useBranch } from '../contexts/BranchContext.jsx';

export default function BranchScopeBar({ label = 'ข้อมูลสาขาที่กำลังใช้งาน', detail = 'ทุกข้อมูลในหน้านี้ถูกกรองและบันทึกแยกตามสาขา', className = '' }) {
  const { activeBranch } = useBranch();
  return (
    <section className={`branch-scope-bar card-clean ${className}`.trim()} aria-label="ขอบเขตข้อมูลสาขา">
      <div className="branch-scope-main">
        <span><Building2 size={20} /></span>
        <div><small>{label}</small><strong>{activeBranch?.name || 'กำลังเลือกสาขา'}</strong></div>
      </div>
      <div className="branch-scope-detail"><CheckCircle2 size={16} /><span>{detail}</span><em>{activeBranch?.code || '-'}</em></div>
    </section>
  );
}
