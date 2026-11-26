/**
 * common.js – dipakai semua menu.
 *   - state  : D (data input), S (hasil hitung), DL (log upload), ui
 *   - utils  : format angka, bahasa (L), pembuat tabel/alert HTML
 *   - charts : grafik Chart.js (Gantt, ekspor gambar untuk laporan)
 */

// ======================================================================
// STATE: data input (D), hasil hitung (S), log upload (DL), state tampilan (ui)
// ======================================================================

/**
 * state.js
 * Satu-satunya tempat state aplikasi disimpan.
 *
 *  D  = data hasil upload (input)
 *  S  = hasil hitung (output) – dihapus & dihitung ulang tiap renderAll()
 *  DL = log file yang sudah diunggah
 *  ui = state tampilan (produk jadi terpilih, instance Chart)
 */

export const D = {
  hist: null, // { l: [label], v: [demand] }
  bom: [], //    [{ p, c, q }]
  inv: {}, //    { item: { oh, lt, lot, S, H } }
  rt: [], //     [{ i, m, p }]
  sr: {}, //     { item: [qty per periode] }
  jobs: [], //   [{ id, arr, p, w, due }]
  j2: [], //     [{ id, a, b }]
  cost: {}, //   { item: { S, H } } – override biaya dari UI
};

export const S = {};

/** Kosongkan S in-place (referensi objek tetap sama untuk semua modul). */
export function resetS() {
  Object.keys(S).forEach((k) => delete S[k]);
}

/** Log file upload: [{ n: nama, t: { k, n } | null }] */
export const DL = [];

export const ui = {
  endSel: null, // produk jadi yang dipilih
  cf: null, //     Chart forecasting
  gc: null, //     Chart Gantt scheduling
  gj: null, //     Chart Gantt Johnson
};

// ======================================================================
// UTILS: format angka, bahasa (L), pembuat HTML
// ======================================================================

/**
 * utils/format.js
 * Fungsi kecil untuk format angka, normalisasi header, dan sanitasi teks PDF.
 */

/** Normalisasi nama kolom: huruf kecil, hanya a-z0-9. */
export const nk = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Format angka dengan `d` desimal (default 2). null/undefined -> "–". */
export const f = (x, d = 2) => (x == null ? '–' : String(Math.round(x * 10 ** d) / 10 ** d));

/** Cari index header pertama yang mengandung salah satu kata kunci. */
export const has = (headers, keys) => headers.findIndex((x) => keys.some((k) => x.includes(k)));

/** Label periode dari sel Excel (Date -> yyyy-mm-dd). */
export const lab = (c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c));

/** Jumlah semua elemen array. */
export const sum = (arr) => arr.reduce((a, c) => a + c, 0);

/** Bersihkan teks agar aman untuk font bawaan jsPDF (Latin-1). */
export const pdfText = (t) =>
  String(t == null ? '' : t)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/Σ/g, 'Sum')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/α/g, 'alpha')
    .replace(/[−–—]/g, '-')
    .replace(/[^\x20-\xFF]/g, '');

// ======================================================================
// 
// ======================================================================

/**
 * utils/i18n.js
 * Bahasa aktif (id / en). L(a, b) mengembalikan teks sesuai bahasa.
 */

export const i18n = { lang: 'id' };

/** L('teks indonesia', 'english text') */
export const L = (id, en) => (i18n.lang === 'id' ? id : en);

/** Ganti bahasa dan sinkronkan class <body> serta atribut lang. */
export function toggleLang() {
  i18n.lang = i18n.lang === 'id' ? 'en' : 'id';
  document.body.classList.toggle('en');
  document.documentElement.lang = i18n.lang;
}

// ======================================================================
// 
// ======================================================================

/**
 * utils/html.js
 * Helper pembuat HTML: tabel, alert, kotak kesimpulan.
 */

export const $ = (id) => document.getElementById(id);

