/**
 * MENU 6 – REPORT
 * Menyusun laporan (ringkasan, interpretasi, saran) lalu menampilkannya di layar / PDF.
 */

import { D, S, $, tb, need, an, L, f, sum, has, pdfText, chartToImage, CH } from './common.js';
import { forecastStats, accuracyLabel } from './forecasting.js';
import { compareLotSizing, rows5, costTable } from './mps.js';
import { compareRules, minMetric, isBest, flowShopMakespan, johnsonUtilization } from './scheduling.js';

// ======================================================================
// 6a. BAGIAN: ringkasan
// ======================================================================

/**
 * report/sections/summary.js
 * Bagian 1 laporan: ringkasan data & parameter.
 */

export function summarySection(ctx) {
  const loaded =
    [
      ['Historical', D.hist ? D.hist.v.length : 0],
      ['BOM', D.bom.length],
      ['Inventory', Object.keys(D.inv).length],
      ['Scheduled Receipt', Object.keys(D.sr).length],
      ['Routing', D.rt.length],
      ['Jobs', D.jobs.length],
      ['Johnson', D.j2.length],
    ]
      .filter((x) => x[1])
      .map((x) => x[0])
      .join(', ') || '-';

  return {
    h: ctx.T('Ringkasan Data dan Parameter', 'Data and Parameter Summary'),
    ps: [
      L(
        `Laporan ini dibuat otomatis dari data yang diunggah (${loaded}) melalui alur Forecasting, MPS, MRP, dan Scheduling. Setiap angka dapat ditelusuri kembali pada menu masing-masing, dan semua perhitungan memakai parameter di tabel berikut.`,
        `This report was generated automatically from the uploaded data (${loaded}) through the Forecasting, MPS, MRP, and Scheduling flow. Every figure can be traced back in its own menu, and all calculations use the parameters in the table below.`
      ),
    ],
    ts: [
      {
        h: ['Parameter', L('Nilai', 'Value')],
        r: [
          [L('Horizon peramalan', 'Forecast horizon'), ctx.H ? ctx.H + ' ' + L('periode', 'periods') : '-'],
          ['Lot sizing', ctx.lm],
          [L('Default setup (S) / holding (H)', 'Default setup (S) / holding (H)'), $('lh').value && `${$('ls').value} / ${$('lh').value}`],
          [L('Aturan prioritas', 'Priority rule'), ctx.ru],
          [L('Jam kerja per periode', 'Work hours per period'), $('cap').value],
          [L('Sumber job', 'Job source'), S.useF ? 'File Jobs' : 'MRP'],
        ],
      },
    ],
  };
}

// ======================================================================
// 6b. BAGIAN: forecasting
// ======================================================================

/**
 * report/sections/forecast.js
 * Bagian laporan: Forecasting.
 */

