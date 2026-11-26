/**
 * MENU 5 – SCHEDULING
 * core: FCFS/SPT/SWPT/EDD/CR, Johnson's rule, utilisasi mesin
 * view: tampilan menu Scheduling + Gantt
 */

import { D, S, ui, $, tb, al, need, an, L, f, gantt } from './common.js';

// ======================================================================
// 5a. PERHITUNGAN scheduling & Johnson
// ======================================================================

/**
 * core/scheduling.js  (logika murni, tanpa DOM)
 * Pembuatan job, aturan prioritas (FCFS/SPT/SWPT/EDD/CR), Johnson's rule,
 * serta utilisasi mesin.
 */

export const RULES = ['FCFS', 'SPT', 'SWPT', 'EDD', 'CR'];

/**
 * Ubah Planned Order Release MRP menjadi job.
 * @param {{c:string,rl:number[],lt:number}[]} src
 * @param {{i:string,m:string,p:number}[]} rt  routing (boleh kosong)
 * @param {number} cap jam kerja per periode
 */
export function mkJobs(src, rt, cap) {
  const J = [];
  src.forEach((s) =>
    s.rl.forEach((q, t) => {
      if (q <= 0) return;
      const ops = rt.length
        ? rt.filter((r) => r.i === s.c).map((r) => ({ m: r.m, d: r.p * q }))
        : [{ m: 'M1', d: q }];
      if (ops.length) {
        J.push({ id: s.c + ' P' + (t + 1), arr: t * cap, due: (t + s.lt + 1) * cap, w: 1, ops });
      }
    })
  );
  return J;
}

/**
 * Jadwalkan job dengan aturan prioritas. Job dimodifikasi in-place
 * (tot, st, C, F, E, T, WT) dan dikembalikan sesuai urutan eksekusi.
 */
export function sched(J, rule) {
  J.forEach((j) => {
    j.tot = j.ops.reduce((a, o) => a + o.d, 0);
  });
  const free = {}; // waktu bebas tiap mesin
  const out = [];

  const place = (j) => {
    let prevEnd = j.arr;
    j.ops.forEach((o) => {
      o.s = Math.max(free[o.m] || 0, prevEnd);
      o.e = o.s + o.d;
      free[o.m] = o.e;
      prevEnd = o.e;
    });
    j.st = j.ops[0].s;
    j.C = prevEnd;
    j.F = prevEnd - j.arr;
    j.E = Math.max(0, j.due - prevEnd);
    j.T = Math.max(0, prevEnd - j.due);
    j.WT = j.w * j.T;
    out.push(j);
  };

  if (rule === 'CR') {
    const rest = J.slice();
    let now = Math.min(...J.map((j) => j.arr));
    while (rest.length) {
      const ready = rest.filter((j) => j.arr <= now);
      if (!ready.length) {
        now = Math.min(...rest.map((j) => j.arr));
        continue;
      }
      ready.sort((a, b) => (a.due - now) / a.tot - (b.due - now) / b.tot);
      const j = ready[0];
      rest.splice(rest.indexOf(j), 1);
      place(j);
      now = j.ops[0].e;
    }
  } else {
    const key = {
      FCFS: (j) => j.arr,
      SPT: (j) => j.tot,
      SWPT: (j) => j.tot / j.w,
      EDD: (j) => j.due,
    }[rule];
    [...J].sort((a, b) => key(a) - key(b) || a.arr - b.arr).forEach(place);
  }
  return out;
}

/**
 * Jalankan semua aturan pada job yang dibangun ulang oleh `mkJ`,
 * kembalikan ringkasan metrik per aturan.
 */
export function compareRules(mkJ) {
  const total = (a, k) => a.reduce((s, j) => s + j[k], 0);
  return RULES.map((r) => {
    const a = sched(mkJ(), r);
    return {
      r,
      mk: Math.max(...a.map((j) => j.C)),
      T: total(a, 'T'),
      n: a.filter((j) => j.T > 0).length,
      F: total(a, 'F') / a.length,
      WT: total(a, 'WT'),
    };
  });
}

/** Nilai minimum suatu metrik di antara semua aturan. */
export const minMetric = (cmp, k) => Math.min(...cmp.map((c) => c[k]));

