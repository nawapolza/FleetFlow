from pathlib import Path
from PIL import Image
import re, shutil, json
root=Path('/mnt/data/kw_ton_fix')
src=root/'frontend/src'
form=src/'components/DeliveryForm.jsx'
t=form.read_text()
old='''                        <SmartDateField label="วันที่บรรทุก" hint="ไม่บังคับ" value={job.load_date} onChange={(v) => setJobField(index, 'load_date', v)} optional />
                        <SmartDateField label="วันที่ลงของ" hint="ไม่บังคับ" value={job.unload_date} onChange={(v) => setJobField(index, 'unload_date', v)} optional />
                        <Field className="field-wide" label="จุดรับสินค้า / บ่อต้นทาง" hint="จุดขึ้นงาน" value={job.origin_place} onChange={(v) => setJobField(index, 'origin_place', v)} placeholder="เช่น บ่อทราย SMC" />
                        <Field type="number" step="0.01" label="น้ำหนักต้นทาง" hint="น้ำหนักจากจุดรับสินค้า" value={job.loading_weight_kg} onChange={(v) => setJobField(index, 'loading_weight_kg', v)} suffix="กิโลกรัม" />
                        <Field className="field-wide" label="จุดลงงาน / ปลายทาง" hint="สถานที่ส่งสินค้า" value={job.destination_place} onChange={(v) => setJobField(index, 'destination_place', v)} placeholder="เช่น โออาร์ซี บางเสาธง" />
                        <Field type="number" step="0.01" label="น้ำหนักปลายทาง" hint="น้ำหนักจากจุดลงงาน" value={job.unloading_weight_kg} onChange={(v) => setJobField(index, 'unloading_weight_kg', v)} suffix="กิโลกรัม" />'''
new='''                        <div className="kw-paired-inputs field-wide">
                          <SmartDateField label="วันที่บรรทุก" hint="ไม่บังคับ" value={job.load_date} onChange={(v) => setJobField(index, 'load_date', v)} optional />
                          <SmartDateField label="วันที่ลงของ" hint="ไม่บังคับ" value={job.unload_date} onChange={(v) => setJobField(index, 'unload_date', v)} optional />
                        </div>
                        <Field className="field-wide" label="จุดรับสินค้า / บ่อต้นทาง" hint="จุดขึ้นงาน" value={job.origin_place} onChange={(v) => setJobField(index, 'origin_place', v)} placeholder="เช่น บ่อทราย SMC" />
                        <Field className="field-wide" label="จุดลงงาน / ปลายทาง" hint="สถานที่ส่งสินค้า" value={job.destination_place} onChange={(v) => setJobField(index, 'destination_place', v)} placeholder="เช่น โออาร์ซี บางเสาธง" />
                        <div className="kw-paired-inputs field-wide">
                          <TonField label="น้ำหนักต้นทาง" hint="น้ำหนักจากจุดรับสินค้า" kilograms={job.loading_weight_kg} onKilogramsChange={(v) => setJobField(index, 'loading_weight_kg', v)} />
                          <TonField label="น้ำหนักปลายทาง" hint="น้ำหนักจากจุดลงงาน" kilograms={job.unloading_weight_kg} onKilogramsChange={(v) => setJobField(index, 'unloading_weight_kg', v)} />
                        </div>'''