export function forecastSection(ctx) {
  if (!S.fc) return null;

  const { met, best, b, n } = S.fc;
  const st = forecastStats(S.fc, D.hist.v);
  const { ranked: ks, runnerUp: r, gap, mape: mp, fut, last, avg, chg } = st;
  const H = ctx.H;
  const sg = [];

  const why = {
    LR: L(
      `data memiliki tren ${b >= 0 ? 'naik' : 'turun'} yang cukup konsisten, dan hanya regresi linear yang memodelkan tren itu secara eksplisit`,
      `the data shows a fairly consistent ${b >= 0 ? 'upward' : 'downward'} trend, and only linear regression models that trend explicitly`
    ),
    WMA: L(
      'permintaan lebih ditentukan kondisi terbaru, sehingga bobot 0,5 pada periode terakhir membuat ramalan menyesuaikan lebih cepat daripada MA3',
      'demand is driven by recent conditions, so the 0.5 weight on the latest period adapts faster than MA3'
    ),
    MA3: L(
      'permintaan berfluktuasi di sekitar level yang relatif tetap, sehingga rata-rata 3 periode sudah cukup meredam fluktuasi acak',
      'demand fluctuates around a fairly stable level, so a 3-period average is enough to smooth random noise'
    ),
    ES: L(
      'pola permintaan berubah bertahap, sehingga penghalusan eksponensial yang memakai seluruh data dengan bobot menurun paling sesuai',
      'demand shifts gradually, so exponential smoothing, which uses all data with decaying weights, fits best'
    ),
  }[best];

  if (mp >= 20)
    sg.push(L('MAPE di atas 20%: tambah data historis atau periksa faktor musiman dan promosi yang belum dimodelkan.', 'MAPE is above 20%: add more history or check seasonality and promotions that are not yet modeled.'));
  if (n < 12)
    sg.push(L(`Data baru ${n} periode; 12–24 periode membuat pemilihan metode lebih andal.`, `Only ${n} periods of data; 12–24 periods make method selection more reliable.`));
  if (best === 'LR' && H > 6)
    sg.push(L('Ekstrapolasi tren makin tidak pasti untuk horizon panjang; perbarui ramalan setiap ada data aktual baru.', 'Trend extrapolation grows less certain over long horizons; refresh the forecast whenever new actuals arrive.'));
  if (gap < 5)
    sg.push(L(`Selisih dengan ${r} hanya ${f(gap)}%, sehingga metode yang lebih sederhana juga layak dipakai.`, `The gap to ${r} is only ${f(gap)}%, so the simpler method is also acceptable.`));
  if (!sg.length)
    sg.push(L('Akurasi sudah memadai; pantau error tiap ada data aktual baru.', 'Accuracy is adequate; monitor the error whenever new actuals arrive.'));

  ctx.cl.push(
    L(
      `peramalan memakai ${best} (MAPE ${f(mp)}%, rata-rata ${f(avg)} unit per periode)`,
      `forecasting uses ${best} (MAPE ${f(mp)}%, average ${f(avg)} units per period)`
    )
  );

  return {
    h: ctx.T('Forecasting', 'Forecasting'),
    ps: [
      L(
        `Empat metode diuji pada ${n} periode data historis: ${ks.map((k) => `${k} (MAD ${f(met[k].mad)})`).join(', ')}. Metode <b>${best}</b> terpilih karena MAD-nya paling kecil, yaitu ${f(gap)}% lebih akurat daripada peringkat kedua (${r}). Semua metode dinilai pada rentang periode yang sama (periode ke-4 dan seterusnya) agar perbandingannya adil.`,
        `Four methods were tested on ${n} periods of historical data: ${ks.map((k) => `${k} (MAD ${f(met[k].mad)})`).join(', ')}. <b>${best}</b> was selected because it has the lowest MAD, ${f(gap)}% more accurate than the runner-up (${r}). All methods were evaluated on the same window (period 4 onward) for a fair comparison.`
      ),
      L(
        `Interpretasi: ${why}. MAPE ${f(mp)}% berarti ramalan rata-rata meleset ${f(mp)}% dari kenyataan, tergolong ${accuracyLabel(mp)}. Garis tren data historis ${b >= 0 ? 'naik' : 'turun'} sekitar ${f(Math.abs(b), 1)} unit per periode.`,
        `Interpretation: ${why}. A MAPE of ${f(mp)}% means forecasts miss reality by ${f(mp)}% on average, which is ${accuracyLabel(mp)}. The historical trend line goes ${b >= 0 ? 'up' : 'down'} by about ${f(Math.abs(b), 1)} units per period.`
      ),
      L(
        `Untuk ${H} periode ke depan, ramalan berkisar ${f(Math.min(...fut))}–${f(Math.max(...fut))} unit (rata-rata ${f(avg)}), ${chg >= 0 ? 'naik' : 'turun'} ${f(Math.abs(chg))}% dibanding rata-rata 3 periode terakhir (${f(last)}). Angka ini menjadi kebutuhan kotor pada MPS, sehingga kesalahan ramalan akan terbawa ke rencana produksi dan pemesanan bahan.`,
        `For the next ${H} periods the forecast ranges ${f(Math.min(...fut))}–${f(Math.max(...fut))} units (average ${f(avg)}), ${chg >= 0 ? 'up' : 'down'} ${f(Math.abs(chg))}% versus the last 3 periods' average (${f(last)}). This becomes the gross requirement in the MPS, so forecast errors carry into production and material ordering plans.`
      ),
    ],
    ts: [
      {
        c: L('Perbandingan error metode', 'Method error comparison'),
        h: ['Method', 'MAD', 'MSE', 'MAPE (%)'],
        r: ks.map((k) => [k, f(met[k].mad), f(met[k].mse), f(met[k].mape)]),
      },
    ],
    img: 'fc',
    sg,
  };
}

// ======================================================================
// 6c. BAGIAN: MPS
// ======================================================================

/**
 * report/sections/mps.js
 * Bagian laporan: MPS.
 */