/** Apakah aturan `c` terbaik (minimum) untuk metrik `k`? */
export const isBest = (cmp, c, k) => Math.abs(c[k] - minMetric(cmp, k)) < 1e-9;

/** Utilisasi per mesin dari daftar operasi, terhadap makespan `mk`. */
export function mutil(ops, mk) {
  const busy = {};
  ops.forEach((o) => {
    busy[o.m] = (busy[o.m] || 0) + (o.e - o.s);
  });
  return Object.keys(busy).map((m) => ({
    m,
    busy: busy[m],
    idle: mk - busy[m],
    u: (100 * busy[m]) / mk,
  }));
}

/**
 * Johnson's rule untuk flow shop 2 mesin.
 * @param {{id:string,a:number,b:number}[]} R
 */
export function johnson(R) {
  const g1 = R.filter((r) => r.a <= r.b).sort((x, y) => x.a - y.a);
  const g2 = R.filter((r) => r.a > r.b).sort((x, y) => y.b - x.b);
  let ea = 0;
  let eb = 0;
  return [...g1, ...g2].map((r) => {
    const sa = ea;
    ea += r.a;
    const sb = Math.max(ea, eb);
    eb = sb + r.b;
    return { ...r, sa, ea, sb, eb };
  });
}

/** Makespan flow shop 2 mesin untuk urutan apa adanya (tanpa Johnson). */
export function flowShopMakespan(rows) {
  let ea = 0;
  let eb = 0;
  rows.forEach((r) => {
    ea += r.a;
    eb = Math.max(ea, eb) + r.b;
  });
  return eb;
}

/** Utilisasi mesin A dan B dari hasil johnson(). */
export function johnsonUtilization(R) {
  const mk = R[R.length - 1].eb;
  return ['a', 'b'].map((k) => {
    const busy = R.reduce((s, r) => s + r[k], 0);
    return { m: k.toUpperCase(), busy, idle: mk - busy, u: (100 * busy) / mk };
  });
}

// ======================================================================
// 5b. TAMPILAN menu Scheduling
// ======================================================================

/**
 * views/scheduling.js
 * Halaman 5: jadwal job (aturan prioritas), Gantt, utilisasi mesin, Johnson's rule.
 */

/** Label sumbu Y Gantt: "Mesin · util% · idle". */
const machineLabels = (U) => U.map((x) => `${x.m} · ${f(x.u, 0)}% · idle ${f(x.idle, 1)}`);

/** Tabel utilisasi dengan bar berwarna (merah >= 85%, oranye >= 60%). */
const utilTable = (U) =>
  tb(
    [L('Mesin', 'Machine'), L('Waktu kerja', 'Busy time'), 'Idle', L('Utilisasi', 'Utilization')],
    U.map((x) => [
      x.m,
      f(x.busy),
      f(x.idle),
      `<div style="background:rgba(255,255,255,.1);border-radius:999px;min-width:100px"><div style="background:${
        x.u >= 85 ? '#e5484d' : x.u >= 60 ? '#e2711d' : '#6b5a50'
      };color:#fff;border-radius:999px;padding:0 6px;width:${Math.min(100, x.u)}%;min-width:48px">${f(x.u, 1)}%</div></div>`,
    ])
  );

