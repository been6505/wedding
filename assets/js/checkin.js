(function () {
  'use strict';

  var cfg = window.WEDDING_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var MAX_SECONDS = 30;
  var MAX_UPLOAD = 45 * 1024 * 1024;

  var guest = { name: '', partySize: 1 };
  var photoImage = null;
  var videoBlob = null;
  var boothBlob = null;

  var STEPS = ['setupNotice', 'stepCheckin', 'stepHub', 'stepDo', 'stepDone'];

  /* ---------- ตัวช่วย ---------- */
  function toast(message) {
    var box = $('#toast');
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2800);
  }

  function show(id) {
    STEPS.forEach(function (key) {
      var node = $('#' + key);
      if (node) node.hidden = (key !== id);
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
    button.dataset.label = button.dataset.label || button.textContent;
    button.textContent = label;
  }

  function idle(button) {
    button.disabled = false;
    if (button.dataset.label) button.textContent = button.dataset.label;
  }

  function formatWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try {
      return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- ยังไม่ได้ตั้งค่า ----------
   * ไม่มีฐานข้อมูล = หน้านี้ทำอะไรไม่ได้เลย ต้องหยุด
   * มีฐานข้อมูลแต่ไม่มีที่เก็บไฟล์ = เช็คอิน เขียนอวยพร และดู feed ยังทำได้
   *   เมนูที่ต้องใช้กล้องจะถูกปิดไว้
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
  var canVideo = window.BACKEND.videoConfigured();
  var feedOn = !(cfg.wishFeed && cfg.wishFeed.enabled === false);

  /* ---------- จำว่าเช็คอินไปแล้ว ----------
   * กลับเข้าหน้านี้อีกครั้ง (หรือรีเฟรช) จะเข้าหน้าเมนูเลย ไม่ต้องกรอกชื่อซ้ำ
   * เก็บไว้ที่เครื่องแขกล้วน ไม่แตะฐานข้อมูล — และหมดอายุหลังจบงานไปแล้วหนึ่งวัน
   */
  var SEAT_KEY = 'wedding.checkin.seat';
  var SEAT_TTL = 36 * 60 * 60 * 1000;

  function readSeat() {
    try {
      var seat = JSON.parse(localStorage.getItem(SEAT_KEY) || 'null');
      if (!seat || !seat.name) return null;
      if (seat.at && Date.now() - seat.at > SEAT_TTL) return null;
      return seat;
    } catch (e) { return null; }
  }

  function writeSeat(seat) {
    try {
      if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
      else localStorage.removeItem(SEAT_KEY);
    } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ก็แค่ต้องเช็คอินใหม่ */ }
  }

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
        writeSeat({ name: guest.name, partySize: guest.partySize, at: Date.now() });
        greet();
        show('stepHub');
      })
      .catch(function (err) {
        console.error(err);
        toast('เช็คอินไม่สำเร็จ กรุณาลองใหม่');
      })
      .then(function () { idle(button); });
  });

  function greet() {
    $('#welcome').textContent = 'เช็คอินเรียบร้อยแล้ว ' + guest.name;
  }

  var seat = readSeat();
  if (seat) {
    guest.name = seat.name;
    guest.partySize = seat.partySize || 1;
    greet();
    show('stepHub');
  } else {
    show('stepCheckin');
  }

  $('#notMe').addEventListener('click', function () {
    writeSeat(null);
    guest = { name: '', partySize: 1 };
    $('#guestName').value = '';
    show('stepCheckin');
  });

  /* ---------- เมนูหน้างาน ---------- */
  var TITLES = {
    text: 'เขียนอวยพร',
    photo: 'ถ่ายภาพอวยพร',
    video: 'ถ่ายวิดีโออวยพร',
    booth: 'Photobooth',
    feed: 'Feed อวยพร',
  };

  // รูปเก็บลงฐานข้อมูลได้ถ้าไม่มีที่เก็บไฟล์ แต่คลิปวิดีโอใหญ่เกินกว่าจะทำแบบนั้น
  if (!canUpload) {
    $$('.menu__item[data-needs-media]').forEach(function (item) {
      item.disabled = true;
      item.classList.add('is-off');
    });
    $('#mediaOff').hidden = false;
  } else if (!canVideo) {
    var vid = $('.menu__item[data-go="video"]');
    if (vid) { vid.disabled = true; vid.classList.add('is-off'); }
    $('#mediaOff').textContent = 'เมนูถ่ายวิดีโอยังปิดอยู่ เพราะคลิปต้องใช้ที่เก็บไฟล์แยก ' +
                                 'ส่วนถ่ายภาพกับ Photobooth ใช้ได้ตามปกติ';
    $('#mediaOff').hidden = false;
  }
  if (!feedOn) {
    var feedBtn = $('.menu__item[data-go="feed"]');
    if (feedBtn) feedBtn.hidden = true;
  }

  function openPane(mode) {
    $('#doTitle').textContent = TITLES[mode] || '';
    $$('.pane').forEach(function (pane) {
      pane.classList.toggle('is-active', pane.dataset.pane === mode);
    });
    if (mode !== 'video') stopCamera();
    if (mode !== 'booth') stopBooth();
    show('stepDo');
    if (mode === 'feed') loadFeed();
  }

  $$('.menu__item').forEach(function (item) {
    item.addEventListener('click', function () { openPane(item.dataset.go); });
  });

  $('#backHub').addEventListener('click', function () {
    stopCamera();
    stopBooth();
    show('stepHub');
  });

  function finish(message) {
    $('#doneText').textContent = message;
    stopCamera();
    stopBooth();
    show('stepDone');
  }

  $('#skipWish').addEventListener('click', function () {
    finish('เช็คอินของท่านถูกบันทึกแล้ว ขอบคุณที่มาร่วมงาน');
  });

  // คืนทุกช่องให้กลับเป็นสภาพเริ่มต้น แล้วกลับไปหน้าเมนู
  function resetAll() {
    photoImage = null; videoBlob = null; boothBlob = null;
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

    resetBoothUi();
  }

  $('#againBtn').addEventListener('click', function () {
    resetAll();
    greet();
    show('stepHub');
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

  // อัปโหลดไฟล์แล้วบันทึกคำอวยพร ใช้ร่วมกันทั้งการ์ดรูป คลิป และ photobooth
  function sendMedia(blob, kind, message, doneText, button) {
    window.BACKEND.uploadMedia(blob, kind === 'video' ? 'video' : 'photo')
      .then(function (media) {
        return window.BACKEND.submitWish({
          name: guest.name,
          kind: kind === 'video' ? 'video' : 'photo',
          message: message || '',
          media: media,
        });
      })
      .then(function () { finish(doneText); })
      .catch(function (err) {
        console.error(err);
        toast('ส่งไม่สำเร็จ กรุณาลองใหม่');
      })
      .then(function () { idle(button); });
  }

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
      ctx.font = '400 ' + sizes[i] + 'px Sriracha, Charm, cursive';
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

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ไล่เฉดพื้นหลัง ขาวอมชมพูจาง ๆ ให้ไม่แบนจนเกินไป
    var bg = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, CARD_H, CARD_H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#fbf1f0');
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

    // กรอบแดงรอบรูป
    ctx.strokeStyle = 'rgba(162,25,37,.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // กรอบแดงรอบการ์ด
    ctx.strokeStyle = 'rgba(162,25,37,.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, CARD_W - 68, CARD_H - 68);

    ctx.textAlign = 'center';

    // ชื่อคู่บ่าวสาวด้านบน
    ctx.fillStyle = '#a21925';
    ctx.font = '400 46px Sriracha, Charm, cursive';
    ctx.fillText(coupleNames(), CARD_W / 2, 108);

    // คำอวยพร จัดขนาดให้พอดีช่องว่างระหว่างรูปกับเส้นคั่น
    var footY = CARD_H - 130;
    var textTop = box.y + box.h + 80;
    var textSpace = (footY - 56) - textTop - 24;

    if (message) {
      var fit = fitMessage(ctx, message, CARD_W - 220, textSpace);
      ctx.fillStyle = '#4a3126';
      ctx.font = '400 ' + fit.size + 'px Sriracha, Charm, cursive';
      var y = textTop + fit.lineHeight * 0.8;
      fit.lines.forEach(function (line) {
        ctx.fillText(line, CARD_W / 2, y);
        y += fit.lineHeight;
      });
    }

    // เส้นคั่นและชื่อผู้ส่ง
    ctx.strokeStyle = 'rgba(162,25,37,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CARD_W / 2 - 90, footY - 56);
    ctx.lineTo(CARD_W / 2 + 90, footY - 56);
    ctx.stroke();

    ctx.fillStyle = '#8d2833';
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
      if (blob.size > MAX_UPLOAD) { idle(button); toast('ไฟล์ใหญ่เกินไป'); return; }
      sendMedia(blob, 'photo', $('#photoMessage').value.trim(),
                'การ์ดอวยพรของท่านถูกส่งถึงบ่าวสาวแล้ว', button);
    }, 'image/jpeg', 0.88);
  });

  /* ---------- กล้อง ---------- */
  function supportsCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function supportsRecording() {
    return supportsCamera() && !!window.MediaRecorder;
  }

  // withAudio: photobooth ไม่ต้องขอไมค์ ขอแค่ที่จำเป็นจะได้ไม่ต้องกวนผู้ใช้เกินเหตุ
  function openCamera(videoEl, withAudio) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: !!withAudio,
    }).then(function (media) {
      videoEl.srcObject = media;
      videoEl.hidden = false;
      videoEl.play();
      return media;
    });
  }

  /* ---------- อวยพรด้วยคลิปวิดีโอ ---------- */
  var stream = null;
  var recorder = null;
  var chunks = [];
  var timer = null;
  var seconds = 0;

  var liveVideo = $('#videoLive');
  var playback = $('#videoPlayback');

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

    openCamera(liveVideo, true).then(function (media) {
      stream = media;
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
    $('#cameraStart').hidden = false;
    $('#recordToggle').textContent = 'เริ่มอัด';
    $('#recordToggle').hidden = true;
  });

  $('#sendVideo').addEventListener('click', function () {
    if (!videoBlob) { toast('ยังไม่มีคลิป'); return; }
    if (videoBlob.size > MAX_UPLOAD) { toast('คลิปใหญ่เกินไป ลองอัดสั้นลง'); return; }

    var button = this;
    busy(button, 'กำลังอัปโหลด...');
    sendMedia(videoBlob, 'video', $('#videoMessage').value.trim(),
              'คลิปอวยพรของท่านถูกส่งถึงบ่าวสาวแล้ว', button);
  });

  /* ================= Photobooth ================= */
  var SHOTS = 3;
  var SHOT_W = 720;
  var SHOT_H = 540;          // 4:3 ต่อช็อต
  var STRIP_PAD = 30;
  var STRIP_GAP = 18;
  var STRIP_FOOT = 190;
  var STRIP_W = SHOT_W + STRIP_PAD * 2;
  var STRIP_H = STRIP_PAD + (SHOT_H * SHOTS) + (STRIP_GAP * (SHOTS - 1)) + STRIP_FOOT;

  var boothStream = null;
  var boothShots = [];
  var boothBusy = false;
  var boothLive = $('#boothLive');
  var boothCanvas = $('#boothCanvas');
  boothCanvas.width = STRIP_W;
  boothCanvas.height = STRIP_H;

  if (!supportsCamera()) {
    $('#boothStart').hidden = true;
    $('#boothUnsupported').hidden = false;
  }

  function stopBooth() {
    if (boothStream) {
      boothStream.getTracks().forEach(function (t) { t.stop(); });
      boothStream = null;
    }
    boothLive.hidden = true;
    $('#boothCount').hidden = true;
    $('#boothShot').hidden = true;
  }

  function resetBoothUi() {
    boothShots = [];
    boothBlob = null;
    boothBusy = false;
    $('#boothPreview').hidden = true;
    $('#boothDone').hidden = true;
    $('#boothRedo').hidden = true;
    $('#boothShoot').hidden = true;
    $('#boothEmpty').hidden = false;
    $('#boothStart').hidden = !supportsCamera();
  }

  $('#boothStart').addEventListener('click', function () {
    var button = this;
    busy(button, 'กำลังเปิดกล้อง...');
    openCamera(boothLive, false).then(function (media) {
      boothStream = media;
      $('#boothEmpty').hidden = true;
      $('#boothPreview').hidden = true;
      button.hidden = true;
      $('#boothShoot').hidden = false;
    }).catch(function (err) {
      console.error(err);
      toast('เปิดกล้องไม่ได้ กรุณาอนุญาตให้ใช้กล้อง');
    }).then(function () { idle(button); });
  });

  // ดึงภาพนิ่งจากกล้องหนึ่งเฟรม ครอบให้เต็มกรอบ 4:3 แบบ cover
  function grabShot() {
    var c = document.createElement('canvas');
    c.width = SHOT_W;
    c.height = SHOT_H;
    var ctx = c.getContext('2d');
    var vw = boothLive.videoWidth || SHOT_W;
    var vh = boothLive.videoHeight || SHOT_H;
    var scale = Math.max(SHOT_W / vw, SHOT_H / vh);
    var dw = vw * scale;
    var dh = vh * scale;
    // กล้องหน้าแสดงภาพกลับด้านเหมือนส่องกระจก บันทึกให้ตรงกับที่เห็นบนจอ
    ctx.translate(SHOT_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(boothLive, (SHOT_W - dw) / 2, (SHOT_H - dh) / 2, dw, dh);
    return c;
  }

  function countdown(from) {
    var badge = $('#boothCount');
    badge.hidden = false;
    return new Promise(function (resolve) {
      var left = from;
      var tick = function () {
        badge.textContent = left;
        badge.classList.remove('is-tick');
        void badge.offsetWidth;   // บังคับให้แอนิเมชันเริ่มใหม่ทุกวินาที
        badge.classList.add('is-tick');
      };
      tick();
      var iv = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(iv);
          badge.hidden = true;
          resolve();
          return;
        }
        tick();
      }, 1000);
    });
  }

  function flash() {
    var f = $('#boothFlash');
    f.classList.remove('is-on');
    void f.offsetWidth;
    f.classList.add('is-on');
    return new Promise(function (r) { setTimeout(r, 260); });
  }

  function drawStrip() {
    var ctx = boothCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, STRIP_W, STRIP_H);

    boothShots.forEach(function (shot, i) {
      var y = STRIP_PAD + i * (SHOT_H + STRIP_GAP);
      ctx.drawImage(shot, STRIP_PAD, y, SHOT_W, SHOT_H);
      ctx.strokeStyle = 'rgba(162,25,37,.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(STRIP_PAD, y, SHOT_W, SHOT_H);
    });

    // กรอบแดงรอบแถบ
    ctx.strokeStyle = 'rgba(162,25,37,.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, STRIP_W - 20, STRIP_H - 20);

    // ท้ายแถบ: ชื่อบ่าวสาว วันที่ และชื่อคนถ่าย
    var footTop = STRIP_H - STRIP_FOOT;
    ctx.textAlign = 'center';

    ctx.strokeStyle = 'rgba(162,25,37,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(STRIP_W / 2 - 70, footTop + 26);
    ctx.lineTo(STRIP_W / 2 + 70, footTop + 26);
    ctx.stroke();

    ctx.fillStyle = '#a21925';
    ctx.font = '400 46px Sriracha, Charm, cursive';
    ctx.fillText(coupleNames(), STRIP_W / 2, footTop + 90);

    var date = cfg.date || {};
    var line = [date.weekdayTh, date.monthYearTh].filter(Boolean).join(' · ');
    ctx.fillStyle = 'rgba(74, 49, 38,.6)';
    ctx.font = '300 26px Mali, "Noto Sans Thai", sans-serif';
    ctx.fillText(line, STRIP_W / 2, footTop + 134);

    if (guest.name) {
      ctx.fillStyle = '#8d2833';
      ctx.font = '300 24px Mali, "Noto Sans Thai", sans-serif';
      ctx.fillText('— ' + guest.name + ' —', STRIP_W / 2, footTop + 172);
    }
  }

  $('#boothShoot').addEventListener('click', function () {
    if (boothBusy) return;
    boothBusy = true;
    this.hidden = true;
    boothShots = [];

    var shotBadge = $('#boothShot');
    shotBadge.hidden = false;

    var run = Promise.resolve();
    for (var i = 0; i < SHOTS; i++) {
      (function (index) {
        run = run
          .then(function () { shotBadge.textContent = (index + 1) + ' / ' + SHOTS; })
          .then(function () { return countdown(3); })
          .then(flash)
          .then(function () {
            boothShots.push(grabShot());
            return new Promise(function (r) { setTimeout(r, 600); });
          });
      })(i);
    }

    run.then(function () {
      shotBadge.hidden = true;
      stopBooth();
      if (document.fonts && document.fonts.ready) return document.fonts.ready.then(drawStrip);
      drawStrip();
      return null;
    }).then(function () {
      $('#boothPreview').hidden = false;
      $('#boothRedo').hidden = false;
      $('#boothDone').hidden = false;
      boothCanvas.toBlob(function (blob) {
        boothBlob = blob;
        if (blob) $('#boothSave').href = URL.createObjectURL(blob);
      }, 'image/jpeg', 0.9);
      boothBusy = false;
    }).catch(function (err) {
      console.error(err);
      toast('ถ่ายไม่สำเร็จ ลองใหม่อีกครั้ง');
      resetBoothUi();
    });
  });

  $('#boothRedo').addEventListener('click', function () {
    stopBooth();
    resetBoothUi();
  });

  $('#boothSend').addEventListener('click', function () {
    if (!boothBlob) { toast('ยังไม่มีรูป'); return; }
    if (boothBlob.size > MAX_UPLOAD) { toast('ไฟล์ใหญ่เกินไป'); return; }
    var button = this;
    busy(button, 'กำลังส่ง...');
    sendMedia(boothBlob, 'photo', 'Photobooth', 'รูป Photobooth ถูกส่งถึงบ่าวสาวแล้ว', button);
  });

  /* ================= Feed อวยพร ================= */
  var feedRows = [];
  var feedFilter = 'all';
  var feedLoaded = false;

  $$('.chip[data-feed]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $$('.chip[data-feed]').forEach(function (o) { o.classList.remove('is-active'); });
      chip.classList.add('is-active');
      feedFilter = chip.dataset.feed;
      renderFeed();
    });
  });

  $('#feedRefresh').addEventListener('click', function () { loadFeed(true); });

  function loadFeed(force) {
    if (feedLoaded && !force) { renderFeed(); return; }
    $('#feedState').hidden = false;
    $('#feedState').textContent = 'กำลังโหลด...';
    window.BACKEND.listPublicWishes(200)
      .then(function (rows) {
        feedRows = rows || [];
        feedLoaded = true;
        renderFeed();
      })
      .catch(function (err) {
        console.error(err);
        $('#feedState').textContent = 'โหลดไม่สำเร็จ: ' + err.message;
      });
  }

  function renderFeed() {
    var grid = $('#feed');
    var state = $('#feedState');
    grid.textContent = '';

    var visible = feedRows.filter(function (row) {
      return feedFilter === 'all' || row.kind === feedFilter;
    });

    if (!feedRows.length) {
      state.hidden = false;
      state.textContent = 'ยังไม่มีคำอวยพร เป็นคนแรกเลยไหม';
      return;
    }
    if (!visible.length) {
      state.hidden = false;
      state.textContent = 'ยังไม่มีคำอวยพรประเภทนี้';
      return;
    }
    state.hidden = true;

    visible.forEach(function (row) { grid.appendChild(feedCard(row)); });
  }

  function feedCard(row) {
    var card = el('article', 'wish');

    var head = el('div', 'wish__head');
    head.appendChild(el('p', 'wish__name', row.name || '—'));
    head.appendChild(el('span', 'wish__when', formatWhen(row.createdAt)));
    card.appendChild(head);

    if (row.message) card.appendChild(el('p', 'wish__message', row.message));

    if (row.media) {
      var slot = el('div', 'wish__media');
      card.appendChild(slot);
      if (row.kind === 'video') feedVideo(slot, row.media);
      else feedPhoto(slot, row.media);
    }

    return card;
  }

  function feedPhoto(slot, ref) {
    window.BACKEND.mediaUrl(ref).then(function (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'การ์ดอวยพร';
      // data URL ไม่มีอะไรให้โหลดข้ามเครือข่ายอยู่แล้ว การตั้ง lazy จึงไม่ได้ประโยชน์
      // ซ้ำยังทำให้บางเบราว์เซอร์เลื่อนการถอดรหัสไว้จนรูปไม่ขึ้นเลย
      if (url.indexOf('data:') !== 0) img.loading = 'lazy';
      slot.appendChild(img);
    }, function () { slot.remove(); });
  }

  function feedVideo(slot, ref) {
    var button = el('button', 'btn btn--ghost', 'เล่นคลิป');
    button.type = 'button';
    button.addEventListener('click', function () {
      button.disabled = true;
      window.BACKEND.mediaUrl(ref).then(function (url) {
        slot.textContent = '';
        var video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        var poster = window.BACKEND.mediaPoster(ref);
        if (poster) video.poster = poster;
        slot.appendChild(video);
      }, function () {
        button.disabled = false;
        toast('เปิดคลิปไม่ได้');
      });
    });
    slot.appendChild(button);
  }

  window.addEventListener('pagehide', function () { stopCamera(); stopBooth(); });
})();
