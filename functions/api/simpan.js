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

  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn, token: env.TOKEN }),
      redirect: "follow"
    });

    const teks = await res.text();
    let data;
    try {
      data = JSON.parse(teks);
    } catch {
      // Biasanya terjadi kalau web app belum di-deploy dengan akses "Anyone"
      return balas({ ok: false, pesan: "Apps Script tidak membalas JSON. Cek pengaturan deploy (akses: Anyone)." }, 502);
    }
    return balas(data, data.ok ? 200 : 400);

  } catch (err) {
    return balas({ ok: false, pesan: "Tidak bisa menghubungi Apps Script: " + err.message }, 502);
  }
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
