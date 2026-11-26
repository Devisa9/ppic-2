/**
 * main.js – PENGHUBUNG semua menu.
 *   calc()      : Forecasting → MPS → MRP
 *   calcSch()   : Scheduling & Johnson
 *   renderAll() : hitung ulang lalu gambar ulang semua halaman
 *   + navigasi, event input, dan start aplikasi
 */

import { D, S, ui, resetS, $, toggleLang, has, initChartDefaults } from './common.js';
import { forecast } from './forecasting.js';
import { plan } from './mps.js';
import { explode, renderMrp } from './mrp.js';
import { mkJobs, sched, johnson, mutil, renderScheduling } from './scheduling.js';
import { loadFiles, downloadTemplate, renderUpload } from './upload.js';
import { renderForecast } from './forecasting.js';
import { renderMps } from './mps.js';
import { renderReport, downloadPdf } from './report.js';

// ======================================================================
// HITUNG: Forecasting → MPS → MRP, lalu Scheduling
// ======================================================================

/**
 * controller/calc.js
 * Menghubungkan input UI + data upload ke modul core, hasilnya disimpan di S.
 */

/** Forecasting -> MPS -> MRP. */
export function calc() {
  resetS();
  if (!D.hist || D.hist.v.length < 5) return;

  const H = Math.max(1, Math.min(26, +$('hz').value || 8));
  const labels = D.hist.l;
  const m = /^(.*?)(\d+)$/.exec(labels[labels.length - 1]);

  S.H = H;
  S.fc = forecast(D.hist.v, H);
  // label periode ke depan: lanjutkan angka di akhir label terakhir (W10 -> W11, ...)
  S.fl = [...Array(H)].map((_, k) => (m ? m[1] + (+m[2] + k + 1) : '+' + (k + 1)));

  // kandidat produk jadi = induk yang bukan komponen siapa pun
  const comps = new Set(D.bom.map((b) => b.c));
  const cand = D.bom.length
    ? [...new Set(D.bom.map((b) => b.p))].filter((p) => !comps.has(p))
    : Object.keys(D.inv);
  S.cand = cand;
  if (!cand.length || !Object.keys(D.inv).length) return;

  // biaya setup/holding: override UI -> kolom Inventory -> default di MPS
  const costOf = (c) => {
    const iv = D.inv[c] || {};
    const u = D.cost[c] || {};
    const pick = (k) =>
      u[k] != null ? u[k] : iv[k] != null ? iv[k] : k === 'S' ? +$('ls').value || 0 : +$('lh').value || 0;
    return { S: pick('S'), H: pick('H') };
  };
  const lotOpts = (c) => ({ m: $('lm').value, ...costOf(c) });
  const receipts = (c) => Array.from({ length: H }, (_, i) => (D.sr[c] || [])[i] || 0);

  S.end = cand.includes(ui.endSel) ? ui.endSel : cand[0];
  S.oc = lotOpts;

  const iv = D.inv[S.end] || { oh: 0, lt: 0, lot: 0 };
  const demand = S.fc.F[S.fc.best].slice(S.fc.n).map((v) => Math.max(0, Math.round(v)));

  S.endMiss = !D.inv[S.end];
  S.mps = {
    ...plan(demand, iv.oh, iv.lt, receipts(S.end), { ...lotOpts(S.end), lot: iv.lot }),
    oh: iv.oh,
    lt: iv.lt,
  };
  S.mrp = explode(D.bom, D.inv, S.end, S.mps, H, receipts, lotOpts);
}

/** Scheduling (job dari MRP atau file Jobs) dan Johnson. */
export function calcSch() {
  const cap = Math.max(1, +$('cap').value || 40);
  const rule = $('rule').value;

  S.cap = cap;
  S.useF = D.jobs.length > 0 && $('src').value === 'file';
  S.mkJ = S.useF
    ? () => D.jobs.map((j) => ({ ...j, ops: [{ m: 'M1', d: j.p }] }))
    : S.mps && S.mrp
      ? () => mkJobs([{ c: S.end, rl: S.mps.rl, lt: S.mps.lt }, ...S.mrp], D.rt, cap)
      : null;

  S.jobs = S.mkJ ? sched(S.mkJ(), rule) : null;
  S.jj = D.j2.length ? johnson(D.j2) : null;

  // utilisasi mesin dihitung sekali di sini (dipakai tampilan & laporan)
  if (S.jobs && S.jobs.length) {
    const mk = Math.max(...S.jobs.map((j) => j.C));
    S.U = mutil(
      S.jobs.flatMap((j) => j.ops),
      mk
    );
  }
}

