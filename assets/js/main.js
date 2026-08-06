(function () {
  'use strict';

  var cfg = window.WEDDING_CONFIG;
  if (!cfg) {
    console.error('ไม่พบ WEDDING_CONFIG — ตรวจสอบว่า assets/js/config.js โหลดก่อน main.js');
    return;
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- helper: อ่านค่าจาก path เช่น "groom.nickname" ---------- */
  function get(path) {
    var scope = cfg;
    // ย่อ groom/bride ให้เขียนสั้นใน HTML ได้
    if (path.indexOf('groom.') === 0 || path.indexOf('bride.') === 0) scope = cfg.couple;
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, scope);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function toast(message) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2200);
  }

  /* ---------- 1. เติมข้อความทั้งหมดจาก config ---------- */
  function bindText() {
    $$('[data-bind]').forEach(function (node) {
      var value = get(node.getAttribute('data-bind'));
      if (typeof value === 'string' && value.trim() !== '') {
        node.textContent = value;
      } else if (node.dataset.bind !== 'bismillah') {
        node.textContent = '';
      }
    });

    if (cfg.options && cfg.options.showBismillah) {
      var b = $('[data-bind="bismillah"]');
      if (b) { b.textContent = cfg.options.bismillahText || ''; b.hidden = false; }
    }

    document.title = [get('groom.nickname'), get('bride.nickname')].filter(Boolean).join(' & ') || 'การ์ดงานแต่ง';
  }

  /* ---------- 2. ซองจดหมาย ---------- */
  function initEnvelope() {
    var envelope = $('#envelope');
    var card = $('#card');
    if (!envelope || !card) return;

    function open() {
      envelope.classList.add('is-open');
      card.hidden = false;
      // ให้ reveal ทำงานหลังการ์ดปรากฏ
      requestAnimationFrame(revealCheck);
      if (cfg.options && cfg.options.backgroundMusic) tryPlayMusic();
      setTimeout(function () { envelope.remove(); }, 900);
    }

    envelope.addEventListener('click', open);
    envelope.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    envelope.tabIndex = 0;
    envelope.setAttribute('role', 'button');
    envelope.setAttribute('aria-label', 'แตะเพื่อเปิดการ์ด');
  }

  /* ---------- 3. นับถอยหลัง + เพิ่มลงปฏิทิน ---------- */
  function initCountdown() {
    var target = new Date(cfg.startsAt);
    if (isNaN(target)) return;

    var fields = {
      days: $('[data-count="days"]'),
      hours: $('[data-count="hours"]'),
      minutes: $('[data-count="minutes"]'),
      seconds: $('[data-count="seconds"]'),
    };
    var list = $('#countdown');
    var done = $('#countdownDone');

    function tick() {
      var diff = target - new Date();
      if (diff <= 0) {
        if (list) list.hidden = true;
        if (done) done.hidden = false;
        clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      if (fields.days) fields.days.textContent = Math.floor(s / 86400);
      if (fields.hours) fields.hours.textContent = Math.floor(s % 86400 / 3600);
      if (fields.minutes) fields.minutes.textContent = Math.floor(s % 3600 / 60);
      if (fields.seconds) fields.seconds.textContent = s % 60;
    }

    tick();
    var timer = setInterval(tick, 1000);

    var link = $('#addToCalendar');
    if (link) {
      var end = cfg.endsAt ? new Date(cfg.endsAt) : new Date(target.getTime() + 4 * 3600 * 1000);
      var stamp = function (d) { return d.toISOString().replace(/[-:]|\.\d{3}/g, ''); };
      var title = 'งานมงคลสมรส ' + [get('groom.nickname'), get('bride.nickname')].filter(Boolean).join(' & ');
      var details = [cfg.venue && cfg.venue.name, cfg.venue && cfg.venue.mapUrl].filter(Boolean).join('\n');
      link.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + '&text=' + encodeURIComponent(title)
        + '&dates=' + stamp(target) + '/' + stamp(end)
        + '&details=' + encodeURIComponent(details)
        + '&location=' + encodeURIComponent((cfg.venue && cfg.venue.address) || '');
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }

  /* ---------- 4. กำหนดการ ---------- */
  function initSchedule() {
    var list = $('#timeline');
    if (!list) return;
    var items = cfg.schedule || [];
    if (!items.length) { list.closest('.section').hidden = true; return; }

    items.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('span', 'timeline__time', item.time || ''));
      var body = el('div');
      body.appendChild(el('p', 'timeline__title', item.title || ''));
      if (item.note) body.appendChild(el('p', 'timeline__note', item.note));
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  /* ---------- 5. สถานที่ ---------- */
  function initVenue() {
    var venue = cfg.venue || {};

    var link = $('#mapLink');
    if (link) {
      if (venue.mapUrl) { link.href = venue.mapUrl; }
      else { link.hidden = true; }
    }

    var box = $('#venueMap');
    if (box && venue.mapEmbedUrl) {
      var frame = document.createElement('iframe');
      frame.src = venue.mapEmbedUrl;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.title = 'แผนที่' + (venue.name ? ' ' + venue.name : '');
      frame.allowFullscreen = true;
      box.appendChild(frame);
    }
  }

  /* ---------- 6. โทนสีการแต่งกาย ---------- */
  function initPalette() {
    var list = $('#palette');
    if (!list) return;
    var colors = (cfg.dressCode && cfg.dressCode.palette) || [];
    if (!colors.length) { list.hidden = true; return; }

    colors.forEach(function (color) {
      var li = el('li');
      li.style.background = color;
      li.title = color;
      list.appendChild(li);
    });
  }

  /* ---------- 7. แกลเลอรี ---------- */
  function initGallery() {
    var grid = $('#galleryGrid');
    if (!grid) return;
    var photos = cfg.gallery || [];
    if (!photos.length) { grid.closest('.section').hidden = true; return; }

    photos.forEach(function (src, i) {
      var figure = el('figure');
      var img = document.createElement('img');
      img.src = src;
      img.alt = 'ภาพคู่บ่าวสาว ' + (i + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      // ยังไม่มีไฟล์รูป → แสดงกรอบว่างแทนไอคอนรูปเสีย
      img.addEventListener('error', function () {
        figure.classList.add('is-missing');
        figure.textContent = 'รอรูปภาพ';
      });
      figure.appendChild(img);
      grid.appendChild(figure);
    });
  }

  /* ---------- 8. RSVP ---------- */
  function initRsvp() {
    var section = $('#rsvp');
    var actions = $('#rsvpActions');
    var rsvp = cfg.rsvp || {};
    if (!section || !actions || !rsvp.enabled) return;

    var links = [];
    if (rsvp.formUrl) links.push({ href: rsvp.formUrl, label: 'กรอกแบบฟอร์มตอบรับ', external: true });
    if (rsvp.lineUrl) links.push({ href: rsvp.lineUrl, label: 'ตอบรับทาง LINE', external: true });
    if (rsvp.phone) links.push({ href: 'tel:' + rsvp.phone.replace(/[^\d+]/g, ''), label: 'โทร ' + rsvp.phone });

    if (!links.length) return; // ยังไม่ได้ใส่ช่องทาง → ซ่อนทั้งหมวด

    links.forEach(function (item) {
      var a = el('a', 'btn', item.label);
      a.href = item.href;
      if (item.external) { a.target = '_blank'; a.rel = 'noopener'; }
      actions.appendChild(a);
    });
    section.hidden = false;
  }

  /* ---------- 9. ร่วมแสดงความยินดี ---------- */
  function initGifts() {
    var section = $('#gift');
    var wrap = $('#accounts');
    var gifts = cfg.gifts || {};
    if (!section || !wrap || !gifts.enabled) return;

    var accounts = (gifts.accounts || []).filter(function (a) { return a && a.number; });
    if (!accounts.length) return;

    accounts.forEach(function (acc) {
      var card = el('div', 'account');
      if (acc.qr) {
        var qr = document.createElement('img');
        qr.className = 'account__qr';
        qr.src = acc.qr;
        qr.alt = 'QR พร้อมเพย์';
        qr.loading = 'lazy';
        qr.addEventListener('error', function () { qr.remove(); });
        card.appendChild(qr);
      }
      card.appendChild(el('p', 'account__bank', acc.bank || ''));
      card.appendChild(el('p', 'account__number', acc.number));
      card.appendChild(el('p', 'account__name', acc.name || ''));

      var button = el('button', 'account__copy', 'คัดลอกเลขบัญชี');
      button.type = 'button';
      button.addEventListener('click', function () {
        copy(acc.number).then(function () { toast('คัดลอกเลขบัญชีแล้ว'); },
                              function () { toast('คัดลอกไม่สำเร็จ'); });
      });
      card.appendChild(button);
      wrap.appendChild(card);
    });

    section.hidden = false;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy') ? resolve() : reject(); }
      catch (err) { reject(err); }
      finally { input.remove(); }
    });
  }

  /* ---------- 10. เอฟเฟกต์ตอนเลื่อน ---------- */
  var revealCheck = function () {};
  function initReveal() {
    var nodes = $$('.reveal');
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    nodes.forEach(function (n) { observer.observe(n); });

    revealCheck = function () {
      // การ์ดเพิ่งถูกแสดง — บังคับตรวจรอบแรกให้ section บนสุดโผล่ทันที
      nodes.slice(0, 2).forEach(function (n) { n.classList.add('is-visible'); });
    };
  }

  /* ---------- 11. เพลงประกอบ ---------- */
  var tryPlayMusic = function () {};
  function initMusic() {
    var opts = cfg.options || {};
    if (!opts.backgroundMusic || !opts.musicSrc) return;

    var audio = $('#bgm');
    var button = $('#musicToggle');
    if (!audio || !button) return;

    audio.src = opts.musicSrc;
    audio.volume = 0.35;
    button.hidden = false;

    function setState(playing) { button.classList.toggle('is-playing', playing); }

    tryPlayMusic = function () {
      audio.play().then(function () { setState(true); }, function () { setState(false); });
    };

    button.addEventListener('click', function () {
      if (audio.paused) tryPlayMusic();
      else { audio.pause(); setState(false); }
    });
  }

  /* ---------- เริ่มทำงาน ---------- */
  bindText();
  initEnvelope();
  initCountdown();
  initSchedule();
  initVenue();
  initPalette();
  initGallery();
  initRsvp();
  initGifts();
  initReveal();
  initMusic();
})();
