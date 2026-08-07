(function () {
  'use strict';

  var cfg = window.WEDDING_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var MAX_SECONDS = 30;
  var MAX_UPLOAD = 45 * 1024 * 1024;

  var guest = { name: '', partySize: 1 };
  var photoBlob = null;
  var photoImage = null;
  var videoBlob = null;

  /* ---------- ตัวช่วย ---------- */
  function toast(message) {
    var box = $('#toast');
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2800);
  }

  function show(id) {
    ['setupNotice', 'stepCheckin', 'stepWish', 'stepDone'].forEach(function (key) {
      $('#' + key).hidden = (key !== id);
    });
    window.scrollTo(0, 0);
  }

  function coupleNames() {
    var couple = cfg.couple || {};
    var groom = (couple.groom && couple.groom.th) || '';
    var bride = (couple.bride && couple.bride.th) || '';
    return groom && bride ? groom + ' & ' + bride : 'งานวะลีมะฮฺ';
  }

  function busy(button, label) {
    button.disabled = true;
    button.dataset.label = button.textContent;
    button.textContent = label;
  }

  function idle(button) {
    button.disabled = false;
    if (button.dataset.label) button.textContent = button.dataset.label;
  }

  /* ---------- ยังไม่ได้ตั้งค่า ----------
   * ไม่มีฐานข้อมูล = หน้านี้ทำอะไรไม่ได้เลย ต้องหยุด
   * มีฐานข้อมูลแต่ไม่มีที่เก็บไฟล์ = เช็คอินและอวยพรเป็นข้อความยังทำได้
   *   แค่ซ่อนแท็บการ์ดรูปกับคลิปไว้
   */
  if (!window.BACKEND || !window.BACKEND.dbConfigured()) {
    var list = $('#setupIssues');
    var reasons = (window.BACKEND && window.BACKEND.dbIssues()) || ['ไม่พบไฟล์ assets/js/backend.js'];
    reasons.forEach(function (reason) {
      var item = document.createElement('li');
      item.textContent = reason;
      list.appendChild(item);
    });
    show('setupNotice');
    return;
  }

  var canUpload = window.BACKEND.mediaConfigured();

  /* ---------- ขั้นที่ 1: เช็คอิน ---------- */
  $('#coupleTitle').textContent = coupleNames();

  var partySelect = $('#partySize');
  for (var n = 1; n <= 20; n++) {
    var option = document.createElement('option');
    option.value = String(n);
    option.textContent = n + ' ท่าน';
    partySelect.appendChild(option);
  }

  $('#checkinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('#guestName');
    var name = input.value.trim();
    if (!name) { toast('กรุณากรอกชื่อของท่าน'); input.focus(); return; }

    var button = $('#checkinSubmit');
    busy(button, 'กำลังเช็คอิน...');

    guest.name = name;
    guest.partySize = parseInt(partySelect.value, 10) || 1;

    window.BACKEND.submitCheckin(guest)
      .then(function () {
        $('#welcome').textContent = 'เช็คอินเรียบร้อยแล้ว ' + guest.name;
        show('stepWish');
      })
      .catch(function (err) {
        console.error(err);
        toast('เช็คอินไม่สำเร็จ กรุณาลองใหม่');
      })
      .then(function () { idle(button); });
  });

  show('stepCheckin');

  /* ---------- แท็บวิธีอวยพร ---------- */
  // ไม่มีที่เก็บไฟล์ก็ส่งรูปหรือคลิปไม่ได้ ซ่อนแท็บทิ้งดีกว่าปล่อยให้กดแล้วพัง
  // (ซ่อนอย่างเดียว ไม่ลบทิ้ง โค้ดข้างล่างยังหา element เจอเหมือนเดิม)
  if (!canUpload) {
    $$('.tab').forEach(function (tab) {
      if (tab.dataset.mode !== 'text') tab.hidden = true;
    });
  }

  function selectTab(mode) {
    $$('.tab').forEach(function (tab) {
      var on = tab.dataset.mode === mode;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.pane').forEach(function (pane) {
      pane.classList.toggle('is-active', pane.dataset.pane === mode);
    });
    if (mode !== 'video') stopCamera();
  }

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { selectTab(tab.dataset.mode); });
  });

  function finish(message) {
    $('#doneText').textContent = message;
    stopCamera();
    show('stepDone');
  }

  $('#skipWish').addEventListener('click', function () {
    finish('เช็คอินของท่านถูกบันทึกแล้ว ขอบคุณที่มาร่วมงาน');
  });

  // คืนหน้าอวยพรให้กลับเป็นสภาพเริ่มต้นทุกช่อง
  // (เดิมลืมคืนปุ่มกล้อง ทำให้กด "ส่งอีกครั้ง" แล้วอัดคลิปใหม่ไม่ได้)
  function resetWishForm() {
    photoBlob = null; photoImage = null; videoBlob = null;
    $('#wishText').value = '';
    $('#photoMessage').value = '';
    $('#photoPreview').hidden = true;
    $('#photoMessageField').hidden = true;
    $('#sendPhoto').hidden = true;
    $('#photoInput').value = '';
    $('#photoPick').textContent = 'เลือก / ถ่ายรูป';

    $('#videoMessage').value = '';
    playback.hidden = true;
    playback.removeAttribute('src');
    $('#videoEmpty').hidden = false;
    $('#videoMessageField').hidden = true;
    $('#sendVideo').hidden = true;
    $('#recordRedo').hidden = true;
    $('#recordToggle').hidden = true;
    $('#recordToggle').textContent = 'เริ่มอัด';
    $('#cameraStart').hidden = !supportsRecording();
  }

  $('#againBtn').addEventListener('click', function () {
    resetWishForm();
    selectTab('text');
    show('stepWish');
  });

  /* ---------- อวยพรด้วยข้อความ ---------- */
  $('#sendText').addEventListener('click', function () {
    var field = $('#wishText');
    var message = field.value.trim();
    if (!message) { toast('กรุณาพิมพ์คำอวยพร'); field.focus(); return; }

    var button = this;
    busy(button, 'กำลังส่ง...');
    window.BACKEND.submitWish({ name: guest.name, kind: 'text', message: message })
      .then(function () { finish('คำอวยพรของท่านถูกส่งถึงบ่าวสาวแล้ว'); })
      .catch(function (err) {
        console.error(err);
        toast('ส่งไม่สำเร็จ กรุณาลองใหม่');
      })
      .then(function () { idle(button); });
  });

  /* ---------- อวยพรด้วยการ์ดรูป ---------- */
  var canvas = $('#photoCanvas');
  var CARD_W = 1080;
  var CARD_H = 1350;
  canvas.width = CARD_W;
  canvas.height = CARD_H;

  // ภาษาไทยไม่เว้นวรรคระหว่างคำ ถ้าเบราว์เซอร์รองรับ Intl.Segmenter
  // ให้ตัดตามคำจริง ไม่งั้นค่อยถอยไปตัดทีละตัวอักษร
  var segmenter = null;
  if (window.Intl && Intl.Segmenter) {
    try { segmenter = new Intl.Segmenter('th', { granularity: 'word' }); }
    catch (e) { segmenter = null; }
  }

  function pieces(paragraph) {
    if (segmenter) {
      var out = [];
      var iterator = segmenter.segment(paragraph)[Symbol.iterator]();
      var step = iterator.next();
      while (!step.done) {
        if (step.value.segment) out.push(step.value.segment);
        step = iterator.next();
      }
      return out;
    }
    return paragraph.split('');
  }

  function wrapLines(ctx, text, maxWidth) {
    var lines = [];
    text.split('\n').forEach(function (paragraph) {
      if (!paragraph.trim()) { lines.push(''); return; }
      var line = '';
      pieces(paragraph).forEach(function (part) {
        if (ctx.measureText(line + part).width <= maxWidth) {
          line += part;
          return;
        }
        if (line.trim()) lines.push(line.trim());
        // ชิ้นเดียวยาวเกินบรรทัด ต้องตัดกลางชิ้น
        if (ctx.measureText(part).width > maxWidth) {
          var chunk = '';
          for (var i = 0; i < part.length; i++) {
            if (chunk && ctx.measureText(chunk + part[i]).width > maxWidth) {
              lines.push(chunk);
              chunk = '';
            }
            chunk += part[i];
          }
          line = chunk;
        } else {
          line = part.replace(/^\s+/, '');
        }
      });
      if (line.trim()) lines.push(line.trim());
    });
    return lines;
  }

  // เลือกขนาดตัวอักษรที่ใหญ่ที่สุดที่ยังใส่ข้อความได้ครบในพื้นที่ที่เหลือ
  function fitMessage(ctx, text, maxWidth, maxHeight) {
    var sizes = [54, 48, 42, 36, 30];
    for (var i = 0; i < sizes.length; i++) {
      ctx.font = '400 ' + sizes[i] + 'px Charmonman, Charm, cursive';
      var lines = wrapLines(ctx, text, maxWidth);
      var lineHeight = Math.round(sizes[i] * 1.42);
      if (lines.length * lineHeight <= maxHeight || i === sizes.length - 1) {
        var maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
        if (lines.length > maxLines) {
          lines = lines.slice(0, maxLines);
          lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
        }
        return { lines: lines, lineHeight: lineHeight, size: sizes[i] };
      }
    }
    return { lines: [], lineHeight: 0, size: 0 };
  }

  function drawCard() {
    var ctx = canvas.getContext('2d');
    var message = $('#photoMessage').value.trim();

    ctx.fillStyle = '#3d0f1c';
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ไล่เฉดพื้นหลัง
    var bg = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, CARD_H, CARD_H);
    bg.addColorStop(0, '#55162b');
    bg.addColorStop(1, '#2a0912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // รูปของแขก จัดให้เต็มกรอบแบบ cover
    var box = { x: 70, y: 150, w: CARD_W - 140, h: 690 };
    if (photoImage) {
      var scale = Math.max(box.w / photoImage.width, box.h / photoImage.height);
      var dw = photoImage.width * scale;
      var dh = photoImage.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.drawImage(photoImage, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
      ctx.restore();
    }

    // กรอบทองรอบรูป
    ctx.strokeStyle = 'rgba(201,160,99,.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // กรอบทองรอบการ์ด
    ctx.strokeStyle = 'rgba(201,160,99,.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, CARD_W - 68, CARD_H - 68);

    ctx.textAlign = 'center';

    // ชื่อคู่บ่าวสาวด้านบน
    ctx.fillStyle = '#c9a063';
    ctx.font = '400 46px Charmonman, Charm, cursive';
    ctx.fillText(coupleNames(), CARD_W / 2, 108);

    // คำอวยพร จัดขนาดให้พอดีช่องว่างระหว่างรูปกับเส้นคั่น
    var footY = CARD_H - 130;
    var textTop = box.y + box.h + 80;
    var textSpace = (footY - 56) - textTop - 24;

    if (message) {
      var fit = fitMessage(ctx, message, CARD_W - 220, textSpace);
      ctx.fillStyle = '#f4ece0';
      ctx.font = '400 ' + fit.size + 'px Charmonman, Charm, cursive';
      var y = textTop + fit.lineHeight * 0.8;
      fit.lines.forEach(function (line) {
        ctx.fillText(line, CARD_W / 2, y);
        y += fit.lineHeight;
      });
    }

    // เส้นคั่นและชื่อผู้ส่ง
    ctx.strokeStyle = 'rgba(201,160,99,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CARD_W / 2 - 90, footY - 56);
    ctx.lineTo(CARD_W / 2 + 90, footY - 56);
    ctx.stroke();

    ctx.fillStyle = '#e0c081';
    ctx.font = '300 38px Mali, "Noto Sans Thai", sans-serif';
    ctx.fillText('จาก ' + guest.name, CARD_W / 2, footY);
  }

  function redrawSoon() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(drawCard);
    } else {
      drawCard();
    }
  }

  $('#photoInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        photoImage = image;
        $('#photoPreview').hidden = false;
        $('#photoMessageField').hidden = false;
        $('#sendPhoto').hidden = false;
        $('#photoPick').textContent = 'เปลี่ยนรูป';
        redrawSoon();
      };
      image.onerror = function () { toast('เปิดไฟล์รูปไม่ได้ ลองรูปอื่น'); };
      image.src = reader.result;
    };
    reader.onerror = function () { toast('อ่านไฟล์ไม่สำเร็จ'); };
    reader.readAsDataURL(file);
  });

  $('#photoMessage').addEventListener('input', drawCard);

  $('#sendPhoto').addEventListener('click', function () {
    if (!photoImage) { toast('กรุณาเลือกรูปก่อน'); return; }

    var button = this;
    busy(button, 'กำลังส่ง...');
    drawCard();

    canvas.toBlob(function (blob) {
      if (!blob) { idle(button); toast('สร้างการ์ดไม่สำเร็จ'); return; }
      photoBlob = blob;
      if (blob.size > MAX_UPLOAD) { idle(button); toast('ไฟล์ใหญ่เกินไป'); return; }

      window.BACKEND.uploadMedia(blob, 'photo')
        .then(function (media) {
          return window.BACKEND.submitWish({
            name: guest.name,
            kind: 'photo',
            message: $('#photoMessage').value.trim(),
            media: media,
          });
        })
        .then(function () { finish('การ์ดอวยพรของท่านถูกส่งถึงบ่าวสาวแล้ว'); })
        .catch(function (err) {
          console.error(err);
          toast('ส่งไม่สำเร็จ กรุณาลองใหม่');
        })
        .then(function () { idle(button); });
    }, 'image/jpeg', 0.88);
  });

  /* ---------- อวยพรด้วยคลิปวิดีโอ ---------- */
  var stream = null;
  var recorder = null;
  var chunks = [];
  var timer = null;
  var seconds = 0;

  var liveVideo = $('#videoLive');
  var playback = $('#videoPlayback');

  function supportsRecording() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function pickMimeType() {
    var candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function stopCamera() {
    if (recorder && recorder.state === 'recording') recorder.stop();
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    clearInterval(timer);
    $('#recBadge').hidden = true;
    liveVideo.hidden = true;
  }

  if (!supportsRecording()) {
    $('#cameraStart').hidden = true;
    $('#videoUnsupported').hidden = false;
  }

  $('#cameraStart').addEventListener('click', function () {
    var button = this;
    busy(button, 'กำลังเปิดกล้อง...');

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: true,
    }).then(function (media) {
      stream = media;
      liveVideo.srcObject = media;
      liveVideo.hidden = false;
      liveVideo.play();
      playback.hidden = true;
      $('#videoEmpty').hidden = true;
      button.hidden = true;
      $('#recordToggle').hidden = false;
    }).catch(function (err) {
      console.error(err);
      toast('เปิดกล้องไม่ได้ กรุณาอนุญาตให้ใช้กล้องและไมค์');
    }).then(function () { idle(button); });
  });

  $('#recordToggle').addEventListener('click', function () {
    var button = this;

    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }

    var mimeType = pickMimeType();
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      console.error(err);
      toast('อุปกรณ์นี้อัดวิดีโอไม่ได้');
      return;
    }

    chunks = [];
    seconds = 0;
    $('#recTime').textContent = '0:00';
    $('#recBadge').hidden = false;

    recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function () {
      clearInterval(timer);
      $('#recBadge').hidden = true;
      videoBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });

      liveVideo.hidden = true;
      playback.src = URL.createObjectURL(videoBlob);
      playback.hidden = false;

      button.hidden = true;
      $('#recordRedo').hidden = false;
      $('#videoMessageField').hidden = false;
      $('#sendVideo').hidden = false;

      if (stream) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        stream = null;
      }
    };

    recorder.start();
    button.textContent = 'หยุดอัด';

    timer = setInterval(function () {
      seconds++;
      $('#recTime').textContent = '0:' + (seconds < 10 ? '0' : '') + seconds;
      if (seconds >= MAX_SECONDS && recorder.state === 'recording') recorder.stop();
    }, 1000);
  });

  $('#recordRedo').addEventListener('click', function () {
    videoBlob = null;
    playback.hidden = true;
    playback.removeAttribute('src');
    $('#videoEmpty').hidden = false;
    $('#videoMessageField').hidden = true;
    $('#sendVideo').hidden = true;
    this.hidden = true;
    var start = $('#cameraStart');
    start.hidden = false;
    $('#recordToggle').textContent = 'เริ่มอัด';
    $('#recordToggle').hidden = true;
  });

  $('#sendVideo').addEventListener('click', function () {
    if (!videoBlob) { toast('ยังไม่มีคลิป'); return; }
    if (videoBlob.size > MAX_UPLOAD) {
      toast('คลิปใหญ่เกินไป ลองอัดสั้นลง');
      return;
    }

    var button = this;
    busy(button, 'กำลังอัปโหลด...');

    window.BACKEND.uploadMedia(videoBlob, 'video')
      .then(function (media) {
        return window.BACKEND.submitWish({
          name: guest.name,
          kind: 'video',
          message: $('#videoMessage').value.trim(),
          media: media,
        });
      })
      .then(function () { finish('คลิปอวยพรของท่านถูกส่งถึงบ่าวสาวแล้ว'); })
      .catch(function (err) {
        console.error(err);
        toast('ส่งไม่สำเร็จ กรุณาลองใหม่');
      })
      .then(function () { idle(button); });
  });

  window.addEventListener('pagehide', stopCamera);
})();