export function mpsSection(ctx) {
  if (!S.mps) return null;

  const m = S.mps;
  const H = ctx.H;
  const lm = ctx.lm;
  const totalDemand = sum(m.gr);
  const totalReceipt = sum(m.rc);
  const avg = totalDemand / H;
  const firstShort = m.net.findIndex((x) => x > 0);
  const endPab = m.pab[H - 1];
  const o = S.oc(S.end);
  const iv = D.inv[S.end] || { lot: 0 };
  const cur = m.cost.total;
  const hasCost = o.S && o.H;
  const ranking = compareLotSizing(m, { ...o, lot: iv.lot });
  const better = hasCost && ranking[0].t < cur - 1e-9;
  const saving = f((100 * (cur - ranking[0].t)) / cur);
  const sg = [];

  const stock =
    firstShort < 0
      ? L('cukup untuk seluruh periode', 'covers all periods')
      : firstShort === 0
        ? L('tidak cukup bahkan untuk periode pertama', 'is short even in the first period')
        : L(`cukup sampai ${S.fl[firstShort - 1]}`, `lasts through ${S.fl[firstShort - 1]}`);

  if (m.late > 0)
    sg.push(L(`${m.late} unit harus dirilis sebelum periode 1: ekspedisi order, persingkat lead time, atau tambah stok pengaman.`, `${m.late} units must be released before period 1: expedite orders, shorten lead time, or add safety stock.`));
  if (better)
    sg.push(L(`Pindah ke ${ranking[0].k} menurunkan biaya dari ${f(cur)} menjadi ${f(ranking[0].t)} (hemat ${saving}%).`, `Switching to ${ranking[0].k} cuts cost from ${f(cur)} to ${f(ranking[0].t)} (saving ${saving}%).`));
  if (!hasCost)
    sg.push(L('Isi biaya setup dan simpan agar perbandingan lot sizing bermakna.', 'Enter setup and holding costs so the lot-sizing comparison is meaningful.'));
  if (totalReceipt > 0 && endPab > avg)
    sg.push(L(`Stok akhir ${endPab} melebihi kebutuhan satu periode: kecilkan ukuran lot.`, `Ending stock ${endPab} exceeds one period of demand: reduce lot size.`));
  if (!sg.length)
    sg.push(L('Rencana layak dijalankan; lanjutkan ke kebutuhan komponen.', 'The plan is feasible; continue to component requirements.'));

  ctx.cl.push(
    L(
      `MPS membutuhkan ${m.cost.n} order ${S.end}${m.late ? ` dengan ${m.late} unit terlambat dirilis` : ''}`,
      `the MPS needs ${m.cost.n} orders of ${S.end}${m.late ? ` with ${m.late} units released late` : ''}`
    )
  );
  if (m.late)
    ctx.act.push(L(`Atasi ${m.late} unit ${S.end} yang harus dirilis sebelum periode 1 (ekspedisi, lead time lebih pendek, atau stok pengaman).`, `Resolve the ${m.late} units of ${S.end} that must be released before period 1 (expedite, shorter lead time, or safety stock).`));
  if (better)
    ctx.act.push(L(`Gunakan lot sizing ${ranking[0].k} untuk ${S.end} agar biaya turun ${saving}%.`, `Use ${ranking[0].k} lot sizing for ${S.end} to cut cost by ${saving}%.`));

  return {
    h: ctx.T('MPS (Master Production Schedule)', 'MPS (Master Production Schedule)'),
    ps: [
      L(
        `Total kebutuhan produk jadi <b>${S.end}</b> adalah ${totalDemand} unit selama ${H} periode (rata-rata ${f(avg)} per periode). Stok awal ${m.oh} unit ${stock}, dengan lead time ${m.lt} periode.`,
        `Total demand for the end item <b>${S.end}</b> is ${totalDemand} units over ${H} periods (average ${f(avg)} per period). Opening stock of ${m.oh} units ${stock}, with a lead time of ${m.lt} period(s).`
      ),
      L(
        `Rencana berisi ${m.cost.n} order dengan total planned receipt ${totalReceipt} unit dan stok akhir (PAB) ${endPab} unit. Planned order release adalah receipt yang digeser mundur sebesar lead time, sehingga itulah saat produksi harus dimulai.`,
        `The plan has ${m.cost.n} orders with total planned receipts of ${totalReceipt} units and an ending stock (PAB) of ${endPab} units. Planned order release is the receipt shifted back by the lead time, so it is when production must start.`
      ),
      ...(hasCost
        ? [
            L(
              `Dengan lot sizing ${lm}, biaya total ${f(cur)} (setup ${f(m.cost.setup)} + simpan ${f(m.cost.hold)}). Perbandingan metode: ${ranking.map((c) => c.k + ' ' + f(c.t)).join(', ')}. ${better ? `Metode ${ranking[0].k} paling murah.` : 'Metode terpilih sudah yang termurah.'}`,
              `With ${lm} lot sizing the total cost is ${f(cur)} (setup ${f(m.cost.setup)} + holding ${f(m.cost.hold)}). Method comparison: ${ranking.map((c) => c.k + ' ' + f(c.t)).join(', ')}. ${better ? `${ranking[0].k} is the cheapest.` : 'The selected method is already the cheapest.'}`
            ),
          ]
        : []),
      ...(m.late
        ? [
            L(
              `${m.late} unit harus dirilis sebelum periode 1. Artinya, dengan lead time ${m.lt} periode dan stok awal saat ini, kekurangan pada periode awal tidak mungkin terpenuhi tepat waktu kecuali ada order yang sudah berjalan (scheduled receipt).`,
              `${m.late} units must be released before period 1. With a lead time of ${m.lt} period(s) and the current opening stock, early shortages cannot be met on time unless an order is already in progress (scheduled receipt).`
            ),
          ]
        : []),
    ],
    ts: [{ h: [S.end, ...S.fl], r: rows5(m) }],
    sg,
  };
}

