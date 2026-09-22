import { BookmarkCheck, Crosshair, ExternalLink, Link2, LoaderCircle, MapPin, Navigation, PencilLine, Route, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { alertError, toastInfo } from '../utils/alerts.js';
import { number } from '../utils/format.js';

function googleDirectionsUrl(origin, destination) {
  if (!origin || !destination) return '#';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${destination.lat},${destination.lon}&travelmode=driving`;
}

const RECENT_PLACES_KEY = 'heng-route-remembered-places-v2';
const isGoogleMapsInput = (value = '') => /(?:maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+\/maps|google\.navigation:|^geo:|^intent:\/\/)/i.test(String(value).trim());
function rememberedPlaces() {
  try { return JSON.parse(localStorage.getItem(RECENT_PLACES_KEY) || '[]').filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))).slice(0, 20); } catch (_) { return []; }
}
function rememberPlace(point) {
  if (!point) return;
  const id = String(point.id || `${point.lat},${point.lon}`);
  const next = [{ ...point, id, remembered_at: new Date().toISOString() }, ...rememberedPlaces().filter((row) => String(row.id) !== id && `${row.lat},${row.lon}` !== `${point.lat},${point.lon}`)].slice(0, 20);
  localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next));
}

function PointPicker({ title, point, onPick, onRename, onGoogleLink, allowGps = false, kind = 'origin' }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  function selectPoint(row, notify = false) {
    rememberPlace(row); onPick(row); setQuery(row.name); setRows([]);
    if (notify) toastInfo('จดจำสถานที่แล้ว · ครั้งหน้าพิมพ์ชื่อได้ทันที');
  }
  async function search() {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    if (isGoogleMapsInput(normalized)) return onGoogleLink?.(normalized);
    const coordinateMatch = normalized.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (coordinateMatch) {
      const lat = Number(coordinateMatch[1]); const lon = Number(coordinateMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) { selectPoint({ id: `coordinate-${lat}-${lon}`, name: `พิกัด ${lat}, ${lon}`, lat, lon, type: 'coordinate', provider: 'พิกัดโดยตรง' }, true); return; }
    }
    setBusy(true);
    try { const result = await api.searchPlaces(normalized); setRows(result.data || []); }
    catch (error) { alertError(error, 'ค้นหาสถานที่ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  function useGps() {
    if (!navigator.geolocation) return alertError(new Error('อุปกรณ์นี้ไม่รองรับ GPS'), 'ใช้ GPS ไม่ได้');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const result = await api.reversePlace(coords.latitude, coords.longitude);
        const point = { ...result.data, accuracy_m: Math.round(Number(coords.accuracy || 0)), captured_at: new Date().toISOString() };
        selectPoint(point, true);
      }
      catch (error) { alertError(error, 'อ่านตำแหน่ง GPS ไม่สำเร็จ'); }
      finally { setBusy(false); }
    }, (error) => { setBusy(false); alertError(error, 'กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์ และเปิดโหมดตำแหน่งความแม่นยำสูง'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  function updateQuery(value) {
    setQuery(value);
    if (!value.trim() || isGoogleMapsInput(value)) { setRows([]); return; }
    const keyword = value.trim().toLocaleLowerCase('th-TH');
    setRows(rememberedPlaces().filter((row) => String(row.name || '').toLocaleLowerCase('th-TH').includes(keyword)).map((row) => ({ ...row, isRemembered: true })));
  }
  return <div className={`route-point-picker is-${kind}`}>
    <div className="route-point-title"><span><MapPin size={17} /></span><div><strong>{title}</strong><small>{point ? `${number(point.lat, 5)}, ${number(point.lon, 5)}` : 'ค้นหาแล้วเลือกจากรายการ'}</small></div></div>
    <div className="route-search-row"><input className="input" value={query} onFocus={() => { if (!query) setRows(rememberedPlaces().map((row) => ({ ...row, isRemembered: true }))); }} onChange={(e) => updateQuery(e.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData('text').trim(); if (isGoogleMapsInput(pasted)) { event.preventDefault(); setQuery(pasted); onGoogleLink?.(pasted); } }} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())} placeholder="ชื่อสถานที่ หรือวางลิงก์ Google Maps" /><button type="button" className="btn-soft" onClick={search} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : isGoogleMapsInput(query) ? <Link2 size={17} /> : <Search size={17} />}</button>{allowGps && <button type="button" className="btn-soft route-gps-button" onClick={useGps} disabled={busy} title="ใช้ GPS ปัจจุบัน"><Crosshair size={17} /></button>}</div>
    {rows.length > 0 && <div className="route-search-results">{rows.map((row) => <button type="button" key={`${row.provider}-${row.id}-${row.lat}`} onClick={() => selectPoint(row, !row.isRemembered)}>{row.isRemembered ? <BookmarkCheck size={15} /> : <MapPin size={15} />}<span>{row.name}<small>{row.isRemembered ? 'สถานที่ที่จดจำไว้' : row.provider || 'แหล่งข้อมูลแผนที่'}</small></span></button>)}</div>}
    {point && <div className="route-selected"><BookmarkCheck size={15} /><span><b>จดจำแล้ว</b> · {point.name}{point.accuracy_m ? <small className={point.accuracy_m <= 30 ? 'is-precise' : 'is-warning'}>GPS ±{point.accuracy_m} ม. · {point.accuracy_m <= 30 ? 'ความแม่นยำสูง' : 'ควรรอจับสัญญาณกลางแจ้ง'}</small> : null}</span></div>}
    {point && <label className="route-pin-name"><span><PencilLine size={14} /> ตั้งชื่อหมุดนี้</span><input className="input" value={point.name || ''} onChange={(event) => onRename?.(event.target.value)} placeholder={`ชื่อ${title} เช่น โรงงาน / บริษัท / จุดรับสินค้า`} maxLength={180} /></label>}
  </div>;
}

function RouteMap({ origin, destination, route, onMapPick, activeTarget }) {
  const mapNode = useRef(null);
  const mapInstance = useRef(null);
  const routeLayer = useRef(null);
  useEffect(() => {
    if (!mapNode.current || !window.L || mapInstance.current) return undefined;
    const L = window.L;
    const map = L.map(mapNode.current, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView([13.2, 101.2], 6);
    map.createPane('labelsPane'); map.getPane('labelsPane').style.zIndex = '350'; map.getPane('labelsPane').style.pointerEvents = 'none';
    map.createPane('routePane'); map.getPane('routePane').style.zIndex = '520'; map.getPane('routePane').style.pointerEvents = 'none';
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, updateWhenIdle: false, keepBuffer: 3, attribution: '© OpenStreetMap contributors' });
    const voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, crossOrigin: true, attribution: '© OpenStreetMap © CARTO' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, crossOrigin: true, attribution: 'Imagery © Esri' });
    const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, crossOrigin: true, attribution: 'Labels © Esri', pane: 'labelsPane' });
    streets.addTo(map);
    let streetErrors = 0;
    streets.on('tileerror', () => { streetErrors += 1; if (streetErrors === 3 && !map.hasLayer(voyager)) { map.removeLayer(streets); voyager.addTo(map); } });
    L.control.layers({ 'แผนที่ถนน': streets, 'แผนที่สีสว่าง': voyager, 'ดาวเทียม': satellite }, { 'ชื่อสถานที่บนดาวเทียม': labels }, { position: 'topright' }).addTo(map);
    mapInstance.current = map;
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
    resizeObserver?.observe(mapNode.current);
    const timers = [50, 250, 700].map((delay) => setTimeout(() => map.invalidateSize({ pan: false }), delay));
    return () => { resizeObserver?.disconnect(); timers.forEach(clearTimeout); map.remove(); mapInstance.current = null; };
  }, []);
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !onMapPick) return undefined;
    const handler = ({ latlng }) => onMapPick(latlng.lat, latlng.lng);
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [onMapPick]);
  useEffect(() => {
    const L = window.L;
    const map = mapInstance.current;
    if (!L || !map) return;
    if (routeLayer.current) routeLayer.current.remove();
    map.closePopup();
    const group = L.featureGroup().addTo(map);
    routeLayer.current = group;
    const pin = (kind, label) => L.divIcon({ className: '', html: `<div class="route-map-pin is-${kind}"><span>${label}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 39] });
    if (origin) L.marker([origin.lat, origin.lon], { icon: pin('origin', 'A'), title: origin.name || 'ต้นทาง' }).bindTooltip(origin.name || 'ต้นทาง', { direction: 'top', permanent: true, className: 'route-pin-label', offset: [0, -34] }).addTo(group);
    if (destination) L.marker([destination.lat, destination.lon], { icon: pin('destination', 'B'), title: destination.name || 'ปลายทาง' }).bindTooltip(destination.name || 'ปลายทาง', { direction: 'top', permanent: true, className: 'route-pin-label', offset: [0, -34] }).addTo(group);
    const line = (route?.geometry || []).map(([lon, lat]) => [lat, lon]);
    if (line.length > 1) {
      L.polyline(line, { pane: 'routePane', color: '#ffffff', weight: 12, opacity: .96, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(group);
      L.polyline(line, { pane: 'routePane', color: '#175fe6', weight: 7, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(group);
      const middle = line[Math.floor(line.length / 2)];
      L.popup({ closeButton: false, autoClose: false, closeOnClick: false, className: 'route-summary-popup', offset: [0, -4] }).setLatLng(middle).setContent(`<div><b>🚚 ${number(route.distance_km, 2)} กม.</b><span>ประมาณ ${route.duration_minutes} นาที</span></div>`).openOn(map);
    }
    if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [42, 42], maxZoom: 16 });
    [40, 220].forEach((delay) => setTimeout(() => map.invalidateSize({ pan: false }), delay));
  }, [origin, destination, route]);
  if (!window.L) return <div className="route-map-unavailable"><Navigation size={34} /><strong>กำลังโหลดแผนที่ดาวเทียม…</strong><span>หากไม่แสดง กรุณาตรวจสอบอินเทอร์เน็ต</span></div>;
  return <div ref={mapNode} className={`route-live-map is-picking-${activeTarget}`} aria-label={`แผนที่ดาวเทียม กำลังเลือก${activeTarget === 'origin' ? 'ต้นทาง' : 'ปลายทาง'}`} />;
}

