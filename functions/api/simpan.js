/**
 * Cloudflare Pages Function: POST /api/simpan
 *
 * Perantara antara browser dan Google Apps Script.
 * URL Apps Script dan TOKEN disimpan sebagai environment variable di Cloudflare,
 * jadi keduanya tidak pernah terlihat di browser.
 *
 * Environment variables (Settings → Variables and Secrets):
 *   APPS_SCRIPT_URL : URL web app Apps Script yang berakhiran /exec
 *   TOKEN           : harus sama persis dengan TOKEN di Script Properties Apps Script
 */

export async function onRequestPost({ request, env }) {
  if (!env.APPS_SCRIPT_URL || !env.TOKEN) {
    return balas({ ok: false, pesan: "Server belum dikonfigurasi: APPS_SCRIPT_URL atau TOKEN kosong." }, 500);
  }

  let isbn = "";
  try {
    const body = await request.json();
    isbn = String(body.isbn || "").replace(/[^0-9X]/gi, "").toUpperCase();
  } catch {
    return balas({ ok: false, pesan: "Data yang dikirim tidak valid." }, 400);
  }

  // Validasi awal supaya request sampah tidak sampai ke Google
  if (!/^(97[89]\d{10}|\d{9}[\dX])$/.test(isbn)) {
    return balas({ ok: false, pesan: "Ini bukan barcode ISBN. Scan barcode yang diawali 978 atau 979." }, 400);
  }

  const url = String(env.APPS_SCRIPT_URL).trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
    return balas({ ok: false, pesan: "APPS_SCRIPT_URL harus berformat https://script.google.com/macros/s/.../exec (bukan /dev atau URL editor)." }, 500);
  }

  try {
    // Apps Script menjalankan doPost lalu membalas 302 ke googleusercontent.com,
    // dan hasilnya diambil dengan GET ke alamat itu. Redirect diikuti manual
    // supaya method-nya pasti GET dan statusnya bisa dilaporkan kalau gagal.
    let res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn, token: env.TOKEN }),
      redirect: "manual"
    });
    for (let i = 0; i < 3 && res.status >= 300 && res.status < 400; i++) {
      const lokasi = res.headers.get("Location");
      if (!lokasi) break;
      res = await fetch(new URL(lokasi, url), { redirect: "manual" });
    }

    const teks = await res.text();
    let data;
    try {
      data = JSON.parse(teks);
    } catch {
      return balas({ ok: false, pesan: diagnosa(res.status, teks) }, 502);
    }
    return balas(data, data.ok ? 200 : 400);

  } catch (err) {
    return balas({ ok: false, pesan: "Tidak bisa menghubungi Apps Script: " + err.message }, 502);
  }
}

// Terjemahkan balasan HTML dari Google menjadi petunjuk perbaikan
function diagnosa(status, teks) {
  const judul = (teks.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  const isi = (judul + " " + teks).toLowerCase();
  let saran;
  if (isi.includes("accounts.google.com") || isi.includes("sign in") || isi.includes("login")) {
    saran = "Web app minta login. Deploy ulang dengan 'Execute as: Me' dan 'Who has access: Anyone'.";
  } else if (isi.includes("authorization") || isi.includes("otorisasi") || isi.includes("izin")) {
    saran = "Script belum diberi izin. Jalankan fungsi tesSimpan sekali dari editor Apps Script.";
  } else if (status === 404 || isi.includes("not found") || isi.includes("tidak dapat ditemukan")) {
    saran = "URL web app tidak ditemukan. Salin ulang URL /exec dari Deploy → Manage deployments.";
  } else if (isi.includes("dofunction") || isi.includes("script function not found")) {
    saran = "Fungsi doPost tidak ada di versi yang di-deploy. Buat versi baru: Deploy → Manage deployments → Edit → New version.";
  } else {
    saran = "Cek pengaturan deploy Apps Script.";
  }
  return "Apps Script tidak membalas JSON (HTTP " + status + (judul ? ", \"" + judul.trim() + "\"" : "") + "). " + saran;
}

function balas(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