// ======================================================================
// 6d. BAGIAN: MRP
// ======================================================================

/**
 * report/sections/mrp.js
 * Bagian laporan: MRP.
 */

export function mrpSection(ctx) {
  if (!S.mrp || !D.bom.length) return null;
  const M = S.mrp;
  if (!M.length) return null;

  const total = (x) => x.rl.reduce((a, c) => a + c, 0);
  const maxLevel = Math.max(...M.map((x) => x.lv));
  const biggest = [...M].sort((a, b) => total(b) - total(a))[0];
  const longestLt = [...M].sort((a, b) => b.lt - a.lt)[0];
  const late = M.filter((x) => x.late > 0).map((x) => x.c);
  const miss = M.filter((x) => x.miss).map((x) => x.c);
  const first = M.filter((x) => x.rl.some((v) => v > 0))
    .map((x) => ({ c: x.c, t: x.rl.findIndex((v) => v > 0) }))
    .sort((a, b) => a.t - b.t)[0];
  const ct = costTable();
  const top = [...ct.A].sort((a, b) => b.p.cost.total - a.p.cost.total)[0];
  const sg = [];

  if (late.length)
    sg.push(L(`${late.join(', ')} harus dirilis sebelum periode 1: ekspedisi atau cari pemasok yang lebih cepat.`, `${late.join(', ')} must be released before period 1: expedite or find faster suppliers.`));
  if (miss.length) sg.push(L(`Lengkapi data Inventory untuk ${miss.join(', ')}.`, `Complete Inventory data for ${miss.join(', ')}.`));
  if (longestLt.lt >= 2)
    sg.push(L(`Pesan ${longestLt.c} paling awal (lead time ${longestLt.lt} periode) dan siapkan pemasok cadangan.`, `Order ${longestLt.c} first (lead time ${longestLt.lt} periods) and line up a backup supplier.`));
  if (ct.tot > 0)
    sg.push(L(`Biaya terbesar ada pada ${top.c} (${f(top.p.cost.total)}); tinjau ukuran lot dan biaya setupnya.`, `The largest cost is ${top.c} (${f(top.p.cost.total)}); review its lot size and setup cost.`));

  ctx.cl.push(
    L(
      `MRP meledakkan ${M.length} komponen dengan total biaya rencana ${f(ct.tot)}`,
      `MRP explodes ${M.length} components with a total plan cost of ${f(ct.tot)}`
    )
  );
  if (late.length)
    ctx.act.push(L(`Percepat order komponen ${late.join(', ')} yang jatuh sebelum periode 1.`, `Expedite the orders for components ${late.join(', ')} that fall before period 1.`));

  return {
    h: ctx.T('MRP (Material Requirements Planning)', 'MRP (Material Requirements Planning)'),
    ps: [
      L(
        `BOM produk ${S.end} meledak menjadi ${M.length} komponen pada ${maxLevel} level (${M.map((x) => x.c).join(', ')}). Kebutuhan komponen dihitung dari planned order release induknya dikali Qty BOM, lalu dikurangi stok dan scheduled receipt milik komponen itu sendiri.`,
        `The BOM of ${S.end} explodes into ${M.length} components across ${maxLevel} level(s) (${M.map((x) => x.c).join(', ')}). Component requirements come from the parent's planned order release times the BOM Qty, less the component's own stock and scheduled receipts.`
      ),
      L(
        `Order terbesar adalah ${biggest.c} (${total(biggest)} unit) dan lead time terpanjang adalah ${longestLt.c} (${longestLt.lt} periode), sehingga komponen ini menentukan kapan pemesanan harus dimulai. ${first ? `Order komponen pertama harus dirilis pada ${S.fl[first.t]} (${first.c}).` : ''}`,
        `The largest order is ${biggest.c} (${total(biggest)} units) and the longest lead time is ${longestLt.c} (${longestLt.lt} periods), so these set when ordering must start. ${first ? `The first component order must be released in ${S.fl[first.t]} (${first.c}).` : ''}`
      ),
      late.length
        ? L(
            `Komponen ${late.join(', ')} memiliki order yang harus dirilis sebelum periode 1. Hal ini terjadi karena kekurangan pada produk induk di periode awal diteruskan ke komponen, sementara lead time komponen membuatnya tidak mungkin tiba tepat waktu.`,
            `Components ${late.join(', ')} have orders that must be released before period 1. Early shortfalls in the parent are passed down to its components, and the component lead times make on-time arrival impossible.`
          )
        : L(
            'Seluruh order komponen dapat dirilis mulai periode 1, sehingga kebutuhan dapat dipenuhi tepat waktu.',
            'All component orders can be released from period 1 onward, so requirements can be met on time.'
          ),
      L(
        `Total biaya rencana (produk jadi dan komponen) adalah ${f(ct.tot)}; kontributor terbesar ${top.c} (${f(top.p.cost.total)}, ${f((100 * top.p.cost.total) / (ct.tot || 1), 0)}% dari total).`,
        `The total plan cost (end item and components) is ${f(ct.tot)}; the largest contributor is ${top.c} (${f(top.p.cost.total)}, ${f((100 * top.p.cost.total) / (ct.tot || 1), 0)}% of the total).`
      ),
    ],
    ts: [
      { c: L('Ringkasan biaya per item', 'Cost summary per item'), h: ct.h, r: ct.r },
      { c: L('Planned order release komponen', 'Component planned order release'), h: ['Item', ...S.fl], r: M.map((x) => [x.c, ...x.rl]) },
    ],
    sg,
  };
}

