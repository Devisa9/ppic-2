/**
 * MENU 3 – MPS
 * core  : plan() (GR→PAB→Net→Receipt/Release) + lot sizing L4L/FOQ/EOQ/POQ/PPB
 * shared: tabel & biaya yang juga dipakai menu MRP
 * view  : tampilan menu MPS
 */

import { D, S, $, tb, al, need, an, L, f, sum, has } from './common.js';

// ======================================================================
// 3a. PERHITUNGAN MPS & lot sizing
// ======================================================================

/**
 * core/lotsizing.js  (logika murni, tanpa DOM)
 * Perencanaan satu item: Gross Req -> PAB -> Net Req -> Planned Receipt/Release.
 * Teknik lot sizing: L4L, FOQ, EOQ, POQ, PPB.
 */

/**
 * @param {number[]} g   gross requirement per periode
 * @param {number} oh    on hand awal
 * @param {number} lt    lead time (periode)
 * @param {number[]} [sr] scheduled receipt per periode
 * @param {{m:string,S:number,H:number,lot?:number}} [o] opsi lot sizing
 */
export function plan(g, oh, lt, sr, o) {
  o = o || { m: 'L4L', S: 0, H: 0 };
  const n = g.length;
  sr = sr || Array(n).fill(0);

  let p = oh; // PAB periode sebelumnya
  let late = 0; // unit yang harus dirilis sebelum periode 1
  let orders = 0;
  let avg = 0; // akumulasi persediaan rata-rata
  const pab = [];
  const net = [];
  const rc = Array(n).fill(0); // planned order receipt
  const rl = Array(n).fill(0); // planned order release

  const meanDemand = g.reduce((a, b) => a + b, 0) / n;
  const raw = o.H > 0 && meanDemand > 0 ? Math.sqrt((2 * meanDemand * o.S) / o.H) : 0;
  const eoq = Math.max(1, Math.round(raw));
  const T = Math.max(1, Math.round(meanDemand > 0 ? raw / meanDemand : 1)); // interval POQ
  const epp = o.H > 0 ? o.S / o.H : 0; // Economic Part Period
  const netOf = (k) => Math.max(0, g[k] - sr[k]);

  g.forEach((x, t) => {
    const available = p + sr[t];
    const nr = Math.max(0, x - available);
    let q = 0;

    if (nr > 0) {
      q = nr;
      const m = o.m;
      if (m === 'FOQ' && o.lot > 0) {
        q = Math.ceil(nr / o.lot) * o.lot;
      } else if (m === 'EOQ') {
        q = Math.ceil(nr / eoq) * eoq;
      } else if (m === 'POQ') {
        for (let k = t + 1; k < Math.min(n, t + T); k++) q += netOf(k);
      } else if (m === 'PPB') {
        let c = 0;
        for (let k = t + 1; k < n; k++) {
          c += netOf(k) * (k - t);
          if (c > epp) break;
          q += netOf(k);
        }
      }
      orders++;
      rc[t] = q;
      if (t - lt < 0) {
        late += q;
        rl[0] += q;
      } else {
        rl[t - lt] += q;
      }
    }

    const e = available + q - x;
    avg += (p + e) / 2;
    p = e;
    pab.push(e);
    net.push(nr);
  });

  return {
    gr: g,
    sr,
    pab,
    net,
    rc,
    rl,
    late,
    eoq,
    T,
    epp,
    cost: {
      n: orders,
      setup: orders * o.S,
      hold: avg * o.H,
      total: orders * o.S + avg * o.H,
    },
  };
}

/**
 * Bandingkan biaya total semua teknik lot sizing untuk satu rencana.
 * FOQ hanya ikut jika `o.lot` > 0. Hasil diurutkan dari termurah.
 * @param {{gr:number[],oh:number,lt:number,sr:number[]}} m
 * @param {{S:number,H:number,lot:number}} o
 */
export function compareLotSizing(m, o) {
  const methods = ['L4L', ...(o.lot > 0 ? ['FOQ'] : []), 'EOQ', 'POQ', 'PPB'];
  return methods
    .map((k) => ({ k, t: plan(m.gr, m.oh, m.lt, m.sr, { ...o, m: k }).cost.total }))
    .sort((a, b) => a.t - b.t);
}

// ======================================================================
// 3b. TABEL & BIAYA (dipakai juga oleh MRP)
// ======================================================================

/**
 * views/shared.js
 * Potongan tampilan yang dipakai lebih dari satu halaman (MPS, MRP, laporan).
 */

