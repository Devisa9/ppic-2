/**
 * MENU 2 – FORECASTING
 * core: MA3, WMA, Linear Regression, Exp. Smoothing + MAD/MSE/MAPE
 * view: tampilan menu Forecasting
 */

import { D, S, ui, $, tb, al, need, an, L, f, mkChart } from './common.js';

// ======================================================================
// 2a. PERHITUNGAN forecasting
// ======================================================================

/**
 * core/forecast.js  (logika murni, tanpa DOM)
 * Empat metode peramalan: MA3, WMA, Linear Regression, Exponential Smoothing.
 */

/** Konstanta penghalusan eksponensial. */
export const ALPHA = 0.3;

/**
 * @param {number[]} y  data historis
 * @param {number} H    horizon (jumlah periode ke depan)
 * @returns {{F:Object, met:Object, best:string, a:number, b:number, n:number}}
 *   F[k]  = fitted (n periode) + ramalan (H periode)
 *   met[k]= { mad, mse, mape } dihitung pada rentang sama (periode ke-4 dst.)
 */
export function forecast(y, H) {
  const n = y.length;
  const sx = (n * (n + 1)) / 2;
  const sxx = (n * (n + 1) * (2 * n + 1)) / 6;
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = y.reduce((a, b, i) => a + b * (i + 1), 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;

  // Jalankan fungsi peramal untuk t = 0..n+H-1; hasil ramalan dimasukkan ke deret.
  const run = (fn) => {
    const s = y.slice();
    const F = [];
    for (let t = 0; t < n + H; t++) {
      const v = fn(s, t, F);
      F.push(v);
      if (t >= n) s.push(v);
    }
    return F;
  };

  const F = {
    MA3: run((s, t) => (t < 3 ? null : (s[t - 1] + s[t - 2] + s[t - 3]) / 3)),
    WMA: run((s, t) => (t < 3 ? null : 0.5 * s[t - 1] + 0.3 * s[t - 2] + 0.2 * s[t - 3])),
    LR: run((s, t) => a + b * (t + 1)),
    ES: run((s, t, Fs) => (t === 0 ? s[0] : ALPHA * s[t - 1] + (1 - ALPHA) * Fs[t - 1])),
  };

  const met = {};
  for (const k in F) {
    let ae = 0;
    let se = 0;
    let pe = 0;
    let c = 0;
    for (let t = 3; t < n; t++) {
      const e = y[t] - F[k][t];
      ae += Math.abs(e);
      se += e * e;
      pe += y[t] ? Math.abs(e / y[t]) : 0;
      c++;
    }
    met[k] = { mad: ae / c, mse: se / c, mape: (100 * pe) / c };
  }

  const best = Object.keys(met).sort(
    (p, q) => met[p].mad - met[q].mad || met[p].mse - met[q].mse
  )[0];

  return { F, met, best, a, b, n };
}

/**
 * Statistik turunan untuk interpretasi (dipakai tampilan & laporan).
 * @param {ReturnType<typeof forecast>} fc
 * @param {number[]} y data historis
 */
export function forecastStats(fc, y) {
  const { F, met, best, b, n } = fc;
  const ranked = Object.keys(met).sort((p, q) => met[p].mad - met[q].mad);
  const runnerUp = ranked[1];
  const gap = (100 * (met[runnerUp].mad - met[best].mad)) / (met[runnerUp].mad || 1);
  const fut = F[best].slice(n);
  const last = y.slice(-3).reduce((a, c) => a + c, 0) / 3;
  const avg = fut.reduce((a, c) => a + c, 0) / fut.length;
  const chg = (100 * (avg - last)) / (last || 1);
  return { ranked, runnerUp, gap, mape: met[best].mape, fut, last, avg, chg, b, n, best };
}

// ======================================================================
// 2b. TAMPILAN menu Forecasting
// ======================================================================

/**
 * views/forecast.js
 * Halaman 2: perbandingan metode, hasil fitted, ramalan ke depan, grafik, kesimpulan.
 */

export const METHOD_NAMES = {
  MA3: 'MA3',
  WMA: 'WMA (0.5; 0.3; 0.2)',
  LR: 'Linear Regression',
  ES: 'Exp. Smoothing (α=0.3)',
};

/** Label kualitas akurasi berdasarkan MAPE. */
export const accuracyLabel = (mape) =>
  mape < 10 ? L('sangat baik', 'very good') : mape < 20 ? L('baik', 'good') : mape < 50 ? L('cukup', 'fair') : L('lemah', 'weak');

export function renderForecast() {
  const o = $('fco');
  if (ui.cf) {
    ui.cf.destroy();
    ui.cf = null;
  }
  if (!S.fc) {
    o.innerHTML = need(
      L('Unggah data historis (minimal 5 periode) di menu Upload.', 'Upload historical data (at least 5 periods) in the Upload menu.')
    );
    return;
  }

  const { F, met, best, a, b, n } = S.fc;
  const y = D.hist.v;
  const keys = Object.keys(F);

  const head = [L('Periode', 'Period'), 'Actual'];
  keys.forEach((k) => head.push(k, '|e|'));
  const fittedRows = y.map((v, t) => [
    D.hist.l[t],
    v,
    ...keys.flatMap((k) => [f(F[k][t]), t < 3 || F[k][t] == null ? '–' : f(Math.abs(v - F[k][t]))]),
  ]);

  const errorRows = keys.map((k) => {
    const cls = k === best ? 'class="hl"' : '';
    return [`<span ${cls}>${METHOD_NAMES[k]}</span>`, f(met[k].mad), f(met[k].mse), f(met[k].mape)];
  });

  const futureRows = S.fl.map((label, k) => [
    label,
    ...keys.map((q) => (q === best ? `<span class="hl">${f(F[q][n + k])}</span>` : f(F[q][n + k]))),
  ]);

  o.innerHTML =
    al('g', `<b>${L('Metode terbaik', 'Best method')}: ${METHOD_NAMES[best]}</b> (${L('MAD terkecil', 'lowest MAD')}: ${f(met[best].mad)})`) +
    `<h3>${L('Perbandingan error', 'Error comparison')}</h3>` +
    tb(['Method', 'MAD', 'MSE', 'MAPE (%)'], errorRows) +
    `<p style="font-size:12px;color:#a8978b">${L(
      'Semua metode dievaluasi pada rentang yang sama (periode ke-4 dst.) agar adil. LR: y = ' + f(a) + ' + ' + f(b) + '·t (t = 1..' + n + ').',
      'All methods are evaluated on the same window (period 4 onward) for a fair comparison. LR: y = ' + f(a) + ' + ' + f(b) + '·t (t = 1..' + n + ').'
    )}</p>` +
    `<h3>${L('Hasil peramalan data historis', 'Fitted forecasts on historical data')}</h3>` +
    tb(head, fittedRows) +
    `<h3>${L('Peramalan ke depan', 'Future forecast')}</h3>` +
    tb([L('Periode', 'Period'), ...keys], futureRows) +
    `<div style="height:300px"><canvas id="cfc"></canvas></div>` +
    analyzeForecast();

  const colors = { MA3: '#9ca3af', WMA: '#fbbf77', LR: '#ff7a1a', ES: '#c9b8ab' };
  ui.cf = mkChart('fc', 'cfc', {
    type: 'line',
    data: {
      labels: [...D.hist.l, ...S.fl],
      datasets: [
        { label: 'Actual', data: y, borderColor: '#ffffff', borderWidth: 3, pointRadius: 3 },
        ...keys.map((k) => ({
          label: k,
          data: F[k].map((v) => (v == null ? null : Math.round(v * 100) / 100)),
          borderColor: colors[k],
          borderWidth: k === best ? 3 : 1.5,
          borderDash: k === best ? [] : [5, 4],
          pointRadius: 0,
        })),
      ],
    },
    options: { maintainAspectRatio: false },
  });
}

function analyzeForecast() {
  const st = forecastStats(S.fc, D.hist.v);
  const { met } = S.fc;
  const { best, runnerUp: r, gap, mape, avg, chg, b, n } = st;

  const why = {
    LR: L(`data bertren ${b >= 0 ? 'naik' : 'turun'} ±${f(Math.abs(b), 1)} unit/periode`, `data trends ${b >= 0 ? 'up' : 'down'} ~${f(Math.abs(b), 1)} units/period`),
    WMA: L('permintaan mengikuti kondisi terbaru (bobot 0,5 di periode terakhir)', 'demand follows recent conditions (0.5 weight on the latest period)'),
    MA3: L('permintaan berfluktuasi di sekitar level tetap', 'demand fluctuates around a stable level'),
    ES: L('pola berubah bertahap (α = 0,3)', 'demand shifts gradually (α = 0.3)'),
  }[best];
  const q = accuracyLabel(mape);
  const sg = [];

  if (mape >= 20) sg.push(L('MAPE >20%: tambah data atau cek musiman/promosi.', 'MAPE >20%: add data or check seasonality/promotions.'));
  if (n < 12) sg.push(L(`Data baru ${n} periode; 12–24 periode lebih andal.`, `Only ${n} periods; 12–24 is more reliable.`));
  if (best === 'LR' && S.H > 6)
    sg.push(L('Tren makin tidak pasti di horizon panjang; perbarui ramalan tiap ada data baru.', 'Trend gets less certain over long horizons; refresh with each new actual.'));
  if (gap < 5) sg.push(L(`Selisih dengan ${r} hanya ${f(gap)}%; metode sederhana juga layak.`, `Only ${f(gap)}% behind ${r}; the simpler method is also fine.`));
  sg.push(L('Cek ramalan terhadap kapasitas produksi sebelum ke MPS.', 'Check the forecast against capacity before the MPS.'));

  return an(
    L(
      `<b>${best}</b> terbaik (MAD ${f(met[best].mad)}, MAPE ${f(mape)}% = akurasi ${q}), ${f(gap)}% lebih akurat dari ${r}, karena ${why}. Rata-rata ramalan ${f(avg)}/periode (${chg >= 0 ? '+' : '−'}${f(Math.abs(chg))}% vs 3 periode terakhir).`,
      `<b>${best}</b> is best (MAD ${f(met[best].mad)}, MAPE ${f(mape)}% = ${q} accuracy), ${f(gap)}% more accurate than ${r}, because ${why}. Average forecast ${f(avg)}/period (${chg >= 0 ? '+' : '−'}${f(Math.abs(chg))}% vs last 3 periods).`
    ),
    sg
  );
}
