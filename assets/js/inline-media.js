/**
 * ที่เก็บรูปสำรอง — เก็บรูปไว้ในเอกสาร Firestore เลย ไม่ต้องมีบัญชีที่เก็บไฟล์
 *
 * ใช้เมื่อยังไม่ได้ตั้งค่า Cloudinary จะได้ส่งรูปอวยพรกันได้ทันที
 * ข้อจำกัดสำคัญ: Firestore จำกัดเอกสารละ 1 MiB ไฟล์จึงต้องย่อและบีบให้เล็กพอ
 * ก่อนแปลงเป็น data URL — ที่นี่บีบซ้ำหลายรอบจนกว่าจะลอดขนาดที่กำหนด
 *
 * คลิปวิดีโอใช้ทางนี้ไม่ได้ ต่อให้สั้น 30 วินาทีก็ยังเกิน 1 MiB อยู่ดี
 */
window.MEDIA_INLINE = (function () {
  'use strict';

  // เผื่อที่ให้ฟิลด์อื่นในเอกสารและส่วนหัวของ base64 (ขยายจากไบต์จริงราว 4/3)
  var MAX_CHARS = 720 * 1024;

  function configured() { return true; }

  function readAsImage(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
      img.src = url;
    });
  }

  function encode(img, maxWide, quality) {
    var scale = Math.min(1, maxWide / img.width);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  function upload(blob, kind) {
    if (kind === 'video') {
      return Promise.reject(new Error('คลิปวิดีโอต้องตั้งค่า Cloudinary ก่อน'));
    }

    return readAsImage(blob).then(function (img) {
      // ไล่ย่อ/บีบลงเรื่อย ๆ จนกว่าจะเล็กพอใส่เอกสารได้
      var steps = [
        { wide: 1000, q: 0.78 },
        { wide: 860,  q: 0.72 },
        { wide: 720,  q: 0.66 },
        { wide: 600,  q: 0.58 },
        { wide: 480,  q: 0.5 },
      ];
      for (var i = 0; i < steps.length; i++) {
        var data = encode(img, steps[i].wide, steps[i].q);
        if (data.length <= MAX_CHARS) {
          return { provider: 'inline', type: 'photo', data: data };
        }
      }
      throw new Error('รูปใหญ่เกินไป ลองถ่ายใหม่อีกครั้ง');
    });
  }

  return {
    name: 'inline',
    configured: configured,
    upload: upload,
    // ตัว data URL เป็น URL ในตัวเองอยู่แล้ว เอาไปใส่ src ได้เลย
    url: function (ref) { return (ref && ref.data) || null; },
    posterUrl: function () { return null; },
  };
})();
