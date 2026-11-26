/**
 * MENU 1 – UPLOAD
 * detect  : mengenali jenis tabel dari nama header kolom
 * loader  : membaca file .csv/.xlsx
 * template: unduh template Excel
 * view    : tampilan menu Upload
 */

import { D, S, DL, $, al, an, L, nk, has, lab } from './common.js';

// ======================================================================
// 1a. DETECT – kenali jenis data dari header
// ======================================================================

/**
 * upload/detect.js
 * Mengenali jenis tabel dari nama header kolom (case-insensitive),
 * lalu mengisi state D sesuai jenisnya.
 */

/** Nama tampilan tiap jenis data. */
const NAMES = {
  hist: 'Data Historis',
  bom: 'Bill of Materials (BOM)',
  inv: 'Inventory',
  rt: 'Routing',
  sr: 'Scheduled Receipt',
  jobs: 'Jobs',
  j2: 'Johnson (2 mesin)',
};

/**
 * @param {any[][]} rows  hasil sheet_to_json(header:1)
 * @returns {{k:string,n:string}|null}  jenis data terdeteksi, atau null
 */
export function detect(rows) {
  const hi = rows.findIndex((r) => r.some((c) => c !== ''));
  if (hi < 0) return null;

  const h = rows[hi].map(nk);
  const d = rows.slice(hi + 1);
  const g = (keys) => has(h, keys);
  const n = (v) => Number(v) || 0;
  const s = (v) => String(v);
  let type = null;

  // indeks kolom per kemungkinan header
  const ji = g(['job', 'pekerjaan']);
  const ar = g(['arrival', 'kedatangan']);
  const pr = g(['processing', 'pemprosesan']);
  const du = g(['due', 'tenggat']);
  const ma = g(['machinea', 'mesina']);
  const mb = g(['machineb', 'mesinb']);
  const it = g(['item', 'komponen', 'material', 'produk', 'job']);
  const pp = g(['period', 'week', 'minggu', 'periode']);
  const rc = g(['receipt', 'penerimaan']);
  const oh = g(['onhand', 'stok', 'stock']);
  const lt = g(['leadtime']);
  const co = g(['component', 'komponen', 'child']);
  const pa = g(['parent', 'item', 'induk']);
  const qy = g(['qty', 'quantity']);
  const mc = g(['machine', 'mesin']);
  const pt = g(['processingtime', 'proctime', 'waktu', 'time']);
  const dm = g(['demand', 'actual', 'permintaan', 'penjualan']);

  if (ji >= 0 && ma >= 0 && mb >= 0) {
    // Johnson: Job + Machine A + Machine B
    D.j2 = d.filter((r) => r[ji] !== '').map((r) => ({ id: s(r[ji]), a: n(r[ma]), b: n(r[mb]) }));
    type = 'j2';
  } else if (ji >= 0 && ar >= 0 && pr >= 0 && du >= 0) {
    // Jobs satu mesin
    const w = g(['weight', 'bobot']);
    D.jobs = d
      .filter((r) => r[ji] !== '')
      .map((r) => ({
        id: s(r[ji]),
        arr: n(r[ar]),
        p: n(r[pr]),
        w: w >= 0 && n(r[w]) > 0 ? n(r[w]) : 1,
        due: n(r[du]),
      }));
    type = 'jobs';
  } else if (mc >= 0 && it >= 0 && pt >= 0) {
    // Routing
    D.rt = d
      .filter((r) => r[it] !== '' && r[mc] !== '')
      .map((r) => ({ i: s(r[it]), m: s(r[mc]), p: n(r[pt]) }));
    type = 'rt';
  } else if (it >= 0 && pp >= 0 && rc >= 0) {
    // Scheduled receipt
    D.sr = {};
    d.forEach((r) => {
      const p = Math.round(n(r[pp]));
      if (p >= 1 && r[it] !== '') {
        const k = s(r[it]);
        const a = (D.sr[k] = D.sr[k] || []);
        a[p - 1] = (a[p - 1] || 0) + n(r[rc]);
      }
    });
    type = 'sr';
  } else if (it >= 0 && oh >= 0 && lt >= 0) {
    // Inventory
    const lo = g(['lotsize', 'lot']);
    const su = g(['setup', 'ordercost', 'biayapesan']);
    const ho = g(['holding', 'simpan']);
    D.inv = {};
    d.forEach((r) => {
      if (r[it] !== '') {
        D.inv[s(r[it])] = {
          oh: n(r[oh]),
          lt: Math.max(0, Math.round(n(r[lt]))),
          lot: lo >= 0 ? n(r[lo]) : 0,
          S: su >= 0 && r[su] !== '' ? n(r[su]) : null,
          H: ho >= 0 && r[ho] !== '' ? n(r[ho]) : null,
        };
      }
    });
    type = 'inv';
  } else if (co >= 0 && pa >= 0 && qy >= 0) {
    // BOM
    D.bom = d
      .filter((r) => r[pa] !== '' && r[co] !== '')
      .map((r) => ({ p: s(r[pa]), c: s(r[co]), q: n(r[qy]) || 1 }));
    type = 'bom';
  } else if (dm >= 0) {
    // Data historis: berhenti di baris kosong / non-angka pertama
    const p = g(['date', 'period', 'bulan', 'minggu', 'week', 'month', 'tanggal']);
    if (p >= 0) {
      const labels = [];
      const values = [];
      for (const r of d) {
        if (r[dm] === '' || isNaN(Number(r[dm]))) break;
        labels.push(lab(r[p]));
        values.push(Number(r[dm]));
      }
      D.hist = { l: labels, v: values };
      type = 'hist';
    }
  }

  return type ? { k: type, n: NAMES[type] } : null;
}