/** Tabel dari header (array string) dan baris (array of array). */
export const tb = (headers, rows) =>
  `<div class="ov"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;

/** Kotak alert. cls: g (hijau) | w (kuning) | i (info). */
export const al = (cls, text) => `<div class="al ${cls}">${text}</div>`;

/** Alert peringatan "data belum lengkap". */
export const need = (text) => al('w', text);

/**
 * Kotak "Kesimpulan + Saran perbaikan".
 * @param {string} p   paragraf kesimpulan
 * @param {string[]} sg daftar saran (maks. 3 ditampilkan)
 * @param {string} [x] HTML tambahan (mis. tabel perbandingan)
 */
export const an = (p, sg, x) =>
  `<div class="al" style="background:linear-gradient(135deg,rgba(226,113,29,.2),rgba(255,255,255,.03));border:1px solid rgba(226,113,29,.4);color:#f3e9e1;margin-top:16px;border-radius:16px"><b>📊 ${L(
    'Kesimpulan',
    'Conclusion'
  )}</b><p style="margin:4px 0 8px">${p}</p>${x || ''}<b>💡 ${L(
    'Saran perbaikan',
    'How to improve'
  )}</b><ul style="margin:4px 0 0 18px;padding:0">${sg
    .slice(0, 3)
    .map((t) => `<li>${t}</li>`)
    .join('')}</ul></div>`;

// ======================================================================
// CHARTS: pembungkus Chart.js & grafik Gantt
// ======================================================================

/**
 * views/charts.js
 * Pembungkus Chart.js (global Chart): tema, grafik Gantt, dan ekspor ke gambar untuk laporan.
 */

/** Palet warna Gantt. */
export const PAL = ['#e2711d', '#b4470e', '#f08a3c', '#8a3a12', '#d4631a', '#a04a16', '#c97a45'];

/** Tinggi (px) tiap grafik saat diekspor ke laporan. */
export const CH = { fc: 340, gc: 380, gj: 240 };

/** Config grafik terakhir per key – dipakai ulang untuk render ke gambar. */
const CFG = {};

/** Plugin: tulis nama job di tengah batang Gantt bila cukup lebar. */
const labelPlugin = {
  id: 'lb',
  afterDatasetsDraw(chart) {
    const x = chart.ctx;
    x.save();
    x.fillStyle = '#fff';
    x.font = '11px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    chart.data.datasets.forEach((d, i) =>
      chart.getDatasetMeta(i).data.forEach((bar, j) => {
        if (!d.data[j]) return;
        const q = bar.getProps(['x', 'base', 'y'], true);
        if (Math.abs(q.x - q.base) > 30) x.fillText(d.label, (q.x + q.base) / 2, q.y);
      })
    );
    x.restore();
  },
};

/** Atur tema gelap Chart.js. Panggil sekali saat start. */
export function initChartDefaults() {
  if (typeof Chart !== 'undefined' && Chart.defaults) {
    Chart.defaults.color = '#c9b8ab';
    Chart.defaults.borderColor = 'rgba(255,255,255,.1)';
    Chart.defaults.font.family = 'Inter,system-ui,sans-serif';
  }
}

/** Buat chart pada canvas `canvasId` dan simpan config-nya di bawah `key`. */
export function mkChart(key, canvasId, cfg) {
  CFG[key] = cfg;
  return new Chart($(canvasId), cfg);
}

/**
 * Gantt chart (bar horizontal floating).
 * @param {string} cv     id canvas (juga dipakai sebagai key)
 * @param {{l:string,m:string,s:number,e:number,k:number}[]} bars
 * @param {string[]} machines  urutan mesin (sumbu y)
 * @param {string[]} [labels]  label sumbu y
 */
export function gantt(cv, bars, machines, labels) {
  return mkChart(cv, cv, {
    type: 'bar',
    plugins: [labelPlugin],
    data: {
      labels: labels || machines,
      datasets: bars.map((b) => ({
        label: b.l,
        data: machines.map((m) => (m === b.m ? [b.s, b.e] : null)),
        backgroundColor: PAL[b.k % PAL.length],
        borderColor: '#140b07',
        borderWidth: 1,
        grouped: false,
      })),
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: L('Waktu', 'Time') } } },
    },
  });
}

/** Render grafik `key` ke PNG (latar putih) untuk laporan & PDF. null jika gagal. */
export function chartToImage(key) {
  const c = CFG[key];
  if (!c || typeof Chart === 'undefined') return null;

  const w = 900;
  const h = CH[key] || 340;
  const cfg = JSON.parse(JSON.stringify({ type: c.type, data: c.data, options: c.options }));
  const canvas = document.createElement('canvas');
  const oldColor = Chart.defaults.color;
  const oldBorder = Chart.defaults.borderColor;

  canvas.width = w;
  canvas.height = h;
  cfg.data.datasets.forEach((d) => {
    if (d.borderColor === '#ffffff') d.borderColor = '#111827';
  });
  cfg.options = { ...cfg.options, responsive: false, animation: false, maintainAspectRatio: false };
  cfg.plugins = [
    {
      id: 'bg',
      beforeDraw(x) {
        x.ctx.save();
        x.ctx.fillStyle = '#fff';
        x.ctx.fillRect(0, 0, w, h);
        x.ctx.restore();
      },
    },
    ...(c.type === 'bar' ? [labelPlugin] : []),
  ];

  Chart.defaults.color = '#333';
  Chart.defaults.borderColor = '#ddd';
  try {
    const chart = new Chart(canvas, cfg);
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    return url;
  } catch (e) {
    return null;
  } finally {
    Chart.defaults.color = oldColor;
    Chart.defaults.borderColor = oldBorder;
  }
}