// ======================================================================
// 6e. BAGIAN: scheduling & Johnson
// ======================================================================

/**
 * report/sections/scheduling.js
 * Bagian laporan: Scheduling (aturan prioritas) dan Johnson's rule.
 */

export function schedulingSection(ctx) {
  if (!(S.jobs && S.jobs.length && S.U)) return null;

  const J = S.jobs;
  const U = S.U;
  const ru = ctx.ru;
  const cmp = compareRules(S.mkJ);
  const cur = cmp.find((c) => c.r === ru);
  const names = (k) => cmp.filter((c) => isBest(cmp, c, k)).map((c) => c.r).join('/');
  const bestTardRule = cmp.find((c) => isBest(cmp, c, 'T')).r;
  const avgUtil = U.reduce((a, x) => a + x.u, 0) / U.length;
  const busiest = [...U].sort((a, b) => b.u - a.u)[0];
  const mostIdle = [...U].sort((a, b) => b.idle - a.idle)[0];
  const lowest = [...U].sort((a, b) => a.u - b.u)[0];
  const sg = [];

  if (cur.T > minMetric(cmp, 'T') + 1e-9)
    sg.push(L(`Ganti ${ru} ke ${bestTardRule}: total tardiness ${f(cur.T)} menjadi ${f(minMetric(cmp, 'T'))}.`, `Switch ${ru} to ${bestTardRule}: total tardiness ${f(cur.T)} to ${f(minMetric(cmp, 'T'))}.`));
  else if (cur.n)
    sg.push(L(`${cur.n} job tetap terlambat: tambah lembur atau kapasitas di ${busiest.m}.`, `${cur.n} jobs stay late: add overtime or capacity at ${busiest.m}.`));
  if (busiest.u >= 85)
    sg.push(L(`${busiest.m} adalah bottleneck (${f(busiest.u, 0)}%): pertimbangkan lembur, mesin tambahan, atau subkontrak.`, `${busiest.m} is the bottleneck (${f(busiest.u, 0)}%): consider overtime, an extra machine, or subcontracting.`));
  if (U.length > 1 && lowest.u < 50)
    sg.push(L(`${lowest.m} menganggur ${f(lowest.idle, 1)} (${f(100 - lowest.u, 0)}% waktu): seimbangkan beban dari ${busiest.m}.`, `${lowest.m} idles ${f(lowest.idle, 1)} (${f(100 - lowest.u, 0)}% of the time): rebalance load from ${busiest.m}.`));
  if (!sg.length)
    sg.push(L('Semua job tepat waktu dengan beban seimbang; jadwal layak dijalankan.', 'All jobs are on time with balanced load; the schedule is ready to run.'));

  ctx.cl.push(
    L(
      `penjadwalan ${ru} menghasilkan makespan ${f(cur.mk)} dengan ${cur.n} dari ${J.length} job terlambat`,
      `${ru} scheduling gives a makespan of ${f(cur.mk)} with ${cur.n} of ${J.length} jobs late`
    )
  );
  if (cur.T > minMetric(cmp, 'T') + 1e-9)
    ctx.act.push(L(`Pakai aturan ${bestTardRule} untuk menekan total tardiness (${f(cur.T)} menjadi ${f(minMetric(cmp, 'T'))}).`, `Use ${bestTardRule} to reduce total tardiness (${f(cur.T)} to ${f(minMetric(cmp, 'T'))}).`));
  else if (busiest.u >= 85)
    ctx.act.push(L(`Tambah kapasitas di ${busiest.m} yang menjadi bottleneck.`, `Add capacity at ${busiest.m}, the bottleneck.`));

  return {
    h: ctx.T('Scheduling', 'Scheduling'),
    ps: [
      L(
        `Job berasal dari ${S.useF ? 'file Jobs (satu mesin)' : 'planned order release MRP'} dan diurutkan dengan aturan <b>${ru}</b>: ${J.length} job pada ${U.length} mesin.`,
        `Jobs come from ${S.useF ? 'the Jobs file (single machine)' : 'the MRP planned order releases'} and are sequenced with the <b>${ru}</b> rule: ${J.length} jobs on ${U.length} machine(s).`
      ),
      L(
        `Hasilnya makespan ${f(cur.mk)}, ${cur.n} dari ${J.length} job terlambat, total tardiness ${f(cur.T)}, weighted tardiness ${f(cur.WT)}, dan rata-rata flow time ${f(cur.F)}. Flow time adalah lamanya job berada di sistem, sedangkan tardiness mengukur keterlambatan terhadap due date.`,
        `The result is a makespan of ${f(cur.mk)}, ${cur.n} of ${J.length} jobs late, total tardiness ${f(cur.T)}, weighted tardiness ${f(cur.WT)}, and an average flow time of ${f(cur.F)}. Flow time is how long a job stays in the system, while tardiness measures lateness against the due date.`
      ),
      L(
        `Utilisasi mesin rata-rata ${f(avgUtil, 0)}%. Mesin tersibuk ${busiest.m} (${f(busiest.u, 0)}%) dan idle terbesar ${mostIdle.m} (${f(mostIdle.idle, 1)} satuan waktu). Idle adalah makespan dikurangi waktu kerja mesin; utilisasi di atas 85% menandakan bottleneck, sedangkan yang rendah menandakan kapasitas belum termanfaatkan.`,
        `Average machine utilization is ${f(avgUtil, 0)}%. The busiest machine is ${busiest.m} (${f(busiest.u, 0)}%) and the largest idle is ${mostIdle.m} (${f(mostIdle.idle, 1)} time units). Idle is makespan minus machine busy time; utilization above 85% signals a bottleneck, while low utilization means unused capacity.`
      ),
      L(
        `Dari lima aturan, total tardiness terkecil dicapai ${names('T')}, rata-rata flow time terkecil ${names('F')}, dan weighted tardiness terkecil ${names('WT')}. Tidak ada satu aturan yang unggul di semua ukuran, jadi pilihannya bergantung pada prioritas: ketepatan waktu atau kecepatan aliran.`,
        `Of the five rules, ${names('T')} gives the lowest total tardiness, ${names('F')} the lowest average flow time, and ${names('WT')} the lowest weighted tardiness. No single rule wins every measure, so the choice depends on priorities: on-time delivery or flow speed.`
      ),
    ],
    ts: [
      {
        c: L('Jadwal job', 'Job schedule'),
        h: ['#', 'Job', L('Mesin', 'Machine'), L('Datang', 'Arrival'), 'Proc', 'W', 'Due', 'Start', 'Completion', 'Flow', 'Earliness', 'Tardiness', 'W. Tard.'],
        r: J.map((j, i) => [i + 1, j.id, j.ops.map((p) => p.m).join('->'), f(j.arr), f(j.tot), j.w, f(j.due), f(j.st), f(j.C), f(j.F), f(j.E), f(j.T), f(j.WT)]),
      },
      {
        c: L('Utilisasi dan idle mesin', 'Machine utilization and idle'),
        h: [L('Mesin', 'Machine'), L('Waktu kerja', 'Busy time'), 'Idle', L('Utilisasi (%)', 'Utilization (%)')],
        r: U.map((x) => [x.m, f(x.busy), f(x.idle), f(x.u, 1)]),
      },
      {
        c: L('Perbandingan aturan prioritas', 'Priority rule comparison'),
        h: [L('Aturan', 'Rule'), 'Makespan', 'Sum Tardiness', L('Terlambat', 'Late'), L('Rata2 Flow', 'Avg Flow'), 'Sum W. Tard.'],
        r: cmp.map((c) => [c.r, f(c.mk), f(c.T), c.n, f(c.F), f(c.WT)]),
      },
    ],
    img: 'gc',
    sg,
  };
}