export function renderScheduling() {
  const o = $('sco');
  $('sca').innerHTML = '';
  if (ui.gc) {
    ui.gc.destroy();
    ui.gc = null;
  }
  if (ui.gj) {
    ui.gj.destroy();
    ui.gj = null;
  }

  // ---- Johnson's rule ----
  $('jw').style.display = S.jj ? 'block' : 'none';
  if (S.jj) {
    const mk = Math.max(...S.jj.map((r) => r.eb));
    const U = johnsonUtilization(S.jj);
    $('jo').innerHTML =
      al('i', `${L('Urutan', 'Sequence')}: ${S.jj.map((r) => r.id).join(' → ')} · Makespan: ${mk}`) +
      tb(
        ['Job', 'A', 'B', 'Start A', 'End A', 'Start B', 'End B'],
        S.jj.map((r) => [r.id, r.a, r.b, r.sa, r.ea, r.sb, r.eb])
      ) +
      `<h3>${L('Utilisasi &amp; Idle Mesin', 'Machine Utilization &amp; Idle')}</h3>` +
      utilTable(U) +
      analyzeJohnson();
    ui.gj = gantt(
      'gj',
      S.jj.flatMap((r, i) => [
        { l: r.id, m: 'A', s: r.sa, e: r.ea, k: i },
        { l: r.id, m: 'B', s: r.sb, e: r.eb, k: i },
      ]),
      ['A', 'B'],
      machineLabels(U)
    );
  }

  // ---- Jadwal job ----
  if (!S.jobs) {
    o.innerHTML = need(L('Selesaikan MRP dahulu, atau unggah file Jobs.', 'Complete MRP first, or upload a Jobs file.'));
    return;
  }
  if (!S.jobs.length) {
    o.innerHTML = need(
      L('Tidak ada Planned Order Release yang perlu dijadwalkan (atau item tidak ada di Routing).', 'No Planned Order Releases to schedule (or items missing from Routing).')
    );
    return;
  }

  const J = S.jobs;
  const total = (k) => J.reduce((a, j) => a + j[k], 0);
  const mk = Math.max(...J.map((j) => j.C));
  const late = J.filter((j) => j.T > 0).length;
  const rule = $('rule').value;

  o.innerHTML =
    (D.rt.length || S.useF
      ? ''
      : al('w', L('File Routing belum diunggah: semua item dijadwalkan di mesin M1 dengan 1 jam/unit.', 'No Routing file: all items are scheduled on machine M1 at 1 h/unit.'))) +
    al('i', `${L('Aturan', 'Rule')}: ${rule} · ${L('Sumber', 'Source')}: ${S.useF ? 'File Jobs' : 'MRP'} · Makespan: ${f(mk)} · ${L('Job terlambat', 'Late jobs')}: ${late}/${J.length}`) +
    tb(
      ['#', 'Job', L('Mesin', 'Machine'), L('Datang', 'Arrival'), 'Proc', 'W', 'Due', 'Start', 'Completion', 'Flow', 'Earliness', 'Tardiness', 'W. Tard.'],
      [
        ...J.map((j, i) => [
          i + 1,
          j.id,
          j.ops.map((p) => p.m).join('→'),
          f(j.arr),
          f(j.tot),
          j.w,
          f(j.due),
          f(j.st),
          f(j.C),
          f(j.F),
          f(j.E),
          j.T > 0 ? `<span class="r">${f(j.T)}</span>` : 0,
          f(j.WT),
        ]),
        ['Σ', '', '', '', '', '', '', '', '', f(total('F')), f(total('E')), f(total('T')), f(total('WT'))],
      ]
    );

  ui.gc = gantt(
    'gc',
    J.flatMap((j, i) => j.ops.map((p) => ({ l: j.id, m: p.m, s: p.s, e: p.e, k: i }))),
    S.U.map((x) => x.m),
    machineLabels(S.U)
  );
  $('sca').innerHTML =
    `<h3>${L('Utilisasi &amp; Idle Mesin', 'Machine Utilization &amp; Idle')}</h3>` + utilTable(S.U) + analyzeSchedule();
}