// ======================================================================
// RENDER semua halaman
// ======================================================================

/**
 * controller/render.js
 * renderAll(): hitung ulang semua tahap lalu gambar ulang semua halaman.
 */

export function renderAll() {
  try {
    calc();
    calcSch();
  } catch (err) {
    console.error(err);
  }

  renderUpload();
  renderForecast();
  renderMps();
  renderMrp();
  renderScheduling();

  // tanda ✓ pada menu sidebar bila tahap sudah punya hasil
  const done = {
    up: D.hist && Object.keys(D.inv).length,
    fc: S.fc,
    mps: S.mps,
    mrp: S.mrp && D.bom.length,
    sch: (S.jobs && S.jobs.length) || S.jj,
  };
  document.querySelectorAll('.nv').forEach((n) => n.classList.toggle('ok', !!done[n.dataset.p]));

  if ($('rep').classList.contains('on')) renderReport();
}

// ======================================================================
// NAVIGASI antar menu
// ======================================================================

/**
 * controller/navigation.js
 * Pindah halaman via sidebar / tombol "Lanjut".
 */

export function go(page) {
  document.querySelectorAll('.pg').forEach((e) => e.classList.toggle('on', e.id === page));
  document.querySelectorAll('.nv').forEach((e) => e.classList.toggle('on', e.dataset.p === page));
  window.scrollTo(0, 0);
  if (page === 'rep') renderReport();
}

// ======================================================================
// AKSI pengguna
// ======================================================================

/**
 * controller/actions.js
 * Aksi pengguna yang mengubah state lalu memicu renderAll().
 */

/** Pilih produk jadi di halaman MPS. */
export function selectEndItem(item) {
  ui.endSel = item;
  renderAll();
}

/** Ubah biaya setup/holding item ke-i (kosong = kembali ke default). */
export function setCost(index, key, value) {
  const item = S.cit[index];
  (D.cost[item] = D.cost[item] || {})[key] = value === '' ? null : +value;
  renderAll();
}

// ======================================================================
// START aplikasi
// ======================================================================

/**
 * main.js – entry point.
 * Menghubungkan elemen HTML statis dengan modul (tanpa atribut onclick inline).
 */

function bindNavigation() {
  document.querySelectorAll('.nv').forEach((n) => (n.onclick = () => go(n.dataset.p)));
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
}

function bindUpload() {
  const dz = $('dz');
  const input = $('fi');

  dz.ondragover = (e) => {
    e.preventDefault();
    dz.classList.add('d');
  };
  dz.ondragleave = () => dz.classList.remove('d');
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove('d');
    loadFiles(e.dataTransfer.files, renderAll);
  };
  input.onchange = (e) => {
    loadFiles(e.target.files, renderAll);
    input.value = ''; // izinkan memilih file yang sama lagi
  };

  $('btn-choose').onclick = () => input.click();
  $('btn-template').onclick = downloadTemplate;
}

function bindControls() {
  // input parameter: ubah -> hitung ulang semuanya
  ['hz', 'lm', 'ls', 'lh', 'rule', 'src', 'cap'].forEach((id) => ($(id).onchange = renderAll));

  $('btn-lang').onclick = () => {
    toggleLang();
    renderAll();
  };
  $('btn-pdf').onclick = downloadPdf;
  $('btn-refresh').onclick = renderReport;

  // elemen dinamis (dibuat ulang tiap render) -> event delegation
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('select[data-end]')) selectEndItem(t.value);
    else if (t.matches('input[data-cost-i]')) setCost(+t.dataset.costI, t.dataset.costK, t.value);
  });
}

initChartDefaults();
bindNavigation();
bindUpload();
bindControls();
renderAll();
