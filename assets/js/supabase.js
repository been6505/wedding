/**
 * ตัวช่วยคุยกับ Supabase ผ่าน REST API ตรง ๆ
 * ไม่พึ่ง SDK หรือ CDN ใด ๆ เพื่อให้เว็บยังเป็นไฟล์ static ล้วน เปิดออฟไลน์ก็ไม่พัง
 *
 * ใช้ร่วมกันทั้งหน้าการ์ด (ส่งคำตอบรับ) และหน้าเจ้าภาพ (อ่านรายชื่อ)
 */
window.SB = (function () {
  'use strict';

  var cfg = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.supabase) || {};
  var baseUrl = String(cfg.url || '').replace(/\/+$/, '');
  var anonKey = String(cfg.anonKey || '');
  var table = cfg.table || 'rsvps';
  var SESSION_KEY = 'wedding.admin.session';

  function configured() { return !!(baseUrl && anonKey); }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function writeSession(session) {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* โหมดส่วนตัวของเบราว์เซอร์อาจเขียนไม่ได้ — ไม่เป็นไร */ }
  }

  function request(path, options) {
    options = options || {};
    var headers = {
      apikey: anonKey,
      Authorization: 'Bearer ' + (options.token || anonKey),
    };
    if (options.body != null) headers['Content-Type'] = 'application/json';
    Object.keys(options.headers || {}).forEach(function (k) { headers[k] = options.headers[k]; });

    return fetch(baseUrl + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      var isJson = (res.headers.get('content-type') || '').indexOf('json') !== -1;
      return (isJson ? res.json().catch(function () { return null; }) : res.text())
        .then(function (payload) {
          if (res.ok) return payload;
          var message = (payload && (payload.message || payload.error_description || payload.msg || payload.error))
            || ('คำขอไม่สำเร็จ (' + res.status + ')');
          var err = new Error(message);
          err.status = res.status;
          throw err;
        });
    });
  }

  /* ---------- ฝั่งแขก: ส่งคำตอบรับ ---------- */
  function submitRsvp(entry) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
    return request('/rest/v1/' + encodeURIComponent(table), {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        name: entry.name,
        attending: !!entry.attending,
        guests: entry.attending ? entry.guests : 0,
        note: entry.note || null,
      },
    });
  }

  /* ---------- ฝั่งแขก: เช็คอินหน้างาน + คำอวยพร ---------- */
  function submitCheckin(entry) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
    return request('/rest/v1/checkins', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: { name: entry.name, party_size: entry.partySize || 1 },
    });
  }

  function submitWish(entry) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
    return request('/rest/v1/wishes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        name: entry.name,
        kind: entry.kind,
        message: entry.message || null,
        media_path: entry.mediaPath || null,
      },
    });
  }

  // อัปโหลดไฟล์ดิบขึ้น storage (ไม่ผ่าน request เพราะ body ไม่ใช่ JSON)
  function uploadMedia(blob, filename) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
    var path = 'wishes/' + filename;
    return fetch(baseUrl + '/storage/v1/object/' + path, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + anonKey,
        'Content-Type': blob.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: blob,
    }).then(function (res) {
      if (res.ok) return path;
      return res.json().catch(function () { return null; }).then(function (payload) {
        var err = new Error((payload && (payload.message || payload.error)) || 'อัปโหลดไฟล์ไม่สำเร็จ');
        err.status = res.status;
        throw err;
      });
    });
  }

  /* ---------- ฝั่งเจ้าภาพ: ล็อกอิน ---------- */
  function signIn(email, password) {
    return request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email, password: password },
    }).then(function (data) {
      var session = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        email: (data.user && data.user.email) || email,
      };
      writeSession(session);
      return session;
    });
  }

  function refreshSession() {
    var session = readSession();
    if (!session || !session.refreshToken) return Promise.reject(new Error('หมดเวลาเข้าสู่ระบบ'));
    return request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
    }).then(function (data) {
      var next = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        email: (data.user && data.user.email) || session.email,
      };
      writeSession(next);
      return next;
    });
  }

  function signOut() {
    var session = readSession();
    writeSession(null);
    if (!session || !session.accessToken) return Promise.resolve();
    return request('/auth/v1/logout', { method: 'POST', token: session.accessToken })
      .catch(function () { /* ล้าง session ฝั่งเบราว์เซอร์ไปแล้ว ถือว่าออกสำเร็จ */ });
  }

  // เรียก API พร้อม token ของเจ้าภาพ ถ้า token หมดอายุจะต่ออายุแล้วลองใหม่หนึ่งครั้ง
  function authed(path, options) {
    var session = readSession();
    if (!session || !session.accessToken) return Promise.reject(new Error('กรุณาเข้าสู่ระบบ'));

    var call = function (token) {
      return request(path, Object.assign({}, options, { token: token }));
    };

    return call(session.accessToken).catch(function (err) {
      if (err.status !== 401) throw err;
      return refreshSession().then(function (next) { return call(next.accessToken); });
    });
  }

  function list(name) {
    return authed('/rest/v1/' + encodeURIComponent(name) + '?select=*&order=created_at.desc');
  }

  function remove(name, id) {
    return authed('/rest/v1/' + encodeURIComponent(name) + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  // ลิงก์ชั่วคราวสำหรับดูไฟล์ใน bucket ที่ไม่เปิดสาธารณะ
  function signedMediaUrl(path, expiresIn) {
    var objectPath = String(path).replace(/^wishes\//, '');
    return authed('/storage/v1/object/sign/wishes/' + objectPath, {
      method: 'POST',
      body: { expiresIn: expiresIn || 3600 },
    }).then(function (data) {
      if (!data || !data.signedURL) throw new Error('ขอลิงก์ไฟล์ไม่สำเร็จ');
      return baseUrl + '/storage/v1' + data.signedURL;
    });
  }

  return {
    configured: configured,
    session: readSession,
    signIn: signIn,
    signOut: signOut,

    submitRsvp: submitRsvp,
    submitCheckin: submitCheckin,
    submitWish: submitWish,
    uploadMedia: uploadMedia,

    listRsvps: function () { return list(table); },
    listCheckins: function () { return list('checkins'); },
    listWishes: function () { return list('wishes'); },
    deleteRsvp: function (id) { return remove(table, id); },
    deleteCheckin: function (id) { return remove('checkins', id); },
    deleteWish: function (id) { return remove('wishes', id); },
    signedMediaUrl: signedMediaUrl,
  };
})();
