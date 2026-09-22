import {
  Calculator,
  Car,
  CircleDollarSign,
  Droplets,
  Gauge,
  RefreshCw,
  Route,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import BranchScopeBar from '../components/BranchScopeBar.jsx';
import RouteDistancePlanner from '../components/RouteDistancePlanner.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError } from '../utils/alerts.js';
import { money, number, parseDecimal } from '../utils/format.js';

const blank = {
  vehicle_id: '',
  distance_km: '',
  rate_km_per_liter: '',
  price_baht_per_liter: '',
  actual_liters: '',
  trips_per_month: '1',
};

function n(value) {
  return Math.max(0, parseDecimal(value, 0));
}

export default function FuelCalculatorPage() {
  const [form, setForm] = useState(blank);
  const [vehicles, setVehicles] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [vehicleRes, stockRes] = await Promise.all([api.vehicleOptions(), api.stockStatus()]);
      setVehicles(vehicleRes.data || []);
      setStocks(stockRes.data || []);
    } catch (err) {
      if (!silent) alertError(err, 'โหลดข้อมูลเครื่องคำนวณไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => {
    if (['stocks', 'vehicles'].includes(payload?.kind)) load(true);
  }, true);

  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => {
    const distance = n(form.distance_km);
    const rate = n(form.rate_km_per_liter);
    const price = n(form.price_baht_per_liter);
    const actual = n(form.actual_liters);
    const trips = Math.max(1, Math.round(n(form.trips_per_month) || 1));
    const standardLiters = distance > 0 && rate > 0 ? distance / rate : 0;
    const effectiveActual = actual > 0 ? actual : standardLiters;
    const standardCost = standardLiters * price;
    const actualCost = effectiveActual * price;
    const varianceLiters = effectiveActual - standardLiters;
    const varianceCost = actualCost - standardCost;
    const actualEfficiency = distance > 0 && effectiveActual > 0 ? distance / effectiveActual : 0;
    const costPerKm = distance > 0 ? actualCost / distance : 0;
    return {
      distance,
      rate,
      price,
      trips,
      standardLiters,
      effectiveActual,
      standardCost,
      actualCost,
      varianceLiters,
      varianceCost,
      actualEfficiency,
      costPerKm,
      monthlyLiters: effectiveActual * trips,
      monthlyCost: actualCost * trips,
      monthlyVarianceCost: varianceCost * trips,
    };
  }, [form]);

  function chooseVehicle(vehicleId) {
    const vehicle = vehicles.find((item) => String(item.id) === String(vehicleId));
    setForm((old) => ({
      ...old,
      vehicle_id: vehicleId,
      rate_km_per_liter: vehicle?.fuel_efficiency_km_per_liter || old.rate_km_per_liter,
    }));
  }

  function setField(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  if (loading) return <Loading />;

  const varianceTone = result.varianceLiters > 0.01 ? 'danger' : result.varianceLiters < -0.01 ? 'success' : 'normal';

  return (
    <div className="page-shell fuel-calculator-page">
      <div className="page-orbit">
        <span className="page-orbit-code">03 / FUEL CALCULATOR</span>
        <div>
          <h1 className="page-title">คำนวณน้ำมันและค่าใช้จ่าย</h1>
          <p className="page-subtitle">คำนวณลิตรจากระยะทาง วิเคราะห์ต้นทุน ประสิทธิภาพ และส่วนต่างจากมาตรฐานก่อนบันทึกงานจริง</p>
        </div>
        <span className="page-orbit-signal">LIVE CALC</span>
      </div>

      <BranchScopeBar label="ข้อมูลคำนวณของสาขา" detail="ตัวเลือกรถและสถานะสต๊อกที่ใช้คำนวณมาจากสาขาที่เลือก" />
      <RouteDistancePlanner onDistance={(distance) => setField('distance_km', String(distance))} />
      <section className="calculator-layout">
        <div className="card-clean calculator-input-card">
          <div className="calculator-card-head">
            <span><Calculator size={22} /></span>
            <div><h2>ข้อมูลสำหรับคำนวณ</h2><p>ผลลัพธ์เปลี่ยนทันทีเมื่อกรอกข้อมูล</p></div>
          </div>
          <div className="calculator-form-grid">
            <label className="form-field calculator-wide">
              <span className="label">เลือกรถ</span>
              <select className="input" value={form.vehicle_id} onChange={(e) => chooseVehicle(e.target.value)}>
                <option value="">เลือกรถเพื่อดึงอัตราประจำรถ</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate_no} {vehicle.driver_name ? `· ${vehicle.driver_name}` : ''} · {number(vehicle.fuel_efficiency_km_per_liter, 2)} กม./ลิตร
                  </option>
                ))}
              </select>
            </label>
            <CalcField icon={Route} label="ระยะทาง" suffix="กม." value={form.distance_km} onChange={(v) => setField('distance_km', v)} placeholder="เช่น 669" />
            <CalcField icon={Gauge} label="อัตราประจำรถ" suffix="กม./ลิตร" value={form.rate_km_per_liter} onChange={(v) => setField('rate_km_per_liter', v)} placeholder="เช่น 3.00" />
            <CalcField icon={CircleDollarSign} label="ราคาน้ำมัน" suffix="บาท/ลิตร" value={form.price_baht_per_liter} onChange={(v) => setField('price_baht_per_liter', v)} placeholder="เช่น 32.50" />
            <CalcField icon={Droplets} label="ลิตรเติมจริง" suffix="ลิตร" value={form.actual_liters} onChange={(v) => setField('actual_liters', v)} placeholder={result.standardLiters > 0 ? number(result.standardLiters, 2) : 'เว้นว่าง = ใช้ค่ามาตรฐาน'} />
            <CalcField icon={RefreshCw} label="จำนวนเที่ยวต่อเดือน" suffix="เที่ยว" value={form.trips_per_month} onChange={(v) => setField('trips_per_month', v)} placeholder="1" />
          </div>
          <div className="calculator-note">
            <ShieldCheck size={18} />
            <p><strong>สูตรมาตรฐาน:</strong> ระยะทาง ÷ อัตราประจำรถ = ลิตรที่ควรใช้ ช่องลิตรเติมจริงเว้นว่างได้ ระบบจะใช้ค่ามาตรฐานให้อัตโนมัติ</p>
          </div>
          <button type="button" className="btn-soft calculator-reset" onClick={() => setForm(blank)}><RefreshCw size={17} /> ล้างค่า</button>
        </div>

        <div className="calculator-result-stack">
          <section className="calculator-result-hero">
            <p>น้ำมันตามมาตรฐาน</p>
            <strong>{number(result.standardLiters, 2)} <small>ลิตร</small></strong>
            <span>{result.distance > 0 && result.rate > 0 ? `${number(result.distance, 2)} ÷ ${number(result.rate, 2)}` : 'กรอกระยะทางและอัตราประจำรถ'}</span>
          </section>

          <div className="calculator-metric-grid">
            <ResultMetric icon={Droplets} label="เติมจริง" value={`${number(result.effectiveActual, 2)} ลิตร`} />
            <ResultMetric icon={CircleDollarSign} label="ค่าใช้จ่ายจริง" value={money(result.actualCost)} />
            <ResultMetric icon={Gauge} label="ประสิทธิภาพจริง" value={`${number(result.actualEfficiency, 2)} กม./ลิตร`} />
            <ResultMetric icon={Route} label="ต้นทุนต่อกิโลเมตร" value={`${number(result.costPerKm, 2)} บาท/กม.`} />
          </div>

          <section className={`calculator-variance is-${varianceTone}`}>
            <div className="calculator-variance-icon">{result.varianceLiters > 0.01 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}</div>
            <div>
              <p>{result.varianceLiters > 0.01 ? 'เกินมาตรฐาน' : result.varianceLiters < -0.01 ? 'ประหยัดกว่ามาตรฐาน' : 'ตรงตามมาตรฐาน'}</p>
              <strong>{result.varianceLiters > 0 ? '+' : ''}{number(result.varianceLiters, 2)} ลิตร</strong>
              <span>{result.varianceCost > 0 ? 'ค่าใช้จ่ายเพิ่ม' : result.varianceCost < 0 ? 'ประหยัดได้' : 'ไม่มีส่วนต่าง'} {money(Math.abs(result.varianceCost))}</span>
            </div>
          </section>

          <section className="card-clean calculator-month-card">
            <div><p>ประมาณการต่อเดือน</p><span>{result.trips} เที่ยว</span></div>
            <div className="calculator-month-grid">
              <ResultLine label="น้ำมันรวม" value={`${number(result.monthlyLiters, 2)} ลิตร`} />
              <ResultLine label="ค่าใช้จ่ายรวม" value={money(result.monthlyCost)} />
              <ResultLine label="ส่วนต่างรวม" value={`${result.monthlyVarianceCost > 0 ? '+' : ''}${money(result.monthlyVarianceCost)}`} />
            </div>
          </section>
        </div>
      </section>

      <section className="card-clean calculator-stock-section">
        <div className="calculator-stock-head"><div><h2>ความพร้อมของสต๊อก</h2><p>ข้อมูลคงเหลือแบบเรียลไทม์จากระบบเดียวกัน</p></div><span>LIVE STOCK</span></div>
        <div className="calculator-stock-grid">
          {stocks.map((stock) => (
            <div key={stock.item_type} className={`calculator-stock-card is-${stock.level_status || 'ready'}`}>
              <div><p>{stock.tank_name || stock.item_type}</p><span>{stock.item_type}</span></div>
              <strong>{number(stock.balance_liters, 2)} <small>ลิตร</small></strong>
              <div className="calculator-stock-bar"><i style={{ width: `${Math.max(0, Math.min(100, Number(stock.available_percent || 0)))}%` }} /></div>
              <footer><span>{stock.level_label || 'พร้อมให้บริการ'}</span><small>{number(stock.available_percent, 1)}%</small></footer>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CalcField({ icon: Icon, label, suffix, value, onChange, placeholder }) {
  return (
    <label className="form-field calc-field">
      <span className="label"><Icon size={15} /> {label}</span>
      <div className="calc-input-wrap">
        <input className="input" type="text" inputMode="decimal" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

function ResultMetric({ icon: Icon, label, value }) {
  return <div className="calculator-result-metric"><span><Icon size={18} /></span><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function ResultLine({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
