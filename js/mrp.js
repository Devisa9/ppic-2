/**
 * MENU 4 – MRP
 * core: level BOM & eksplosi komponen
 * view: tampilan menu MRP
 */

import { D, S, $, tb, al, need, an, L, has } from './common.js';
import { plan, rows5, costLine, costSummaryHtml } from './mps.js';

// ======================================================================
// 4a. PERHITUNGAN MRP (eksplosi BOM)
// ======================================================================

/**
 * core/mrp.js  (logika murni, tanpa DOM)
 * Level BOM (low-level code) dan eksplosi kebutuhan komponen.
 */

/**
 * Hitung level tiap item: level 0 = produk jadi, komponen = level induk + 1.
 * @param {{p:string,c:string,q:number}[]} bom
 * @returns {Object<string, number>}
 */
export function levels(bom) {
  const lv = {};
  bom.forEach((b) => {
    lv[b.p] = lv[b.p] || 0;
    lv[b.c] = lv[b.c] || 0;
  });
  // relaksasi berulang agar item yang dipakai di beberapa level mendapat level terdalam
  for (let k = 0; k < 30; k++) {
    bom.forEach((b) => {
      if (lv[b.c] < lv[b.p] + 1) lv[b.c] = lv[b.p] + 1;
    });
  }
  return lv;
}

/**
 * Ledakkan MPS produk jadi menjadi rencana semua komponen (urut level).
 * @param {Array} bom
 * @param {Object} inv   { item: {oh, lt, lot} }
 * @param {string} end   produk jadi
 * @param {{rl:number[]}} mps
 * @param {number} H     jumlah periode
 * @param {(item:string)=>number[]} srf  scheduled receipt per item
 * @param {(item:string)=>{m:string,S:number,H:number}} o  opsi lot sizing per item
 */
export function explode(bom, inv, end, mps, H, srf, o) {
  const lv = levels(bom);
  const rel = { [end]: mps.rl };
  const desc = new Set(); // semua turunan produk jadi
  const stack = [end];
  const out = [];

  while (stack.length) {
    const x = stack.pop();
    bom
      .filter((b) => b.p === x)
      .forEach((b) => {
        if (!desc.has(b.c) && b.c !== end) {
          desc.add(b.c);
          stack.push(b.c);
        }
      });
  }

  const ordered = [...desc].sort((p, q) => lv[p] - lv[q]);
  ordered.forEach((c) => {
    const g = Array(H).fill(0);
    bom
      .filter((b) => b.c === c && rel[b.p])
      .forEach((b) => rel[b.p].forEach((r, t) => (g[t] += r * b.q)));

    const iv = inv[c] || { oh: 0, lt: 0, lot: 0 };
    const p = plan(g, iv.oh, iv.lt, srf(c), { ...o(c), lot: iv.lot });
    rel[c] = p.rl;
    out.push({ ...p, c, lv: lv[c], oh: iv.oh, lt: iv.lt, miss: !inv[c] });
  });

  return out;
}

// ======================================================================
// 4b. TAMPILAN menu MRP
// ======================================================================

/**
 * views/mrp.js
 * Halaman 4: eksplosi BOM, tabel MRP tiap komponen, ringkasan biaya, kesimpulan.
 */

export function renderMrp() {
  const o = $('mro');
  if (!S.mrp) {
    o.innerHTML = need(L('Selesaikan MPS dahulu.', 'Complete the MPS first.'));
    return;
  }
  if (!D.bom.length) {
    o.innerHTML = need(L('Unggah file BOM untuk eksplosi komponen.', 'Upload the BOM file to explode components.'));
    return;
  }

  const showLot = $('lm').value === 'FOQ';
  o.innerHTML =
    (S.mrp.some((m) => m.miss)
      ? al(
          'w',
          L('Tidak ada di Inventory (On Hand & LT dianggap 0): ', 'Missing from Inventory (On Hand & LT assumed 0): ') +
            S.mrp.filter((m) => m.miss).map((m) => m.c).join(', ')
        )
      : '') +
    costSummaryHtml() +
    S.mrp
      .map(
        (m) =>
          `<h3>${m.c} — Level ${m.lv} · On Hand ${m.oh} · LT ${m.lt}${showLot ? ' · Lot ' + (D.inv[m.c] ? D.inv[m.c].lot : 0) : ''}</h3>` +
          (m.late
            ? al('w', L(`${m.late} unit harus dirilis sebelum periode 1.`, `${m.late} units must be released before period 1.`))
            : '') +
          tb([m.c, ...S.fl], rows5(m)) +
          costLine(m)
      )
      .join('') +
    analyzeMrp();
}

function analyzeMrp() {
  const M = S.mrp;
  if (!M.length)
    return an(L('Produk jadi tidak punya komponen di BOM.', 'The end item has no components in the BOM.'), [
      L('Periksa kolom Parent dan Component.', 'Check the Parent and Component columns.'),
    ]);

  const total = (x) => x.rl.reduce((a, c) => a + c, 0);
  const maxLevel = Math.max(...M.map((x) => x.lv));
  const biggest = [...M].sort((a, b) => total(b) - total(a))[0];
  const longestLt = [...M].sort((a, b) => b.lt - a.lt)[0];
  const late = M.filter((x) => x.late > 0).map((x) => x.c);
  const miss = M.filter((x) => x.miss).map((x) => x.c);
  const first = M.filter((x) => x.rl.some((v) => v > 0))
    .map((x) => ({ c: x.c, t: x.rl.findIndex((v) => v > 0) }))
    .sort((a, b) => a.t - b.t)[0];
  const sg = [];

  if (late.length)
    sg.push(L(`${late.join(', ')} harus dirilis sebelum periode 1: ekspedisi atau cari pemasok lebih cepat.`, `${late.join(', ')} must be released before period 1: expedite or find faster suppliers.`));
  if (miss.length) sg.push(L(`Lengkapi Inventory untuk ${miss.join(', ')}.`, `Add Inventory rows for ${miss.join(', ')}.`));
  if (longestLt.lt >= 2)
    sg.push(L(`Pesan ${longestLt.c} paling awal (LT ${longestLt.lt}); siapkan pemasok cadangan.`, `Order ${longestLt.c} first (LT ${longestLt.lt}); line up a backup supplier.`));
  if (!sg.length) sg.push(L('Semua komponen terpenuhi; lanjut ke Scheduling.', 'All components are covered; continue to Scheduling.'));

  return an(
    L(
      `${M.length} komponen, ${maxLevel} level. Order terbesar: ${biggest.c} (${total(biggest)} unit); LT terpanjang: ${longestLt.c} (${longestLt.lt}). ${first ? `Order pertama dirilis ${S.fl[first.t]} (${first.c}).` : ''}`,
      `${M.length} components, ${maxLevel} levels. Largest order: ${biggest.c} (${total(biggest)} units); longest LT: ${longestLt.c} (${longestLt.lt}). ${first ? `First order released ${S.fl[first.t]} (${first.c}).` : ''}`
    ),
    sg
  );
}
