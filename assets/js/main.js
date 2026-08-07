(function () {
  'use strict';

  var cfg = window.WEDDING_CONFIG;
  if (!cfg) {
    console.error('ไม่พบ WEDDING_CONFIG — ตรวจสอบว่า assets/js/config.js โหลดก่อน main.js');
    return;
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function get(path) {
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, cfg);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toast(message) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2600);
  }

  /* ---------- 1. เติมข้อความจาก config ---------- */
  function bindText() {
    $$('[data-bind]').forEach(function (node) {
      var value = get(node.getAttribute('data-bind'));
      node.textContent = (typeof value === 'string') ? value : '';
    });

    var groom = get('couple.groom.th') || '';
    var bride = get('couple.bride.th') || '';
    if (groom && bride) document.title = 'วะลีมะฮฺ ' + groom + ' & ' + bride;
  }

  /* ---------- 2. ซองจดหมาย ---------- */
  function initCover() {
    var cover = $('#cover');
    var card = $('#card');
    if (!cover || !card) return;

    function open() {
      cover.classList.add('is-open');
      card.hidden = false;
      requestAnimationFrame(revealFirst);
      if (cfg.options && cfg.options.backgroundMusic) tryPlayMusic();
      setTimeout(function () { cover.remove(); }, 1000);
    }

    cover.tabIndex = 0;
    cover.setAttribute('role', 'button');
    cover.setAttribute('aria-label', (cfg.coverHint || 'เปิดการ์ด'));
    cover.addEventListener('click', open);
    cover.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  /* ---------- 3. กำหนดการ ---------- */
  function initAgenda() {
    var list = $('#agenda');
    if (!list) return;
    var items = cfg.schedule || [];
    if (!items.length) { list.closest('.block').hidden = true; return; }

    items.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('span', 'agenda__time', item.time || ''));
      li.appendChild(el('p', 'agenda__title', item.title || ''));
      if (item.note) li.appendChild(el('p', 'agenda__note', item.note));
      list.appendChild(li);
    });
  }

  /* ---------- 4. สถานที่ + ปุ่ม ---------- */
  function initVenue() {
    var venue = cfg.venue || {};

    var address = $('#venueAddress');
    if (address) (venue.addressLines || []).forEach(function (line) {
      address.appendChild(el('p', null, line));
    });

    var mapLink = $('#mapLink');
    if (mapLink) {
      if (venue.mapUrl) mapLink.href = venue.mapUrl;
      else mapLink.hidden = true;
    }

    var box = $('#venueMap');
    if (box && venue.mapEmbedUrl) {
      var frame = document.createElement('iframe');
      frame.src = venue.mapEmbedUrl;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.allowFullscreen = true;
      frame.title = 'แผนที่' + (venue.name ? ' ' + venue.name : '');
      box.appendChild(frame);
    }

    var calLink = $('#calendarLink');
    var start = new Date(cfg.startsAt);
    if (calLink && !isNaN(start)) {
      var end = cfg.endsAt ? new Date(cfg.endsAt) : new Date(start.getTime() + 5 * 3600 * 1000);
      var stamp = function (d) { return d.toISOString().replace(/[-:]|\.\d{3}/g, ''); };
      var title = 'วะลีมะฮฺ ' + (get('couple.groom.th') || '') + ' & ' + (get('couple.bride.th') || '');
      calLink.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + '&text=' + encodeURIComponent(title.trim())
        + '&dates=' + stamp(start) + '/' + stamp(end)
        + '&details=' + encodeURIComponent([venue.name, venue.mapUrl].filter(Boolean).join('\n'))
        + '&location=' + encodeURIComponent([venue.name].concat(venue.addressLines || []).filter(Boolean).join(' '));
    } else if (calLink) {
      calLink.hidden = true;
    }
  }

  /* ---------- 5. นับถอยหลัง ---------- */
  function initCountdown() {
    var target = new Date(cfg.startsAt);
    if (isNaN(target)) return;

    var days = $('[data-count="days"]');
    var hours = $('[data-count="hours"]');
    var minutes = $('[data-count="minutes"]');
    var seconds = $('[data-count="seconds"]');
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
      if (days) days.textContent = Math.floor(s / 86400);
      if (hours) hours.textContent = pad(Math.floor(s % 86400 / 3600));
      if (minutes) minutes.textContent = pad(Math.floor(s % 3600 / 60));
      if (seconds) seconds.textContent = pad(s % 60);
    }

    tick();
    var timer = setInterval(tick, 1000);
  }

  /* ---------- 6. แกลเลอรี ---------- */
  function initGallery() {
    var section = $('#gallery');
    var grid = $('#galleryGrid');
    if (!section || !grid) return;

    var photos = (cfg.gallery || []).filter(Boolean);
    if (!photos.length) return;

    photos.forEach(function (src, i) {
      var figure = el('figure');
      var img = document.createElement('img');
      img.src = src;
      img.alt = 'ภาพคู่บ่าวสาว ' + (i + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () { figure.remove(); });
      figure.appendChild(img);
      grid.appendChild(figure);
    });

    section.hidden = false;
  }

  /* ---------- 7. ตอบรับคำเชิญ ---------- */
  function initRsvp() {
    var section = $('#rsvp');
    var form = $('#rsvpForm');
    var rsvp = cfg.rsvp || {};
    if (!section || !form || !rsvp.enabled) return;

    var select = $('#rsvpGuests');
    var max = rsvp.maxGuests || 10;
    for (var i = 1; i <= max; i++) {
      var option = document.createElement('option');
      option.value = String(i);
      option.textContent = i + ' ท่าน';
      select.appendChild(option);
    }

    var attending = true;
    var guestField = $('#guestField');
    $$('.choice__btn', form).forEach(function (button) {
      button.addEventListener('click', function () {
        $$('.choice__btn', form).forEach(function (other) {
          other.classList.remove('is-active');
          other.setAttribute('aria-checked', 'false');
        });
        button.classList.add('is-active');
        button.setAttribute('aria-checked', 'true');
        attending = button.dataset.attend === 'yes';
        guestField.hidden = !attending;
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nameInput = $('#rsvpName');
      var name = nameInput.value.trim();
      if (!name) {
        toast('กรุณากรอกชื่อผู้ตอบรับ');
        nameInput.focus();
        return;
      }

      var lines = [
        'ตอบรับคำเชิญงานวะลีมะฮฺ ' + (get('couple.groom.th') || '') + ' & ' + (get('couple.bride.th') || ''),
        'ชื่อ: ' + name,
        'สถานะ: ' + (attending ? 'มาร่วมงาน' : 'ไม่สะดวก'),
      ];
      if (attending) lines.push('จำนวน: ' + select.value + ' ท่าน');

      copy(lines.join('\n')).then(function () {
        toast('คัดลอกข้อความแล้ว วางส่งในไลน์ได้เลย');
        if (rsvp.lineUrl) setTimeout(function () { window.open(rsvp.lineUrl, '_blank', 'noopener'); }, 700);
      }, function () {
        toast('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
      });
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

  /* ---------- 8. ร่วมแสดงความยินดี ---------- */
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

      var button = el('button', 'btn', 'คัดลอกเลขบัญชี');
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

  /* ---------- 9. เอฟเฟกต์ตอนเลื่อน ---------- */
  var revealFirst = function () {};
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
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    nodes.forEach(function (n) { observer.observe(n); });
    revealFirst = function () {
      nodes.slice(0, 2).forEach(function (n) { n.classList.add('is-visible'); });
    };
  }

  /* ---------- 10. เพลงประกอบ ---------- */
  var tryPlayMusic = function () {};
  function initMusic() {
    var opts = cfg.options || {};
    if (!opts.backgroundMusic || !opts.musicSrc) return;

    var audio = $('#bgm');
    var button = $('#musicToggle');
    if (!audio || !button) return;

    audio.src = opts.musicSrc;
    audio.volume = 0.3;
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
  initCover();
  initAgenda();
  initVenue();
  initCountdown();
  initGallery();
  initRsvp();
  initGifts();
  initReveal();
  initMusic();
})();