export function johnsonSection(ctx) {
  if (!S.jj) return null;

  const R = S.jj;
  const mk = R[R.length - 1].eb;
  const inputOrder = flowShopMakespan(D.j2);
  const [A, B] = johnsonUtilization(R);
  const sg = [];

  if (B.u < 70)
    sg.push(L(`Mesin B menganggur ${f(B.idle, 1)} karena menunggu A: tambah kapasitas A atau pecah batch.`, `Machine B idles ${f(B.idle, 1)} waiting for A: add capacity at A or split batches.`));
  if (A.u < 70)
    sg.push(L(`Mesin A menganggur ${f(A.idle, 1)}: kurangi waktu proses di B.`, `Machine A idles ${f(A.idle, 1)}: shorten processing time at B.`));
  sg.push(L('Urutan Johnson meminimalkan makespan untuk dua mesin; gunakan sebagai jadwal.', "Johnson's sequence minimizes makespan for two machines; use it as the schedule."));

  ctx.cl.push(L(`urutan Johnson memberi makespan ${mk}`, `the Johnson sequence gives a makespan of ${mk}`));

  return {
    h: ctx.T("Johnson's Rule (2 Mesin)", "Johnson's Rule (2 Machines)"),
    ps: [
      L(
        `Urutan Johnson <b>${R.map((r) => r.id).join(' → ')}</b> menghasilkan makespan ${mk}, sedangkan urutan sesuai input memakan ${inputOrder}${inputOrder > mk ? ` sehingga menghemat ${inputOrder - mk} satuan waktu (${f((100 * (inputOrder - mk)) / inputOrder)}%)` : ''}.`,
        `The Johnson sequence <b>${R.map((r) => r.id).join(' → ')}</b> gives a makespan of ${mk}, whereas the input order takes ${inputOrder}${inputOrder > mk ? `, saving ${inputOrder - mk} time units (${f((100 * (inputOrder - mk)) / inputOrder)}%)` : ''}.`
      ),
      L(
        `Utilisasi mesin A ${f(A.u, 0)}% dan mesin B ${f(B.u, 0)}%. Mesin dengan utilisasi lebih rendah banyak menunggu mesin lainnya.`,
        `Machine A utilization is ${f(A.u, 0)}% and machine B ${f(B.u, 0)}%. The machine with lower utilization spends more time waiting for the other.`
      ),
    ],
    ts: [{ h: ['Job', 'A', 'B', 'Start A', 'End A', 'Start B', 'End B'], r: R.map((r) => [r.id, r.a, r.b, r.sa, r.ea, r.sb, r.eb]) }],
    img: 'gj',
    sg,
  };
}

