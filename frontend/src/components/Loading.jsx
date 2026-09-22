import BrandMark from './BrandMark.jsx';

export default function Loading({ text = 'กำลังเชื่อมข้อมูล...' }) {
  return (
    <div className="nova-loading-wrap">
      <div className="nova-loading">
        <div className="nova-loading-radar"><i /><b /><span><BrandMark compact className="h-12 w-12 rounded-2xl text-[11px]" /></span></div>
        <p>{text}</p>
        <small>TEST SYSTEM LIVE ENGINE</small>
      </div>
    </div>
  );
}