/** 6 baris tabel MRP standar untuk satu item. */
export const rows5 = (p) =>
  [
    ['Gross Requirement', p.gr],
    ['Scheduled Receipt', p.sr],
    ['Projected Available Balance (PAB)', p.pab],
    ['Net Requirement', p.net],
    ['Planned Order Receipt', p.rc],
    ['Planned Order Release', p.rl],
  ].map(([name, vals], i) => [
    name,
    ...vals.map((x) =>
      i === 5 && x > 0 ? `<span class="hl">${x}</span>` : i === 3 && x > 0 ? `<span class="r">${x}</span>` : x
    ),
  ]);

/** Baris ringkasan biaya di bawah tabel rencana. */
export const costLine = (p) => {
  const m = $('lm').value;
  const extra =
    m === 'EOQ'
      ? ` · EOQ = ${p.eoq}`
      : m === 'POQ'
        ? ` · EOQ = ${p.eoq}, T = ${p.T}`
        : m === 'PPB'
          ? ` · EPP = ${f(p.epp)}`
          : '';
  return `<p style="font-size:12px;color:#a8978b">${L('Biaya', 'Cost')}: Setup ${f(p.cost.setup)} (${p.cost.n} order) + ${L(
    'Simpan',
    'Holding'
  )} ${f(p.cost.hold)} = <b>${f(p.cost.total)}</b>${extra}</p>`;
};

/** Rekap biaya semua item (produk jadi + komponen). */
export function costTable() {
  const A = [{ c: S.end, p: S.mps }, ...S.mrp.map((m) => ({ c: m.c, p: m }))];
  const total = (k) => A.reduce((a, x) => a + x.p.cost[k], 0);
  return {
    h: ['Item', L('Order', 'Orders'), 'Setup', L('Simpan', 'Holding'), 'Total'],
    r: [
      ...A.map((x) => [x.c, x.p.cost.n, f(x.p.cost.setup), f(x.p.cost.hold), f(x.p.cost.total)]),
      ['Total', A.reduce((a, x) => a + x.p.cost.n, 0), f(total('setup')), f(total('hold')), f(total('total'))],
    ],
    A,
    tot: total('total'),
  };
}

/** Tabel "Ringkasan biaya rencana" untuk halaman MRP. */
export function costSummaryHtml() {
  const c = costTable();
  return (
    `<h3>${L('Ringkasan biaya rencana', 'Plan cost summary')}</h3>` +
    tb(
      c.h,
      c.r.map((x, i) =>
        i === c.r.length - 1 ? ['<b>Total</b>', x[1], x[2], x[3], `<span class="hl">${x[4]}</span>`] : x
      )
    )
  );
}

// ======================================================================
// 3c. TAMPILAN menu MPS
// ======================================================================

/**
 * views/mps.js
 * Halaman 3: pilihan produk jadi, biaya per item, tabel MPS, kesimpulan.
 */

export function renderMps() {
  const out = $('mpo');
  const endBox = $('eso');
  renderCostInputs();

  if (!S.mps) {
    endBox.innerHTML = '';
    out.innerHTML = need(
      !S.fc
        ? L('Selesaikan Forecasting dahulu.', 'Complete Forecasting first.')
        : L('Unggah file Inventory (dan BOM) agar MPS bisa dihitung.', 'Upload the Inventory file (and BOM) so the MPS can be computed.')
    );
    return;
  }

  endBox.innerHTML = `<div class="row" style="margin-top:8px"><div><label>${L('Produk jadi', 'End item')}</label><select data-end>${S.cand
    .map((c) => `<option ${c === S.end ? 'selected' : ''}>${c}</option>`)
    .join('')}</select></div></div>`;

  const m = S.mps;
  out.innerHTML =
    al(
      'i',
      `${L('Demand = hasil metode terbaik', 'Demand = best method result')} (${S.fc.best}) · Lot sizing: ${$('lm').value} · On Hand: ${m.oh} · Lead Time: ${m.lt} ${L('periode', 'period(s)')}`
    ) +
    (S.endMiss
      ? al('w', L('Produk jadi tidak ada di file Inventory; On Hand & Lead Time dianggap 0.', 'End item not found in the Inventory file; On Hand & Lead Time assumed 0.'))
      : '') +
    (m.late
      ? al(
          'w',
          L(
            `${m.late} unit harus dirilis sebelum periode 1 (lead time terlalu panjang); dimasukkan ke periode 1.`,
            `${m.late} units must be released before period 1 (lead time too long); placed in period 1.`
          )
        )
      : '') +
    tb([S.end, ...S.fl], rows5(m)) +
    costLine(m) +
    analyzeMps();
}