assert old in t, 'weight fields not found'
t=t.replace(old,new)
anchor='function Field({ label, value, onChange, type = '
assert anchor in t
helper='''// Display tonnes in the form but preserve kilograms in the existing API/database.
// Keep a local input string so typing "30." or "30.5" does not lose the decimal point.
function TonField({ label, hint, kilograms, onKilogramsChange }) {
  const asTonString = (kg) => kg === '' || kg === null || kg === undefined
    ? '' : String(Math.round((Number(kg) / 1000) * 1000000) / 1000000);
  const [tonnes, setTonnes] = useState(() => asTonString(kilograms));
  useEffect(() => {
    const external = asTonString(kilograms);
    // Preserve in-progress decimals; only sync when the underlying weight changed externally.
    if ((tonnes === '' && external === '') || (tonnes !== '' && external !== '' && Number(tonnes) === Number(external))) return;
    setTonnes(external);
  }, [kilograms]);
  return <Field type="number" step="0.001" label={label} hint={hint} suffix="ตัน"
    value={tonnes} onChange={(raw) => {
      setTonnes(raw);
      if (raw.trim() === '') { onKilogramsChange(''); return; }
      const parsed = Number(raw.replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed >= 0) onKilogramsChange(String(Math.round(parsed * 1000000) / 1000));
    }} />;
}

'''
t=t.replace(anchor, helper+anchor,1)
form.write_text(t)
# Visual display: all legacy weights remain kg in DB, convert only at user-facing output.
for rel in ['components/DeliveryReceiptCard.jsx','components/CaptureReceiptModal.jsx','utils/receiptImage.js']:
 p=src/rel
 s=p.read_text()
 s2=re.sub(r'''function kgText\(value\) \{\n  const kg = parseDecimal\(value, 0\);\n  return kg > 0 \? `\$\{number\(kg, Number\.isInteger\(kg\) \? 0 : 2\)\} (?:กิโลกรัม|กก\.)` : '-';\n\}''', '''function kgText(value) {
  const kg = parseDecimal(value, 0);
  return kg > 0 ? `${number(kg / 1000, 3)} ตัน` : '-';
}''', s)
 assert s2!=s,rel
 if rel=='components/CaptureReceiptModal.jsx':
  s2=s2.replace('number(weight, 0)} กิโลกรัม', 'number(weight / 1000, 3)} ตัน')
 p.write_text(s2)