// ======================================================================
// 6f. BAGIAN: kesimpulan
// ======================================================================

/**
 * report/sections/conclusion.js
 * Bagian terakhir laporan: kesimpulan akhir & rekomendasi.
 * Harus dipanggil terakhir karena memakai ctx.cl dan ctx.act dari bagian lain.
 */

export function conclusionSection(ctx) {
  return {
    h: ctx.T('Kesimpulan Akhir dan Rekomendasi', 'Final Conclusion and Recommendations'),
    ps: [
      ctx.cl.length
        ? L(
            `Secara keseluruhan: ${ctx.cl.join('; ')}. Setiap tahap saling terhubung, sehingga perbaikan di tahap awal (misalnya akurasi ramalan atau stok awal) akan memengaruhi seluruh rencana sesudahnya.`,
            `Overall: ${ctx.cl.join('; ')}. The stages are linked, so improvements early on (for example forecast accuracy or opening stock) affect every plan that follows.`
          )
        : L('Belum ada hasil yang dapat diringkas. Unggah data terlebih dahulu.', 'There are no results to summarize yet. Upload data first.'),
    ],
    sg: ctx.act.length
      ? ctx.act.slice(0, 5)
      : [L('Seluruh tahap layak dijalankan tanpa tindakan perbaikan mendesak.', 'All stages are feasible with no urgent corrective action.')],
  };
}

// ======================================================================
// 6g. PENYUSUN laporan
// ======================================================================

/**
 * report/builder.js
 * Menyusun seluruh bagian laporan menjadi array section:
 *   { h: judul, ps: [paragraf HTML], ts: [{c?, h, r}], img?: key grafik, sg?: [saran] }
 * Dipakai bersama oleh tampilan HTML (view.js) dan ekspor PDF (pdf.js).
 */