/** Input biaya setup (S) & holding (H) per item; kosong = pakai default. */
function renderCostInputs() {
  const o = $('cto');
  if (!S.mps) {
    o.innerHTML = '';
    return;
  }
  S.cit = [S.end, ...S.mrp.map((m) => m.c)];

  const input = (i, k, v, placeholder) =>
    `<input type="number" min="0" step="any" style="width:100px" value="${v != null ? v : ''}" placeholder="${placeholder}" data-cost-i="${i}" data-cost-k="${k}">`;

  o.innerHTML =
    `<h3>${L('Biaya per item', 'Cost per item')}</h3>` +
    `<p style="font-size:12px;color:#a8978b;margin:2px 0">${L(
      'Isi biaya setup (S) dan simpan (H) tiap item. Kosongkan untuk memakai default (kolom di file Inventory, atau nilai default di atas).',
      'Enter setup (S) and holding (H) cost per item. Leave blank to use the default (Inventory file columns, or the default values above).'
    )}</p>` +
    tb(
      ['Item', 'Setup (S) per order', L('Simpan (H) per unit/periode', 'Holding (H) per unit/period')],
      S.cit.map((c, i) => {
        const u = D.cost[c] || {};
        const e = S.oc(c);
        return [c, input(i, 'S', u.S, e.S), input(i, 'H', u.H, e.H)];
      })
    );
}

function analyzeMps() {
  const m = S.mps;
  const H = S.H;
  const totalDemand = sum(m.gr);
  const totalReceipt = sum(m.rc);
  const avg = totalDemand / H;
  const firstShort = m.net.findIndex((x) => x > 0);
  const endPab = m.pab[H - 1];
  const iv = D.inv[S.end] || { lot: 0 };
  const o = { ...S.oc(S.end), lot: iv.lot };
  const ranking = compareLotSizing(m, o);
  const cur = m.cost.total;
  const hasCost = o.S && o.H;
  const better = hasCost && ranking[0].t < cur - 1e-9;
  const sg = [];

  const stock =
    firstShort < 0
      ? L('cukup untuk semua periode', 'covers all periods')
      : firstShort === 0
        ? L('tidak cukup untuk periode 1', 'is short even in period 1')
        : L(`cukup sampai ${S.fl[firstShort - 1]}`, `lasts through ${S.fl[firstShort - 1]}`);

  if (m.late > 0)
    sg.push(L(`${m.late} unit harus dirilis sebelum periode 1: ekspedisi order, persingkat lead time, atau tambah stok pengaman.`, `${m.late} units must be released before period 1: expedite, shorten lead time, or add safety stock.`));
  else if (firstShort === 0)
    sg.push(L('Stok awal kurang: tambah penerimaan terjadwal atau safety stock.', 'Opening stock is short: add scheduled receipts or safety stock.'));
  if (better)
    sg.push(L(`Pindah ke ${ranking[0].k}: biaya ${f(cur)} → ${f(ranking[0].t)} (hemat ${f((100 * (cur - ranking[0].t)) / cur)}%).`, `Switch to ${ranking[0].k}: cost ${f(cur)} → ${f(ranking[0].t)} (save ${f((100 * (cur - ranking[0].t)) / cur)}%).`));
  if (!hasCost)
    sg.push(L('Isi biaya setup (S) dan simpan (H) untuk membandingkan lot sizing.', 'Enter setup (S) and holding (H) costs to compare lot sizing.'));
  if (totalReceipt > 0 && endPab > avg)
    sg.push(L(`PAB akhir ${endPab} > kebutuhan 1 periode: kecilkan ukuran lot.`, `Ending PAB ${endPab} exceeds one period of demand: reduce lot size.`));
  if (!sg.length) sg.push(L('Rencana layak; lanjut ke MRP.', 'Plan is feasible; continue to MRP.'));

  return an(
    L(
      `Kebutuhan ${totalDemand} unit/${H} periode; stok awal ${m.oh} ${stock}. Rencana ${m.cost.n} order${hasCost ? `, biaya ${f(cur)} (${better ? 'termurah: ' + ranking[0].k + ' ' + f(ranking[0].t) : 'sudah termurah'})` : ''}.`,
      `Demand ${totalDemand} units/${H} periods; opening stock ${m.oh} ${stock}. Plan has ${m.cost.n} orders${hasCost ? `, cost ${f(cur)} (${better ? 'cheapest: ' + ranking[0].k + ' ' + f(ranking[0].t) : 'already cheapest'})` : ''}.`
    ),
    sg
  );
}