// ======================================================================
// 1b. LOADER – baca file
// ======================================================================

/**
 * upload/loader.js
 * Membaca file .csv / .xlsx / .xls (semua sheet) memakai SheetJS (global XLSX).
 */

/**
 * @param {FileList|File[]} files
 * @param {() => void} onChange dipanggil setiap file selesai diproses
 */
export function loadFiles(files, onChange) {
  [...files].forEach((file) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      let wb;
      try {
        wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      } catch (err) {
        DL.push({ n: file.name, t: null });
        onChange();
        return;
      }

      wb.SheetNames.forEach((sn) => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
        const t = detect(rows);
        // File Jobs otomatis menjadi sumber job di menu Scheduling
        if (t && t.k === 'jobs') $('src').value = 'file';
        DL.push({ n: file.name + (wb.SheetNames.length > 1 ? ' [' + sn + ']' : ''), t });
      });
      onChange();
    };

    reader.readAsArrayBuffer(file);
  });
}

// ======================================================================
// 1c. TEMPLATE Excel
// ======================================================================

/**
 * upload/template.js
 * Membuat & mengunduh template Excel contoh (template_ppic.xlsx).
 */

export function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);

  add('Historical', [
    ['Period', 'Demand'],
    ...[100, 120, 115, 130, 140, 135, 150, 145, 160, 155].map((v, i) => ['W' + (i + 1), v]),
  ]);
  add('BOM', [
    ['Parent', 'Component', 'Qty'],
    ['Notebook', 'Pad', 1],
    ['Notebook', 'Cover', 1],
  ]);
  add('Inventory', [
    ['Item', 'On Hand', 'Lead Time', 'Lot Size', 'Setup Cost', 'Holding Cost'],
    ['Notebook', 30, 1, 0, 100, 1.5],
    ['Pad', 30, 1, 30, 50, 0.5],
    ['Cover', 30, 2, 50, 80, 0.8],
  ]);
  add('Receipts', [
    ['Item', 'Period', 'Scheduled Receipt'],
    ['Pad', 1, 15],
    ['Cover', 1, 50],
  ]);
  add('Routing', [
    ['Item', 'Machine', 'Processing Time'],
    ['Notebook', 'Assembly', 0.2],
    ['Pad', 'Cutting', 0.1],
    ['Cover', 'Printing', 0.15],
  ]);
  add('Jobs', [
    ['Job', 'Arrival', 'Processing Time', 'Weight', 'Due Date'],
    ['P1', 0, 8, 3, 20],
    ['P2', 2, 4, 1, 15],
    ['P3', 4, 6, 2, 18],
    ['P4', 5, 3, 5, 10],
    ['P5', 7, 5, 4, 12],
  ]);
  add('Johnson', [
    ['Job', 'Machine A', 'Machine B'],
    ['P1', 6, 8],
    ['P2', 3, 7],
    ['P3', 5, 6],
    ['P4', 9, 4],
    ['P5', 2, 9],
    ['P6', 7, 5],
  ]);

  XLSX.writeFile(wb, 'template_ppic.xlsx');
}