export function buildReport() {
  let counter = 0;
  const ctx = {
    H: S.H,
    lm: $('lm').value,
    ru: $('rule').value,
    cl: [], //  kalimat ringkasan tiap tahap (untuk kesimpulan akhir)
    act: [], // tindakan prioritas (untuk rekomendasi akhir)
    T: (id, en) => `${++counter}. ${L(id, en)}`, // penomoran judul bagian
  };

  // urutan penting: nomor bagian & ctx.cl/act diisi berurutan
  return [
    summarySection,
    forecastSection,
    mpsSection,
    mrpSection,
    schedulingSection,
    johnsonSection,
    conclusionSection,
  ]
    .map((build) => build(ctx))
    .filter(Boolean);
}

// ======================================================================
// 6h. TAMPILAN laporan di layar
// ======================================================================

/**
 * report/view.js
 * Halaman 6: tampilan laporan di layar (kertas putih).
 */

export function renderReport() {
  const o = $('rpo');
  if (!S.fc && !S.jobs && !S.jj) {
    o.innerHTML = need(L('Belum ada hasil. Unggah data terlebih dahulu.', 'No results yet. Upload data first.'));
    return;
  }

  const body = buildReport()
    .map((x) => {
      const paragraphs = x.ps.map((t) => `<p>${t}</p>`).join('');
      const tables = (x.ts || []).map((t) => (t.c ? `<p><b>${t.c}</b></p>` : '') + tb(t.h, t.r)).join('');
      const url = x.img ? chartToImage(x.img) : null;
      const image = url ? `<img src="${url}" style="max-width:100%">` : '';
      const suggestions =
        x.sg && x.sg.length
          ? `<p><b>💡 ${L('Saran', 'Suggestions')}</b></p><ul style="margin:0 0 0 18px">${x.sg.map((g) => `<li>${g}</li>`).join('')}</ul>`
          : '';
      return `<h3>${x.h}</h3>${paragraphs}${tables}${image}${suggestions}`;
    })
    .join('');

  o.innerHTML = `<div class="paper"><h2 style="color:#111;font-size:22px">PPIC Report</h2>${body}</div>`;
}

// ======================================================================
// 6i. UNDUH PDF
// ======================================================================

/**
 * report/pdf.js
 * Ekspor laporan ke PDF memakai jsPDF + autoTable (global window.jspdf).
 */

const MARGIN = 40;
const CONTENT_W = 515; // A4 595pt - 2 * margin
const PAGE_BOTTOM = 800;
const ORANGE = [180, 71, 14];

export function downloadPdf() {
  const lib = window.jspdf;
  if (!lib || !lib.jsPDF) {
    alert(L('Library PDF belum termuat (perlu koneksi internet).', 'The PDF library has not loaded (internet connection required).'));
    return;
  }

  const doc = new lib.jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (limit) => {
    if (y > limit) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (t, size, style, color) => {
    doc.setFont('helvetica', style || 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(color || [35, 35, 35]));
    doc.splitTextToSize(pdfText(t), CONTENT_W).forEach((line) => {
      ensureSpace(PAGE_BOTTOM);
      doc.text(line, MARGIN, y);
      y += size * 1.4;
    });
    y += 3;
  };

  text('PPIC Report', 20, 'bold', ORANGE);
  text(new Date().toLocaleString(), 9);
  y += 6;

  buildReport().forEach((x) => {
    ensureSpace(740);
    text(x.h, 14, 'bold', ORANGE);
    x.ps.forEach((t) => text(t, 10));

    (x.ts || []).forEach((t) => {
      if (t.c) text(t.c, 10, 'bold');
      doc.autoTable({
        startY: y,
        head: [t.h.map(pdfText)],
        body: t.r.map((r) => r.map(pdfText)),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [226, 113, 29] },
      });
      y = doc.lastAutoTable.finalY + 10;
    });

    if (x.img) {
      const url = chartToImage(x.img);
      if (url) {
        const h = (CONTENT_W * CH[x.img]) / 900;
        if (y + h > PAGE_BOTTOM) {
          doc.addPage();
          y = MARGIN;
        }
        doc.addImage(url, 'PNG', MARGIN, y, CONTENT_W, h);
        y += h + 10;
      }
    }

    if (x.sg && x.sg.length) {
      text(L('Saran', 'Suggestions') + ':', 10, 'bold');
      x.sg.forEach((g) => text('- ' + g, 10));
    }
    y += 8;
  });

  doc.save('PPIC_Report.pdf');
}
