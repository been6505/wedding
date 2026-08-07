/**
 * อัปโหลดรูปและคลิปขึ้น Cloudinary แบบ unsigned
 * ไม่ต้องมีเซิร์ฟเวอร์ ไม่ต้องใช้ API secret
 *
 * ส่งไฟล์คืนมาเป็น "media reference" หน้าตาแบบนี้
 *   { provider: 'cloudinary', id: 'wedding-wishes/abc123', type: 'video', format: 'webm' }
 * เก็บลงฐานข้อมูลได้ตรง ๆ แล้วค่อยเอามาประกอบเป็น URL ตอนแสดงผล
 */
window.MEDIA_CLOUDINARY = (function () {
  'use strict';

  var cfg = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.cloudinary) || {};
  var cloudName = String(cfg.cloudName || '');
  var preset = String(cfg.uploadPreset || '');
  var folder = String(cfg.folder || '');

  function configured() { return !!(cloudName && preset); }

  function upload(blob, kind) {
    if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Cloudinary'));

    var resourceType = (kind === 'video') ? 'video' : 'image';
    var form = new FormData();
    form.append('file', blob);
    form.append('upload_preset', preset);
    if (folder) form.append('folder', folder);

    return fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/' + resourceType + '/upload', {
      method: 'POST',
      body: form,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (payload) {
        if (!res.ok || !payload || !payload.public_id) {
          var reason = (payload && payload.error && payload.error.message) || 'อัปโหลดไฟล์ไม่สำเร็จ';
          var err = new Error(reason);
          err.status = res.status;
          throw err;
        }
        return {
          provider: 'cloudinary',
          id: payload.public_id,
          type: payload.resource_type || resourceType,
          format: payload.format || '',
        };
      });
    });
  }

  /**
   * ประกอบ URL สำหรับแสดงผล
   * f_auto ให้ Cloudinary เลือกฟอร์แมตที่เบราว์เซอร์ของผู้ชมเปิดได้เอง
   * (คลิป .webm จากแอนดรอยด์จึงเปิดบน iPhone ได้ โดยไม่ต้องแปลงไฟล์เอง)
   */
  function url(ref, options) {
    if (!ref || ref.provider !== 'cloudinary' || !ref.id) return null;
    options = options || {};

    var type = ref.type === 'video' ? 'video' : 'image';
    var steps = ['f_auto', 'q_auto'];
    if (options.width) steps.push('w_' + options.width);
    if (type === 'image') steps.push('c_limit');

    return 'https://res.cloudinary.com/' + cloudName + '/' + type + '/upload/' +
           steps.join(',') + '/' + ref.id;
  }

  // ภาพนิ่งจากคลิป ใช้เป็นภาพปกก่อนกดเล่น
  function posterUrl(ref) {
    if (!ref || ref.provider !== 'cloudinary' || ref.type !== 'video') return null;
    return 'https://res.cloudinary.com/' + cloudName + '/video/upload/f_auto,q_auto,so_0/' + ref.id + '.jpg';
  }

  return {
    name: 'cloudinary',
    configured: configured,
    upload: upload,
    url: url,
    posterUrl: posterUrl,
  };
})();