function analyzeSchedule() {
  const J = S.jobs;
  const U = S.U;
  const rule = $('rule').value;
  const cmp = compareRules(S.mkJ);
  const cur = cmp.find((c) => c.r === rule);
  const bestTardRule = cmp.find((c) => isBest(cmp, c, 'T')).r;
  const avgUtil = U.reduce((a, x) => a + x.u, 0) / U.length;
  const busiest = [...U].sort((a, b) => b.u - a.u)[0];
  const mostIdle = [...U].sort((a, b) => b.idle - a.idle)[0];
  const lowest = [...U].sort((a, b) => a.u - b.u)[0];
  const lateJobs = J.filter((j) => j.T > 0);
  const sg = [];
  const cell = (c, k) => (isBest(cmp, c, k) ? `<span class="hl">${f(c[k])}</span>` : f(c[k]));

  if (cur.T > minMetric(cmp, 'T') + 1e-9)
    sg.push(L(`Ganti ${rule} → ${bestTardRule}: total tardiness ${f(cur.T)} → ${f(minMetric(cmp, 'T'))}.`, `Switch ${rule} → ${bestTardRule}: total tardiness ${f(cur.T)} → ${f(minMetric(cmp, 'T'))}.`));
  else if (lateJobs.length)
    sg.push(L(`${lateJobs.length} job tetap terlambat: tambah lembur/kapasitas di ${busiest.m}.`, `${lateJobs.length} jobs stay late: add overtime/capacity at ${busiest.m}.`));
  if (busiest.u >= 85)
    sg.push(L(`${busiest.m} bottleneck (${f(busiest.u, 0)}%): tambah lembur/mesin atau subkontrak.`, `${busiest.m} is the bottleneck (${f(busiest.u, 0)}%): add overtime/machine or subcontract.`));
  if (U.length > 1 && lowest.u < 50)
    sg.push(L(`${lowest.m} idle ${f(lowest.idle, 1)} (${f(100 - lowest.u, 0)}% waktu): seimbangkan beban dari ${busiest.m}.`, `${lowest.m} idles ${f(lowest.idle, 1)} (${f(100 - lowest.u, 0)}% of time): rebalance load from ${busiest.m}.`));
  if (!S.useF && !D.rt.length)
    sg.push(L('Unggah Routing agar mesin & waktu proses realistis.', 'Upload Routing for realistic machines and times.'));
  if (!sg.length) sg.push(L('Semua job tepat waktu dengan beban seimbang; jadwal layak.', 'All jobs on time with balanced load; the schedule is ready.'));

  const table = tb(
    [L('Aturan', 'Rule'), 'Makespan', 'Σ Tardiness', L('Terlambat', 'Late'), L('Rata2 Flow', 'Avg Flow'), 'Σ W. Tard.'],
    cmp.map((c) => [c.r === rule ? `<span class="hl">${c.r} ◀</span>` : c.r, cell(c, 'mk'), cell(c, 'T'), c.n, cell(c, 'F'), cell(c, 'WT')])
  );

  return an(
    L(
      `<b>${rule}</b>: makespan ${f(cur.mk)}, ${cur.n}/${J.length} job terlambat (ΣT ${f(cur.T)}). Utilisasi rata-rata ${f(avgUtil, 0)}%; tersibuk ${busiest.m} (${f(busiest.u, 0)}%), idle terbesar ${mostIdle.m} (${f(mostIdle.idle, 1)}).`,
      `<b>${rule}</b>: makespan ${f(cur.mk)}, ${cur.n}/${J.length} jobs late (ΣT ${f(cur.T)}). Average utilization ${f(avgUtil, 0)}%; busiest ${busiest.m} (${f(busiest.u, 0)}%), largest idle ${mostIdle.m} (${f(mostIdle.idle, 1)}).`
    ),
    sg,
    table
  );
}

function analyzeJohnson() {
  const R = S.jj;
  const mk = R[R.length - 1].eb;
  const inputOrder = flowShopMakespan(D.j2);
  const [A, B] = johnsonUtilization(R);
  const sg = [];

  if (B.u < 70)
    sg.push(L(`Mesin B idle ${f(B.idle, 1)} karena menunggu A: tambah kapasitas A atau pecah batch.`, `Machine B idles ${f(B.idle, 1)} waiting for A: add capacity at A or split batches.`));
  if (A.u < 70)
    sg.push(L(`Mesin A idle ${f(A.idle, 1)} menunggu B bebas: kurangi waktu proses di B.`, `Machine A idles ${f(A.idle, 1)}: shorten processing time at B.`));
  sg.push(L('Urutan Johnson optimal untuk makespan 2 mesin; pakai sebagai jadwal.', "Johnson's sequence minimizes 2-machine makespan; use it as the schedule."));

  return an(
    L(
      `<b>${R.map((r) => r.id).join(' → ')}</b>: makespan ${mk} (urutan input ${inputOrder}${inputOrder > mk ? `, hemat ${inputOrder - mk} = ${f((100 * (inputOrder - mk)) / inputOrder)}%` : ''}). Utilisasi A ${f(A.u, 0)}%, B ${f(B.u, 0)}%.`,
      `<b>${R.map((r) => r.id).join(' → ')}</b>: makespan ${mk} (input order ${inputOrder}${inputOrder > mk ? `, saves ${inputOrder - mk} = ${f((100 * (inputOrder - mk)) / inputOrder)}%` : ''}). Utilization A ${f(A.u, 0)}%, B ${f(B.u, 0)}%.`
    ),
    sg
  );
}
