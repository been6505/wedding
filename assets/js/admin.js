(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var setupNotice = $('#setupNotice');
  var login = $('#login');
  var dash = $('#dash');

  var view = 'rsvp';
  var rsvps = [], checkins = [], wishes = [];
  var rsvpFilter = 'all', rsvpQuery = '';
  var checkinQuery = '';
  var wishFilter = 'all', wishQuery = '';

  // ไม่มีฐานข้อมูล = อ่านอะไรไม่ได้เลย ต้องหยุด
  // ไม่มีที่เก็บไฟล์ = ยังดูรายชื่อและคำอวยพรที่เป็นข้อความได้ แค่เปิดรูป/คลิปไม่ได้
  if (!window.BACKEND || !window.BACKEND.dbConfigured()) {
    var list = document.getElementById('setupIssues');
    var reasons = (window.BACKEND && window.BACKEND.dbIssues()) || ['ไม่พบไฟล์ assets/js/backend.js'];
    reasons.forEach(function (reason) {
      var item = document.createElement('li');
      item.textContent = reason;
      list.appendChild(item);
    });
    setupNotice.hidden = false;
    return;
  }

  /* ---------- ตัวช่วย ---------- */
  function toast(message) {
    var box = $('#toast');
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2600);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try {
      return d.toLocaleString('th-TH', {
        day: 'numeric', month: 'short', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function deleteButton(label, onConfirm) {
    var button = el('button', 'del', '×');
    button.type = 'button';
    button.title = 'ลบรายการนี้';
    button.setAttribute('aria-label', 'ลบรายการของ ' + label);
    button.addEventListener('click', function () {
      if (!window.confirm('ลบรายการของ "' + label + '" ใช่ไหม?')) return;
      button.disabled = true;
      onConfirm().then(function () { toast('ลบรายการแล้ว'); },
                       function (err) { button.disabled = false; toast('ลบไม่สำเร็จ: ' + err.message); });
    });
    return button;
  }

  /* ---------- เข้าสู่ระบบ ---------- */
  var loginForm = $('#loginForm');
  var loginError = $('#loginError');
  var loginSubmit = $('#loginSubmit');

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginError.hidden = true;
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'กำลังเข้าสู่ระบบ...';

    window.BACKEND.signIn($('#loginEmail').value.trim(), $('#loginPassword').value)
      .then(function () { showDash(); })
      .catch(function (err) {
        loginError.textContent = /invalid/i.test(err.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : err.message;
        loginError.hidden = false;
      })
      .then(function () {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'เข้าสู่ระบบ';
      });
  });

  $('#logoutBtn').addEventListener('click', function () {
    window.BACKEND.signOut().then(function () { location.reload(); });
  });

  function showDash() {
    login.hidden = true;
    dash.hidden = false;
    var session = window.BACKEND.session();
    $('#dashUser').textContent = (session && session.email) || '';
    loadAll();
  }

  /* ---------- สลับมุมมอง ---------- */
  $$('.view-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.view-tab').forEach(function (other) {
        other.classList.remove('is-active');
        other.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      view = tab.dataset.view;
      $('#viewRsvp').hidden = view !== 'rsvp';
      $('#viewCheckin').hidden = view !== 'checkin';
      $('#viewWish').hidden = view !== 'wish';
    });
  });

  /* ---------- โหลดข้อมูล ---------- */
  function handleAuthError(err) {
    if (err.status === 401 || /เข้าสู่ระบบ|หมดเวลา/.test(err.message)) {
      window.BACKEND.signOut().then(function () { location.reload(); });
      return true;
    }
    return false;
  }

  function loadAll() {
    var jobs = [
      window.BACKEND.listRsvps().then(function (rows) { rsvps = rows || []; renderRsvps(); },
        function (err) { if (!handleAuthError(err)) $('#state').textContent = 'โหลดไม่สำเร็จ: ' + err.message; }),
      window.BACKEND.listCheckins().then(function (rows) { checkins = rows || []; renderCheckins(); },
        function (err) { if (!handleAuthError(err)) $('#stateCheckin').textContent = 'โหลดไม่สำเร็จ: ' + err.message; }),
      window.BACKEND.listWishes().then(function (rows) { wishes = rows || []; renderWishes(); },
        function (err) { if (!handleAuthError(err)) $('#stateWish').textContent = 'โหลดไม่สำเร็จ: ' + err.message; }),
    ];
    return Promise.all(jobs);
  }

  $('#refreshBtn').addEventListener('click', function () {
    loadAll().then(function () { toast('อัปเดตข้อมูลแล้ว'); });
  });

  /* ---------- มุมมองที่ 1: ตอบรับคำเชิญ ---------- */
  $('#search').addEventListener('input', function (e) {
    rsvpQuery = e.target.value.trim().toLowerCase();
    renderRsvps();
  });

  $$('#viewRsvp .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('#viewRsvp .tab').forEach(function (other) {
        other.classList.remove('is-active');
        other.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      rsvpFilter = tab.dataset.filter;
      renderRsvps();
    });
  });

  function renderRsvps() {
    var yes = rsvps.filter(function (r) { return r.attending; });
    $('#statGuests').textContent = yes.reduce(function (sum, r) { return sum + (Number(r.guests) || 0); }, 0);
    $('#statYes').textContent = yes.length;
    $('#statNo').textContent = rsvps.length - yes.length;
    $('#statTotal').textContent = rsvps.length;

    var visible = rsvps.filter(function (row) {
      if (rsvpFilter === 'yes' && !row.attending) return false;
      if (rsvpFilter === 'no' && row.attending) return false;
      if (rsvpQuery && String(row.name || '').toLowerCase().indexOf(rsvpQuery) === -1) return false;
      return true;
    });

    var body = $('#rows');
    var table = $('#table');
    var state = $('#state');
    body.textContent = '';

    if (!rsvps.length) { table.hidden = true; state.textContent = 'ยังไม่มีใครตอบรับ'; return; }
    if (!visible.length) { table.hidden = true; state.textContent = 'ไม่พบรายการที่ตรงกับที่ค้นหา'; return; }

    state.textContent = '';
    table.hidden = false;

    visible.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'name', row.name || '—'));

      var status = el('td');
      status.appendChild(el('span', 'pill ' + (row.attending ? 'pill--yes' : 'pill--no'),
        row.attending ? 'มาร่วมงาน' : 'ไม่สะดวก'));
      tr.appendChild(status);

      tr.appendChild(el('td', 'num', row.attending ? String(row.guests || 0) : '—'));
      tr.appendChild(el('td', 'when', formatWhen(row.createdAt)));

      var actions = el('td', 'num');
      actions.appendChild(deleteButton(row.name || '', function () {
        return window.BACKEND.deleteRsvp(row.id).then(function () {
          rsvps = rsvps.filter(function (r) { return r.id !== row.id; });
          renderRsvps();
        });
      }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  /* ---------- มุมมองที่ 2: เช็คอินหน้างาน ---------- */
  $('#searchCheckin').addEventListener('input', function (e) {
    checkinQuery = e.target.value.trim().toLowerCase();
    renderCheckins();
  });

  function renderCheckins() {
    $('#statHeads').textContent = checkins.reduce(function (sum, r) { return sum + (Number(r.partySize) || 0); }, 0);
    $('#statParties').textContent = checkins.length;

    var visible = checkins.filter(function (row) {
      return !checkinQuery || String(row.name || '').toLowerCase().indexOf(checkinQuery) !== -1;
    });

    var body = $('#rowsCheckin');
    var table = $('#tableCheckin');
    var state = $('#stateCheckin');
    body.textContent = '';

    if (!checkins.length) { table.hidden = true; state.textContent = 'ยังไม่มีใครเช็คอิน'; return; }
    if (!visible.length) { table.hidden = true; state.textContent = 'ไม่พบรายการที่ตรงกับที่ค้นหา'; return; }

    state.textContent = '';
    table.hidden = false;

    visible.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'name', row.name || '—'));
      tr.appendChild(el('td', 'num', String(row.partySize || 1)));
      tr.appendChild(el('td', 'when', formatWhen(row.createdAt)));

      var actions = el('td', 'num');
      actions.appendChild(deleteButton(row.name || '', function () {
        return window.BACKEND.deleteCheckin(row.id).then(function () {
          checkins = checkins.filter(function (r) { return r.id !== row.id; });
          renderCheckins();
        });
      }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  /* ---------- มุมมองที่ 3: คำอวยพร ---------- */
  $('#searchWish').addEventListener('input', function (e) {
    wishQuery = e.target.value.trim().toLowerCase();
    renderWishes();
  });

  $$('#viewWish .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('#viewWish .tab').forEach(function (other) {
        other.classList.remove('is-active');
        other.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      wishFilter = tab.dataset.wish;
      renderWishes();
    });
  });

  var KIND_LABEL = { text: 'ข้อความ', photo: 'การ์ดรูป', video: 'คลิปวิดีโอ' };

  function renderWishes() {
    $('#statWishAll').textContent = wishes.length;
    $('#statWishText').textContent = wishes.filter(function (w) { return w.kind === 'text'; }).length;
    $('#statWishPhoto').textContent = wishes.filter(function (w) { return w.kind === 'photo'; }).length;
    $('#statWishVideo').textContent = wishes.filter(function (w) { return w.kind === 'video'; }).length;

    var visible = wishes.filter(function (row) {
      if (wishFilter !== 'all' && row.kind !== wishFilter) return false;
      if (!wishQuery) return true;
      var haystack = ((row.name || '') + ' ' + (row.message || '')).toLowerCase();
      return haystack.indexOf(wishQuery) !== -1;
    });

    var grid = $('#wishes');
    var state = $('#stateWish');
    grid.textContent = '';

    if (!wishes.length) { state.textContent = 'ยังไม่มีคำอวยพร'; return; }
    if (!visible.length) { state.textContent = 'ไม่พบรายการที่ตรงกับที่ค้นหา'; return; }
    state.textContent = '';

    visible.forEach(function (row) { grid.appendChild(wishCard(row)); });
  }

  function wishCard(row) {
    var card = el('article', 'wish');

    var head = el('div', 'wish__head');
    head.appendChild(el('p', 'wish__name', row.name || '—'));
    head.appendChild(el('span', 'pill pill--' + row.kind, KIND_LABEL[row.kind] || row.kind));
    card.appendChild(head);

    if (row.message) card.appendChild(el('p', 'wish__message', row.message));

    if (row.media) {
      var slot = el('div', 'wish__media');
      card.appendChild(slot);
      if (row.kind === 'photo') loadPhoto(slot, row.media);
      else loadVideoButton(slot, row.media);
    }

    var foot = el('div', 'wish__foot');
    foot.appendChild(el('span', 'when', formatWhen(row.createdAt)));
    foot.appendChild(deleteButton(row.name || '', function () {
      return window.BACKEND.deleteWish(row.id).then(function () {
        wishes = wishes.filter(function (w) { return w.id !== row.id; });
        renderWishes();
      });
    }));
    card.appendChild(foot);

    return card;
  }

  function loadPhoto(slot, ref) {
    slot.appendChild(el('p', 'wish__loading', 'กำลังโหลดรูป...'));
    window.BACKEND.mediaUrl(ref).then(function (url) {
      slot.textContent = '';
      var link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'การ์ดอวยพร';
      img.loading = 'lazy';
      link.appendChild(img);
      slot.appendChild(link);
    }, function (err) {
      slot.textContent = '';
      slot.appendChild(el('p', 'wish__loading', 'เปิดรูปไม่ได้: ' + err.message));
    });
  }

  function loadVideoButton(slot, ref) {
    var button = el('button', 'btn', 'เล่นคลิป');
    button.type = 'button';
    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = 'กำลังโหลด...';
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
      }, function (err) {
        button.disabled = false;
        button.textContent = 'เล่นคลิป';
        toast('เปิดคลิปไม่ได้: ' + err.message);
      });
    });
    slot.appendChild(button);
  }

  /* ---------- ดาวน์โหลด CSV ---------- */
  $('#exportBtn').addEventListener('click', function () {
    var cell = function (value) {
      var text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };

    var header, rows, filename;

    if (view === 'rsvp') {
      if (!rsvps.length) { toast('ยังไม่มีข้อมูลให้ดาวน์โหลด'); return; }
      filename = 'rsvp.csv';
      header = ['ชื่อ', 'สถานะ', 'จำนวน', 'ตอบเมื่อ'];
      rows = rsvps.map(function (r) {
        return [r.name, r.attending ? 'มาร่วมงาน' : 'ไม่สะดวก', r.attending ? (r.guests || 0) : 0, formatWhen(r.createdAt)];
      });
    } else if (view === 'checkin') {
      if (!checkins.length) { toast('ยังไม่มีข้อมูลให้ดาวน์โหลด'); return; }
      filename = 'checkin.csv';
      header = ['ชื่อ', 'จำนวน', 'เช็คอินเมื่อ'];
      rows = checkins.map(function (r) { return [r.name, r.partySize || 1, formatWhen(r.createdAt)]; });
    } else {
      if (!wishes.length) { toast('ยังไม่มีข้อมูลให้ดาวน์โหลด'); return; }
      filename = 'wishes.csv';
      header = ['ชื่อ', 'ประเภท', 'ข้อความ', 'ไฟล์', 'ส่งเมื่อ'];
      rows = wishes.map(function (r) {
        var file = r.media ? (r.media.id || r.media.path || '') : '';
        return [r.name, KIND_LABEL[r.kind] || r.kind, r.message || '', file, formatWhen(r.createdAt)];
      });
    }

    var lines = [header.join(',')].concat(rows.map(function (r) { return r.map(cell).join(','); }));
    // BOM ข้างหน้า เพื่อให้ Excel อ่านภาษาไทยไม่เป็นตัวต่างดาว
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------- เริ่มทำงาน ---------- */
  if (window.BACKEND.session()) showDash();
  else login.hidden = false;
})();