p=src/'utils/format.js'; t=p.read_text().replace('น้ำหนักต้นทาง (กิโลกรัม)','น้ำหนักต้นทาง (ตัน)').replace('น้ำหนักปลายทาง (กิโลกรัม)','น้ำหนักปลายทาง (ตัน)'); p.write_text(t)
p=src/'pages/TransportLedgerPage.jsx';t=p.read_text().replace('เช่น 31,045 กก. หรือ 1 เที่ยว','เช่น 30.045 ตัน หรือ 1 เที่ยว');p.write_text(t)
# Form layout CSS appears last and overrides legacy mobile one-column for intentional paired fields only.
css=src/'responsive-ton-layout.css'
css.write_text('''/* Two useful fields per row on phones without squashing long address fields. */
.app-form-card .kw-paired-inputs {display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;min-width:0!important;width:100%!important;}
.app-form-card .kw-paired-inputs>*{min-width:0!important;width:100%!important;max-width:100%!important;}
.app-form-card .kw-paired-inputs .input{min-width:0!important;width:100%!important;padding-left:10px!important;padding-right:42px!important;font-size:16px!important;}
.app-form-card .kw-paired-inputs .field-suffix{right:9px!important;font-size:12px!important;}
.app-form-card .kw-paired-inputs .form-field-label{font-size:13px!important;line-height:1.5!important;overflow-wrap:anywhere;}
.app-form-card .kw-paired-inputs .form-field-hint{font-size:11px!important;line-height:1.4!important;}
@media (min-width:360px) and (max-width:640px){
 .app-form-card .kw-job-cost-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;}
 .app-form-card .kw-job-cost-grid .input{font-size:16px!important;padding-inline:10px 39px!important;min-width:0!important;}
 .app-form-card .kw-job-cost-grid .field-suffix{right:8px!important;}
}
@media(max-width:359px){.app-form-card .kw-paired-inputs{grid-template-columns:minmax(0,1fr)!important;}.app-form-card .kw-job-cost-grid{grid-template-columns:minmax(0,1fr)!important;}}
''')
p=src/'main.jsx';t=p.read_text();t=t.replace("import './accessible-update.css';", "import './accessible-update.css';\nimport './responsive-ton-layout.css';");p.write_text(t)
# User-provided transparent logo becomes only source for all icons, bump filenames to avoid stale cached installed icons.
public=root/'frontend/public'
logo=Image.open('/mnt/data/qwd-removebg-preview.png').convert('RGBA')
logo.save(public/'kwanjai-logo.png', optimize=True)
for sz in [192,512]:
 canvas=Image.new('RGBA',(sz,sz),(255,255,255,255))
 l=logo.copy();l.thumbnail((int(sz*.92),int(sz*.92)),Image.Resampling.LANCZOS)
 canvas.alpha_composite(l,((sz-l.width)//2,(sz-l.height)//2))
 canvas.save(public/f'kwanjai-brand-v2-{sz}.png',optimize=True)
# purge old public icon artifacts to prevent accidental reuse of obsolete files.
for sz in [192,512]: (public/f'kwanjai-icon-{sz}.png').unlink(missing_ok=True)
p=public/'manifest.webmanifest';t=p.read_text().replace('kwanjai-icon-192.png','kwanjai-brand-v2-192.png').replace('kwanjai-icon-512.png','kwanjai-brand-v2-512.png');p.write_text(t)
p=root/'frontend/index.html';t=p.read_text().replace('kwanjai-icon-192.png','kwanjai-brand-v2-192.png');t=t.replace('<link rel="manifest"', '<link rel="apple-touch-icon" href="/kwanjai-brand-v2-192.png" />\n    <link rel="manifest"');p.write_text(t)
# Ensure no re-creation of superseded app icon path anywhere in the active frontend.
for p in (root/'frontend').rglob('*'):
 if p.is_file() and p.suffix in ('.html','.js','.jsx','.json','.webmanifest') and p.name != 'package-lock.json':
  txt=p.read_text(errors='ignore')
  if 'kwanjai-icon-192.png' in txt or 'kwanjai-icon-512.png' in txt:
   p.write_text(txt.replace('kwanjai-icon-192.png','kwanjai-brand-v2-192.png').replace('kwanjai-icon-512.png','kwanjai-brand-v2-512.png'))
(root/'TON_AND_APP_ICON_UPDATE_TH.md').write_text('''# อัปเดตน้ำหนักเป็นตันและไอคอนแอป\n\n- ช่องกรอกน้ำหนักต้นทางและปลายทางใช้ **ตัน** โดยแปลงเป็นกิโลกรัมก่อนส่ง API (1 ตัน = 1,000 กิโลกรัม) เพื่อไม่ให้ข้อมูลเดิมหรือการคำนวณใน Backend เปลี่ยนความหมาย\n- ใบสรุปและรูปใบสรุปแสดงผลน้ำหนักเป็นตัน โดยอ่านค่าเดิมจากฐานข้อมูลซึ่งยังเก็บเป็นกิโลกรัม\n- เพิ่มการจัดวางสองคอลัมน์สำหรับวันบรรทุก/วันลงของ น้ำหนักสองจุด และหมวดต้นทุนเมื่อหน้าจอกว้างพอ; หน้าจอแคบกว่า 360px สลับเป็นคอลัมน์เดียวเพื่อไม่ให้ตัวหนังสือทับกัน\n- เปลี่ยนภาพโลโก้และไอคอนแอปเป็นชุดไฟล์ใหม่จากโลโก้โปร่งใส และเปลี่ยนชื่อไฟล์ไอคอนเพื่อเลี่ยงแคชเก่า\n- การติดตั้งไอคอนบนหน้าจอหลักที่เป็นรูปเก่า: ลบทางลัดเดิม แล้วเปิดเว็บไซต์ในเบราว์เซอร์ปกติและเพิ่มหน้าจอหลักใหม่; อัปโหลดโค้ดและ Deploy Frontend ก่อน\n''')
print('UPDATED_FILES', 'DeliveryForm.jsx', 'DeliveryReceiptCard.jsx', 'CaptureReceiptModal.jsx','receiptImage.js','responsive-ton-layout.css','brand icons')