// ======================================================================
// 1d. TAMPILAN menu Upload
// ======================================================================

/**
 * views/upload.js
 * Halaman 1: log file yang terbaca + ringkasan kesiapan data.
 */

export function renderUpload() {
  const log = DL.map((x) =>
    x.t
      ? al(
          'g',
          `✔ <b>${x.n}</b> — ${L('File berhasil dibaca. Terdeteksi sebagai', 'File read successfully. Detected as')}: <b>${x.t.n}</b>`
        )
      : al(
          'w',
          `✖ <b>${x.n}</b> — ${L(
            'Format tidak dikenali. Cek header kolom sesuai panduan di atas.',
            'Format not recognized. Check column headers against the guide above.'
          )}`
        )
  ).join('');

  const checklist = [
    ['Historical', D.hist],
    ['BOM', D.bom.length],
    ['Inventory', Object.keys(D.inv).length],
    ['Sched. Receipt', Object.keys(D.sr).length],
    ['Routing', D.rt.length],
    ['Jobs', D.jobs.length],
    ['Johnson', D.j2.length],
  ]
    .map(([name, v]) => (v ? `✔ ${name}` : `○ ${name}`))
    .join(' &nbsp; ');

  $('dl').innerHTML = log + (DL.length ? al('i', checklist) : '') + (DL.length ? analyzeUpload() : '');
}

function analyzeUpload() {
  const hn = D.hist ? D.hist.v.length : 0;
  const ni = Object.keys(D.inv).length;
  const ready = [
    ['Forecasting', hn >= 5],
    ['MPS', hn >= 5 && ni > 0],
    ['MRP', hn >= 5 && ni > 0 && D.bom.length > 0],
    ['Scheduling', (hn >= 5 && ni > 0) || D.jobs.length > 0 || D.j2.length > 0],
  ]
    .filter((x) => x[1])
    .map((x) => x[0]);
  const missing = [...new Set(D.bom.flatMap((b) => [b.p, b.c]))].filter((k) => !D.inv[k]);
  const sg = [];

  if (hn < 5) sg.push(L('Unggah data historis (min. 5 periode).', 'Upload historical data (min. 5 periods).'));
  else if (!ni) sg.push(L('Unggah Inventory agar MPS bisa dihitung.', 'Upload Inventory so the MPS can run.'));
  else if (!D.bom.length) sg.push(L('Unggah BOM agar MRP bisa dihitung.', 'Upload the BOM so MRP can run.'));

  if (missing.length)
    sg.push(L(`Lengkapi Inventory untuk: ${missing.join(', ')}.`, `Add Inventory rows for: ${missing.join(', ')}.`));
  if (hn >= 5 && hn < 12)
    sg.push(L(`Data baru ${hn} periode; 12–24 periode lebih andal.`, `Only ${hn} periods; 12–24 is more reliable.`));
  if (ni && !D.rt.length)
    sg.push(L('Unggah Routing agar Gantt memakai mesin sebenarnya.', 'Upload Routing so the Gantt uses real machines.'));
  if (!sg.length) sg.push(L('Data lengkap, lanjut ke Forecasting.', 'Data complete, continue to Forecasting.'));

  return an(
    L(
      `Tahap yang bisa dijalankan: <b>${ready.join(' → ') || 'belum ada'}</b>.`,
      `Stages ready to run: <b>${ready.join(' → ') || 'none yet'}</b>.`
    ),
    sg
  );
}
