/**
 * คุยกับ Firebase (Cloud Firestore + Authentication) ผ่าน REST API ตรง ๆ
 * ไม่โหลด Firebase SDK จาก CDN เพื่อให้เว็บยังเป็นไฟล์ static ล้วน
 *
 * แขกเขียนข้อมูลได้อย่างเดียว อ่านไม่ได้ — บังคับด้วย firebase/firestore.rules
 * เจ้าภาพล็อกอินด้วยอีเมล/รหัสผ่านแล้วจึงอ่านและลบได้
 */
window.BACKEND_FIREBASE = (function () {
  'use strict';

  var cfg = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.firebase) || {};
  var projectId = String(cfg.projectId || '');
  var apiKey = String(cfg.apiKey || '');
  var SESSION_KEY = 'wedding.admin.session.firebase';

  var docsUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId +
                '/databases/(default)/documents';

  function configured() { return !!(projectId && apiKey); }

  /* ---------- session ---------- */
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

  /* ---------- แปลงค่าไป-กลับรูปแบบของ Firestore ---------- */
  function toValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map(toValue) } };
    }
    if (typeof value === 'object') {
      return { mapValue: { fields: toFields(value) } };
    }
    return { stringValue: String(value) };
  }

  function toFields(obj) {
    var fields = {};
    Object.keys(obj).forEach(function (key) {
      if (obj[key] === undefined) return;
      fields[key] = toValue(obj[key]);
    });
    return fields;
  }

  function fromValue(value) {
    if (!value) return null;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return value.doubleValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('mapValue' in value) return fromFields((value.mapValue && value.mapValue.fields) || {});
    if ('arrayValue' in value) {
      return ((value.arrayValue && value.arrayValue.values) || []).map(fromValue);
    }
    return null;
  }

  function fromFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (key) { out[key] = fromValue(fields[key]); });
    return out;
  }

  function docId(name) {
    return String(name || '').split('/').pop();
  }

  /* ---------- เรียก API ---------- */
  function call(url, options) {
    options = options || {};
    var headers = {};
    if (options.body != null) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = 'Bearer ' + options.token;

    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (payload) {
        if (res.ok) return payload;
        var message = (payload && payload.error && (payload.error.message || payload.error.status)) ||
                      ('คำขอไม่สำเร็จ (' + res.status + ')');
        var err = new Error(message);
        err.status = res.status;
        throw err;
      });
    });
  }

  function createDoc(collection, data) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Firebase'));
    return call(docsUrl + '/' + collection + '?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      body: { fields: toFields(data) },
    });
  }

  // เรียก API ด้วย token ของเจ้าภาพ ถ้าหมดอายุจะต่ออายุแล้วลองใหม่หนึ่งครั้ง
  function authed(url, options) {
    var session = readSession();
    if (!session || !session.idToken) return Promise.reject(new Error('กรุณาเข้าสู่ระบบ'));

    var run = function (token) {
      var merged = {};
      Object.keys(options || {}).forEach(function (k) { merged[k] = options[k]; });
      merged.token = token;
      return call(url, merged);
    };

    return run(session.idToken).catch(function (err) {
      if (err.status !== 401 && err.status !== 403) throw err;
      return refreshSession().then(function (next) { return run(next.idToken); });
    });
  }

  function listDocs(collection) {
    return authed(docsUrl + ':runQuery?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: collection }],
          orderBy: [{ field: { fieldPath: 'created_at' }, direction: 'DESCENDING' }],
          limit: 1000,
        },
      },
    }).then(function (rows) {
      return (rows || [])
        .filter(function (row) { return row && row.document; })
        .map(function (row) {
          var data = fromFields(row.document.fields || {});
          data.id = docId(row.document.name);
          return data;
        });
    });
  }


  // อ่านแบบไม่ต้องล็อกอิน ใช้กับ Feed อวยพรที่กฎเปิดให้อ่านสาธารณะ
  function listPublic(collection, limit) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Firebase'));
    return call(docsUrl + ':runQuery?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: collection }],
          orderBy: [{ field: { fieldPath: 'created_at' }, direction: 'DESCENDING' }],
          limit: limit || 200,
        },
      },
    }).then(function (rows) {
      return (rows || [])
        .filter(function (row) { return row && row.document; })
        .map(function (row) {
          var data = fromFields(row.document.fields || {});
          data.id = docId(row.document.name);
          return data;
        });
    });
  }

  function deleteDoc(collection, id) {
    return authed(docsUrl + '/' + collection + '/' + encodeURIComponent(id) +
                  '?key=' + encodeURIComponent(apiKey), { method: 'DELETE' });
  }

  /* ---------- ตั้งค่าสถานที่ (เอกสารเดียว settings/venue) ---------- */
  // อ่านแบบไม่ต้องล็อกอิน การ์ดหน้าแรกเรียกใช้ได้เลย
  function getVenue() {
    if (!configured()) return Promise.resolve(null);
    return call(docsUrl + '/settings/venue?key=' + encodeURIComponent(apiKey))
      .then(function (doc) { return doc && doc.fields ? fromFields(doc.fields) : null; })
      .catch(function (err) { if (err.status === 404) return null; throw err; });
  }

  // เขียนทับทั้งเอกสาร ใช้เฉพาะเจ้าภาพที่ล็อกอินแล้ว
  function saveVenue(data) {
    return authed(docsUrl + '/settings/venue?key=' + encodeURIComponent(apiKey), {
      method: 'PATCH',
      body: {
        fields: toFields({
          name: String(data.name || ''),
          address: String(data.address || ''),
          map_url: String(data.mapUrl || ''),
          updated_at: now(),
        }),
      },
    });
  }

  /* ---------- ล็อกอินเจ้าภาพ ---------- */
  function signIn(email, password) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Firebase'));
    return call('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' +
                encodeURIComponent(apiKey), {
      method: 'POST',
      body: { email: email, password: password, returnSecureToken: true },
    }).then(function (data) {
      var session = {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        email: data.email || email,
      };
      writeSession(session);
      return session;
    });
  }


  /* ---------- ล็อกอินด้วย Google ----------
   * ใช้ Google Identity Services หยิบ ID token ของ Google มาก่อน
   * แล้วเอาไปแลกเป็น session ของ Firebase ผ่าน accounts:signInWithIdp
   * ทั้งหมดเป็น REST ล้วน ไม่ต้องโหลด Firebase SDK
   */
  function signInWithGoogleToken(googleIdToken) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Firebase'));
    return call('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=' +
                encodeURIComponent(apiKey), {
      method: 'POST',
      body: {
        postBody: 'id_token=' + encodeURIComponent(googleIdToken) + '&providerId=google.com',
        requestUri: window.location.origin,
        returnIdpCredential: true,
        returnSecureToken: true,
      },
    }).then(function (data) {
      var session = {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        email: data.email || '',
      };
      writeSession(session);
      return session;
    });
  }

  function refreshSession() {
    var session = readSession();
    if (!session || !session.refreshToken) return Promise.reject(new Error('หมดเวลาเข้าสู่ระบบ'));

    var body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken);
    return fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok || !data || !data.id_token) {
          writeSession(null);
          var err = new Error('หมดเวลาเข้าสู่ระบบ');
          err.status = 401;
          throw err;
        }
        var next = {
          idToken: data.id_token,
          refreshToken: data.refresh_token || session.refreshToken,
          email: session.email,
        };
        writeSession(next);
        return next;
      });
    });
  }

  function signOut() {
    writeSession(null);
    return Promise.resolve();
  }

  /* ---------- ข้อมูลของงาน ---------- */
  function now() { return new Date(); }

  return {
    name: 'firebase',
    configured: configured,
    session: readSession,
    signIn: signIn,
    signInWithGoogleToken: signInWithGoogleToken,
    signOut: signOut,

    // Firebase Storage ต้องผูกบัตรก่อนใช้ จึงให้ไฟล์ไปอยู่กับผู้ให้บริการสื่อแยก
    hasOwnStorage: false,

    submitRsvp: function (entry) {
      return createDoc('rsvps', {
        name: entry.name,
        attending: !!entry.attending,
        guests: entry.attending ? (entry.guests || 1) : 0,
        created_at: now(),
      });
    },

    submitCheckin: function (entry) {
      return createDoc('checkins', {
        name: entry.name,
        party_size: entry.partySize || 1,
        created_at: now(),
      });
    },

    submitWish: function (entry) {
      return createDoc('wishes', {
        name: entry.name,
        kind: entry.kind,
        message: entry.message || '',
        media: entry.media || null,
        created_at: now(),
      });
    },

    listRsvps: function () {
      return listDocs('rsvps').then(function (rows) {
        return rows.map(function (r) {
          return {
            id: r.id, name: r.name, attending: !!r.attending,
            guests: r.guests || 0, createdAt: r.created_at,
          };
        });
      });
    },

    listCheckins: function () {
      return listDocs('checkins').then(function (rows) {
        return rows.map(function (r) {
          return { id: r.id, name: r.name, partySize: r.party_size || 1, createdAt: r.created_at };
        });
      });
    },

    listWishes: function () {
      return listDocs('wishes').then(function (rows) {
        return rows.map(function (r) {
          return {
            id: r.id, name: r.name, kind: r.kind,
            message: r.message || '', media: r.media || null, createdAt: r.created_at,
          };
        });
      });
    },

    // Feed สาธารณะ — คืนเฉพาะฟิลด์ที่ต้องใช้แสดงผล
    listPublicWishes: function (limit) {
      return listPublic('wishes', limit).then(function (rows) {
        return rows.map(function (r) {
          return {
            id: r.id, name: r.name, kind: r.kind,
            message: r.message || '', media: r.media || null, createdAt: r.created_at,
          };
        });
      });
    },

    deleteRsvp: function (id) { return deleteDoc('rsvps', id); },
    deleteCheckin: function (id) { return deleteDoc('checkins', id); },
    deleteWish: function (id) { return deleteDoc('wishes', id); },

    getVenue: getVenue,
    saveVenue: saveVenue,
  };
})();
