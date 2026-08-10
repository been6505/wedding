/**
 * เลือกผู้ให้บริการฐานข้อมูลและที่เก็บไฟล์ตามค่าใน config.js
 * แล้วประกอบเป็นหน้ากากเดียวชื่อ window.BACKEND ให้หน้าอื่นเรียกใช้
 *
 * ฐานข้อมูล : config.backend        →  'firebase' หรือ 'supabase'
 * ไฟล์สื่อ   : config.media.provider →  'cloudinary' หรือ 'backend'
 *
 * หน้าเว็บทุกหน้าคุยกับ window.BACKEND เท่านั้น ไม่รู้จักผู้ให้บริการโดยตรง
 * จะเปลี่ยนเจ้าเมื่อไหร่ก็แก้แค่ config.js
 */
window.BACKEND = (function () {
  'use strict';

  var cfg = window.WEDDING_CONFIG || {};
  var choice = cfg.backend || 'firebase';
  var mediaChoice = (cfg.media && cfg.media.provider) || 'cloudinary';

  var db = (choice === 'supabase') ? window.BACKEND_SUPABASE : window.BACKEND_FIREBASE;
  var cloud = window.MEDIA_CLOUDINARY;
  var inline = window.MEDIA_INLINE;

  // ปัญหาการตั้งค่าที่ทำให้ใช้งานไม่ได้ เก็บไว้บอกผู้ใช้เป็นภาษาคน
  // แยกสองกอง เพราะฐานข้อมูลกับที่เก็บไฟล์ล้มคนละเรื่องกัน:
  // ไม่มีที่เก็บไฟล์ = ส่งรูป/คลิปไม่ได้ แต่ตอบรับ เช็คอิน และอวยพรเป็นข้อความยังทำได้ปกติ
  var dbProblems = [];
  var mediaProblems = [];

  if (!db) {
    dbProblems.push('ไม่พบไฟล์ของผู้ให้บริการ "' + choice + '" — ตรวจว่า <script> โหลดครบหรือยัง');
  } else if (!db.configured()) {
    dbProblems.push(choice === 'firebase'
      ? 'ยังไม่ได้กรอก firebase.projectId และ firebase.apiKey ใน assets/js/config.js'
      : 'ยังไม่ได้กรอก supabase.url และ supabase.anonKey ใน assets/js/config.js');
  }

  var media = null;
  if (mediaChoice === 'cloudinary') {
    if (cloud && cloud.configured()) {
      media = cloud;
    } else if (inline) {
      // ยังไม่ได้ตั้งค่า Cloudinary — ถอยไปเก็บรูปไว้ในฐานข้อมูลแทน
      // ส่งรูปได้เลยโดยไม่ต้องรอตั้งค่าอะไร แลกกับที่คลิปวิดีโอยังส่งไม่ได้
      media = inline;
    } else {
      mediaProblems.push('ไม่พบไฟล์ assets/js/cloudinary.js และ assets/js/inline-media.js');
    }
  } else if (db && db.hasOwnStorage) {
    media = {
      name: db.name,
      upload: db.uploadMedia,
      url: function (ref) { return db.mediaUrl(ref); },
      posterUrl: function () { return null; },
    };
  } else {
    mediaProblems.push('ผู้ให้บริการ "' + choice + '" ไม่มีที่เก็บไฟล์ในตัว ต้องตั้ง media.provider เป็น "cloudinary"');
  }

  function dbConfigured() { return dbProblems.length === 0; }
  function mediaConfigured() { return !!media; }
  // คลิปวิดีโอต้องมีที่เก็บไฟล์จริง เก็บลงฐานข้อมูลไม่ไหว
  function videoConfigured() { return !!media && media.name !== 'inline'; }
  function configured() { return dbConfigured() && mediaConfigured(); }
  function issues() { return dbProblems.concat(mediaProblems); }

  function guard() {
    return Promise.reject(new Error(issues()[0] || 'ยังไม่ได้ตั้งค่าระบบหลังบ้าน'));
  }

  function via(method) {
    return function () {
      if (!db || !db.configured()) return guard();
      // ผู้ให้บริการบางเจ้าไม่มีความสามารถนี้ ตอบเป็น error ที่อ่านรู้เรื่องดีกว่าพังทั้งหน้า
      if (typeof db[method] !== 'function') {
        return Promise.reject(new Error('ผู้ให้บริการ "' + choice + '" ยังไม่รองรับ ' + method));
      }
      return db[method].apply(db, arguments);
    };
  }

  return {
    provider: choice,
    mediaProvider: media ? media.name : null,
    configured: configured,
    issues: issues,

    // ตรวจแยกทีละส่วน สำหรับหน้าที่ทำงานต่อได้แม้ไม่มีที่เก็บไฟล์
    dbConfigured: dbConfigured,
    dbIssues: function () { return dbProblems.slice(); },
    mediaConfigured: mediaConfigured,
    videoConfigured: videoConfigured,
    mediaIssues: function () { return mediaProblems.slice(); },

    session: function () { return db && db.configured() ? db.session() : null; },
    signIn: via('signIn'),
    signInWithGoogleToken: via('signInWithGoogleToken'),
    signOut: function () { return db ? db.signOut() : Promise.resolve(); },

    submitRsvp: via('submitRsvp'),
    submitCheckin: via('submitCheckin'),
    submitWish: via('submitWish'),

    listRsvps: via('listRsvps'),
    listCheckins: via('listCheckins'),
    listWishes: via('listWishes'),
    listPublicWishes: via('listPublicWishes'),

    deleteRsvp: via('deleteRsvp'),
    deleteCheckin: via('deleteCheckin'),
    deleteWish: via('deleteWish'),

    // สถานที่จัดงาน เก็บในฐานข้อมูล เจ้าภาพแก้ทีหลังได้จากหน้า /admin
    // อ่านล้มเหลว/ยังไม่ตั้งค่า = คืน null การ์ดจะโชว์ "เร็วๆ นี้" แทน
    getVenue: function () {
      if (db && db.configured() && typeof db.getVenue === 'function') return db.getVenue();
      return Promise.resolve(null);
    },
    saveVenue: via('saveVenue'),

    // kind คือ 'photo' หรือ 'video'
    uploadMedia: function (blob, kind) {
      if (!media) return guard();
      return media.upload(blob, kind);
    },

    mediaUrl: function (ref) {
      // อ่านตามผู้ให้บริการที่ฝังมากับตัวข้อมูล ไม่ใช่ตามที่ตั้งค่าไว้ตอนนี้
      // ของเก่าที่ส่งมาก่อนเปลี่ยนการตั้งค่าจึงยังเปิดดูได้
      if (ref && ref.provider === 'inline' && inline) return Promise.resolve(inline.url(ref));
      if (ref && ref.provider === 'cloudinary' && cloud) return Promise.resolve(cloud.url(ref));
      if (!media) return guard();
      return Promise.resolve(media.url(ref));
    },

    mediaPoster: function (ref) {
      if (ref && ref.provider === 'cloudinary' && cloud) return cloud.posterUrl(ref);
      return null;
    },
  };
})();
