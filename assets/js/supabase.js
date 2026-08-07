/**
 * คุยกับ Supabase (Postgres + Auth + Storage) ผ่าน REST API ตรง ๆ
 * ไม่พึ่ง SDK หรือ CDN เพื่อให้เว็บยังเป็นไฟล์ static ล้วน
 *
 * เป็นทางเลือกสำรองของ Firebase — สลับได้ที่ `backend` ใน config.js
 * แขกเขียนข้อมูลได้อย่างเดียว อ่านไม่ได้ — บังคับด้วย supabase/schema.sql
 */
window.BACKEND_SUPABASE = (function () {
  'use strict';

  var cfg = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.supabase) || {};
  var baseUrl = String(cfg.url || '').replace(/\/+$/, '');
  var anonKey = String(cfg.anonKey || '');
  var SESSION_KEY = 'wedding.admin.session.supabase';

  function configured() { return !!(baseUrl && anonKey); }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function writeSession(session) {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* โหมดส่วนตัวอาจเขียนไม่ได้ — ไม่เป็นไร */ }
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

  function insert(table, row) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
    return request('/rest/v1/' + table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: row,
    });
  }

  /* ---------- ล็อกอินเจ้าภาพ ---------- */
  function signIn(email, password) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));
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
      .catch(function () { /* ล้างฝั่งเบราว์เซอร์ไปแล้ว ถือว่าออกสำเร็จ */ });
  }

  function authed(path, options) {
    var session = readSession();
    if (!session || !session.accessToken) return Promise.reject(new Error('กรุณาเข้าสู่ระบบ'));

    var run = function (token) {
      var merged = {};
      Object.keys(options || {}).forEach(function (k) { merged[k] = options[k]; });
      merged.token = token;
      return request(path, merged);
    };

    return run(session.accessToken).catch(function (err) {
      if (err.status !== 401) throw err;
      return refreshSession().then(function (next) { return run(next.accessToken); });
    });
  }

  function list(table) {
    return authed('/rest/v1/' + table + '?select=*&order=created_at.desc');
  }

  function remove(table, id) {
    return authed('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  /* ---------- ที่เก็บไฟล์ของ Supabase เอง ---------- */
  function uploadMedia(blob, kind) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Supabase'));

    var ext = kind === 'video'
      ? (blob.type.indexOf('mp4') !== -1 ? 'mp4' : 'webm')
      : 'jpg';
    var name = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var path = 'wishes/' + name + '.' + ext;

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
      if (res.ok) return { provider: 'supabase', path: path, type: kind };
      return res.json().catch(function () { return null; }).then(function (payload) {
        var err = new Error((payload && (payload.message || payload.error)) || 'อัปโหลดไฟล์ไม่สำเร็จ');
        err.status = res.status;
        throw err;
      });
    });
  }

  // ลิงก์ชั่วคราวสำหรับดูไฟล์ใน bucket ที่ไม่เปิดสาธารณะ
  function mediaUrl(ref) {
    if (!ref || !ref.path) return Promise.reject(new Error('ไม่พบไฟล์'));
    var objectPath = String(ref.path).replace(/^wishes\//, '');
    return authed('/storage/v1/object/sign/wishes/' + objectPath, {
      method: 'POST',
      body: { expiresIn: 3600 },
    }).then(function (data) {
      if (!data || !data.signedURL) throw new Error('ขอลิงก์ไฟล์ไม่สำเร็จ');
      return baseUrl + '/storage/v1' + data.signedURL;
    });
  }

  return {
    name: 'supabase',
    configured: configured,
    session: readSession,
    signIn: signIn,
    signOut: signOut,

    hasOwnStorage: true,
    uploadMedia: uploadMedia,
    mediaUrl: mediaUrl,

    submitRsvp: function (entry) {
      return insert('rsvps', {
        name: entry.name,
        attending: !!entry.attending,
        guests: entry.attending ? (entry.guests || 1) : 0,
      });
    },

    submitCheckin: function (entry) {
      return insert('checkins', { name: entry.name, party_size: entry.partySize || 1 });
    },

    submitWish: function (entry) {
      return insert('wishes', {
        name: entry.name,
        kind: entry.kind,
        message: entry.message || null,
        media_path: (entry.media && entry.media.path) || null,
      });
    },

    listRsvps: function () {
      return list('rsvps').then(function (rows) {
        return (rows || []).map(function (r) {
          return {
            id: r.id, name: r.name, attending: !!r.attending,
            guests: r.guests || 0, createdAt: r.created_at,
          };
        });
      });
    },

    listCheckins: function () {
      return list('checkins').then(function (rows) {
        return (rows || []).map(function (r) {
          return { id: r.id, name: r.name, partySize: r.party_size || 1, createdAt: r.created_at };
        });
      });
    },

    listWishes: function () {
      return list('wishes').then(function (rows) {
        return (rows || []).map(function (r) {
          return {
            id: r.id, name: r.name, kind: r.kind, message: r.message || '',
            media: r.media_path ? { provider: 'supabase', path: r.media_path, type: r.kind } : null,
            createdAt: r.created_at,
          };
        });
      });
    },

    deleteRsvp: function (id) { return remove('rsvps', id); },
    deleteCheckin: function (id) { return remove('checkins', id); },
    deleteWish: function (id) { return remove('wishes', id); },
  };
})();