export default function RouteDistancePlanner({ onDistance, onRoute, compact = false }) {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeTarget, setActiveTarget] = useState('origin');
  const [googleLink, setGoogleLink] = useState('');
  const [importingLink, setImportingLink] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [pendingImportedPoint, setPendingImportedPoint] = useState(null);
  const [needsCurrentOrigin, setNeedsCurrentOrigin] = useState(false);
  const calculatedKeyRef = useRef('');
  const requestKeyRef = useRef('');
  useEffect(() => { api.mapStatus().then((result) => setStatus(result.data)).catch(() => {}); }, []);
  async function importGoogleLink(value = googleLink, requestedTarget = null) {
    const linkValue = String(value || '').trim();
    if (!linkValue) return alertError(new Error('กรุณาวางลิงก์ที่คัดลอกจาก Google Maps'), 'ยังไม่มีลิงก์');
    setGoogleLink(linkValue);
    setImportingLink(true); setImportMessage(''); setPendingImportedPoint(null); setNeedsCurrentOrigin(false);
    try {
      const result = await api.importGoogleMapsLink(linkValue);
      const imported = result.data || {};
      if (imported.origin) { setOrigin(imported.origin); rememberPlace(imported.origin); }
      if (imported.destination) { setDestination(imported.destination); rememberPlace(imported.destination); }
      if (imported.point) {
        rememberPlace(imported.point);
        if (requestedTarget === 'origin') { setOrigin(imported.point); setActiveTarget('destination'); }
        else if (requestedTarget === 'destination') setDestination(imported.point);
        else setPendingImportedPoint(imported.point);
      }
      setNeedsCurrentOrigin(Boolean(imported.requires_current_origin));
      setRoute(null);
      if (imported.requires_current_origin && imported.destination) {
        setImportMessage('พบปลายทางแล้ว · กำลังจับ GPS “ตำแหน่งของคุณ” เป็นต้นทาง A อัตโนมัติ');
        window.setTimeout(() => captureCurrentOrigin(true), 0);
      }
      else if (imported.point && !requestedTarget) setImportMessage('อ่านหมุดแล้ว · กรุณาเลือกว่าจะใช้เป็นต้นทาง A หรือปลายทาง B');
      else setImportMessage(imported.origin && imported.destination ? 'ปักหมุดเส้นทางและจดจำต้นทาง–ปลายทางแล้ว' : `ปักหมุดเป็น${requestedTarget === 'origin' ? 'ต้นทาง' : 'ปลายทาง'}และจดจำสถานที่แล้ว`);
      toastInfo(imported.point && !requestedTarget ? 'อ่านลิงก์แล้ว · กรุณาเลือก A หรือ B' : 'จดจำสถานที่แล้ว · ระบบปักหมุดให้เรียบร้อย');
    } catch (error) { alertError(error, 'นำเข้าลิงก์ Google Maps ไม่สำเร็จ'); }
    finally { setImportingLink(false); }
  }
  function confirmImportedPoint(target) {
    if (!pendingImportedPoint) return;
    if (target === 'origin') { setOrigin(pendingImportedPoint); setActiveTarget('destination'); }
    else { setDestination(pendingImportedPoint); setActiveTarget('origin'); }
    setImportMessage(`เลือกสถานที่จากลิงก์เป็น${target === 'origin' ? 'ต้นทาง A' : 'ปลายทาง B'}และจดจำแล้ว`);
    setPendingImportedPoint(null); setRoute(null);
    toastInfo('เลือกหมุดและจดจำสถานที่แล้ว');
  }
  function captureCurrentOrigin(autoTriggered = false) {
    if (!navigator.geolocation) return alertError(new Error('อุปกรณ์นี้ไม่รองรับ GPS'), 'ใช้ GPS ไม่ได้');
    setImportingLink(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const result = await api.reversePlace(coords.latitude, coords.longitude);
        const point = { ...result.data, name: `ตำแหน่งปัจจุบัน — ${result.data.name}`, accuracy_m: Math.round(Number(coords.accuracy || 0)), captured_at: new Date().toISOString() };
        setOrigin(point); rememberPlace(point); setNeedsCurrentOrigin(false); setRoute(null); setActiveTarget('destination');
        setImportMessage(`จับ GPS ต้นทางแล้ว (±${point.accuracy_m} ม.) · ระบบกำลังคำนวณเส้นทางอัตโนมัติ`);
        toastInfo('จับ GPS ต้นทางและจดจำแล้ว');
      } catch (error) { alertError(error, 'อ่านตำแหน่ง GPS ไม่สำเร็จ'); }
      finally { setImportingLink(false); }
    }, (error) => {
      setImportingLink(false); setNeedsCurrentOrigin(true);
      setImportMessage(autoTriggered ? 'ระบบยังเข้าถึงตำแหน่งไม่ได้ · กรุณาอนุญาต GPS แล้วกดปุ่มด้านล่าง' : 'ยังจับ GPS ต้นทางไม่ได้ กรุณาตรวจสอบสิทธิ์ตำแหน่ง');
      alertError(error, 'กรุณาเปิด GPS และอนุญาตตำแหน่งความแม่นยำสูง');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  async function pickFromMap(lat, lon) {
    try {
      const result = await api.reversePlace(lat, lon);
      if (activeTarget === 'origin') { setOrigin(result.data); setActiveTarget('destination'); } else setDestination(result.data);
      setRoute(null);
    } catch (_) {
      const point = { id: `map-${lat}-${lon}`, name: `พิกัดจากแผนที่ ${lat.toFixed(6)}, ${lon.toFixed(6)}`, lat, lon, type: 'map' };
      if (activeTarget === 'origin') { setOrigin(point); setActiveTarget('destination'); } else setDestination(point);
      setRoute(null);
    }
  }
  async function calculate(force = false) {
    if (!origin || !destination) return alertError(new Error('กรุณาเลือกต้นทางและปลายทางให้ครบ'), 'ข้อมูลเส้นทางไม่ครบ');
    const key = `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`;
    if (!force && (calculatedKeyRef.current === key || requestKeyRef.current === key)) return;
    requestKeyRef.current = key;
    setBusy(true);
    try { const result = await api.calculateRoute(origin.lat, origin.lon, destination.lat, destination.lon); calculatedKeyRef.current = key; setRoute(result.data); onDistance?.(result.data.distance_km); }
    catch (error) { requestKeyRef.current = ''; alertError(error, 'คำนวณเส้นทางไม่สำเร็จ'); }
    finally { requestKeyRef.current = ''; setBusy(false); }
  }
  useEffect(() => {
    if (!origin || !destination) return undefined;
    const timer = window.setTimeout(() => calculate(false), 450);
    return () => window.clearTimeout(timer);
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon]);
  useEffect(() => {
    if (route && origin && destination) onRoute?.({ origin, destination, ...route });
  }, [route?.calculated_at, origin?.name, destination?.name]);
  const pickOrigin = (point) => { setOrigin(point); setRoute(null); setActiveTarget('destination'); };
  const pickDestination = (point) => { setDestination(point); setRoute(null); setActiveTarget('destination'); };
  return <section className={`route-planner-card ${compact ? 'is-compact' : ''}`}>
    <div className="route-planner-head"><div><span><Navigation size={21} /></span><div><h2>GPS ตรวจสอบระยะทาง</h2><p>ค้นหา ปักหมุด ตั้งชื่อเอง และคำนวณระยะตามถนน</p></div></div><b>ROUTE VERIFIED</b></div>
    {status && <div className={`route-provider-status ${status.google_enabled ? 'is-google' : 'is-fallback'}`}><ShieldCheck size={16} /><span><b>{status.search_provider}</b> · คำนวณด้วย {status.route_provider}</span></div>}
    <div className="route-google-import">
      <div className="route-google-import-head"><span><Link2 size={17} /></span><div><strong>นำเข้าจาก Google Maps</strong><small>วางได้ทั้งลิงก์ ข้อความแชร์ ลิงก์สั้น หรือ Intent จากมือถือ ระบบจัดรูปแบบให้อัตโนมัติ</small></div></div>
      <div className="route-google-import-row"><input className="input" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" value={googleLink} onChange={(event) => setGoogleLink(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData('text').trim(); if (isGoogleMapsInput(pasted)) { event.preventDefault(); setGoogleLink(pasted); importGoogleLink(pasted); } }} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), importGoogleLink())} placeholder="วางข้อความหรือลิงก์จาก Google Maps — ระบบอ่านทันที" /><button type="button" onClick={() => importGoogleLink()} disabled={importingLink}>{importingLink ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />} {importingLink ? 'กำลังอ่านลิงก์…' : 'นำเข้าและจดจำ'}</button></div>
      {importMessage && <p><ShieldCheck size={14} /> {importMessage}</p>}
      {pendingImportedPoint && <div className="route-import-choice"><span><MapPin size={16} /><b>{pendingImportedPoint.name}</b></span><div><button type="button" className="is-origin" onClick={() => confirmImportedPoint('origin')}><i>A</i> ใช้เป็นต้นทาง</button><button type="button" className="is-destination" onClick={() => confirmImportedPoint('destination')}><i>B</i> ใช้เป็นปลายทาง</button></div></div>}
      {needsCurrentOrigin && <div className="route-current-origin"><span><Crosshair size={17} /><b>ลิงก์นี้ใช้ “ตำแหน่งของคุณ”</b><small>Google ไม่ส่งพิกัดต้นทางมากับลิงก์ ต้องจับ GPS จากอุปกรณ์นี้</small></span><button type="button" onClick={captureCurrentOrigin} disabled={importingLink}>{importingLink ? <LoaderCircle className="spin" size={17} /> : <Crosshair size={17} />} ใช้ GPS ปัจจุบันเป็นต้นทาง A</button></div>}
    </div>
    <div className="route-pin-mode" role="group" aria-label="เลือกชนิดหมุดที่จะปักบนแผนที่">
      <button type="button" className={activeTarget === 'origin' ? 'is-active is-origin' : ''} onClick={() => setActiveTarget('origin')}><i>A</i><span><small>กำลังเลือก</small><strong>ต้นทาง</strong></span></button>
      <button type="button" className={activeTarget === 'destination' ? 'is-active is-destination' : ''} onClick={() => setActiveTarget('destination')}><i>B</i><span><small>กำลังเลือก</small><strong>ปลายทาง</strong></span></button>
      <p><MapPin size={15} /> เลือก A หรือ B แล้วแตะตำแหน่งบนแผนที่</p>
    </div>
    <div className="route-planner-body">
      <div className="route-pickers">
        <PointPicker title="ต้นทาง" kind="origin" point={origin} onPick={pickOrigin} onRename={(name) => setOrigin((current) => ({ ...current, name }))} onGoogleLink={(link) => importGoogleLink(link, 'origin')} allowGps />
        <PointPicker title="ปลายทาง" kind="destination" point={destination} onPick={pickDestination} onRename={(name) => setDestination((current) => ({ ...current, name }))} onGoogleLink={(link) => importGoogleLink(link, 'destination')} />
        <p className="route-map-hint">ค้นหาชื่อทั่วโลก, กรอกพิกัด 6 ตำแหน่ง หรือเลือก A/B แล้วคลิกแผนที่ จากนั้นตั้งชื่อหมุดเองได้</p>
        <button type="button" className="route-calculate-button" onClick={() => calculate(true)} disabled={busy || !origin || !destination}>{busy ? <LoaderCircle className="spin" size={19} /> : <Route size={19} />} {busy ? 'กำลังคำนวณอัตโนมัติ…' : route ? 'ตรวจสอบเส้นทางใหม่' : 'รอเลือกต้นทางและปลายทาง'}</button>
        {route && <div className="route-proof"><div><small>ระยะทางตามถนน</small><strong>{number(route.distance_km, 2)} <span>กม.</span></strong></div><div><small>เวลาโดยประมาณ</small><strong>{Math.floor(route.duration_minutes / 60) ? `${Math.floor(route.duration_minutes / 60)} ชม. ` : ''}{route.duration_minutes % 60} นาที</strong></div><a href={googleDirectionsUrl(origin, destination)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> เปิดตรวจสอบใน Google Maps</a><p>{route.route_quality || 'คำนวณตามเครือข่ายถนน'} · {new Date(route.calculated_at).toLocaleString('th-TH')} · {route.provider}</p></div>}
      </div>
      <div className="route-map-panel">
        <aside className="route-map-selection" aria-live="polite">
          <div className="is-origin"><i>A</i><span><small>ต้นทาง</small><strong>{origin?.name || 'ยังไม่เลือก'}</strong></span></div>
          <div className="is-destination"><i>B</i><span><small>ปลายทาง</small><strong>{destination?.name || 'ยังไม่เลือก'}</strong></span></div>
        </aside>
        <RouteMap origin={origin} destination={destination} route={route} onMapPick={pickFromMap} activeTarget={activeTarget} />
      </div>
    </div>
  </section>;
}
