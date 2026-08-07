(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var setupNotice = $('#setupNotice');
  var login = $('#login');
  var dash = $('#dash');

  var entries = [];
  var filter = 'all';
  var query = '';

  /* ---------- ยังไม่ได้ตั้งค่า Supabase ---------- */
  if (!window.SB || !window.SB.configured()) {
    setupNotice.hidden = false;
    return;
  }

  /* ---------- toast ---------- */
  function toast(message) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('is-visible'); }, 2600);
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

    window.SB.signIn($('#loginEmail').value.trim(), $('#loginPassword').value)
      .then(function () { showDash(); })
      .catch(function (err) {
        loginError.textContent = /invalid/i.test(err.message)
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : err.message;
        loginError.hidden = false;
      })
      .then(function () {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'เข้าสู่ระบบ';
      });
  });

  $('#logoutBtn').addEventListener('click', function () {
    window.SB.signOut().then(function () { location.reload(); });
  });

  /* ---------- โหลดข้อมูล ---------- */
  function showDash() {
    login.hidden = true;
    dash.hidden = false;
    var session = window.SB.session();
    $('#dashUser').textContent = (session && session.email) || '';
    load();
  }

  function load() {
    var state = $('#state');
    state.textContent = 'กำลังโหลด...';
    $('#table').hidden = true;

    return window.SB.listRsvps()
      .then(function (rows) {
        entries = Array.isArray(rows) ? rows : [];
        render();
      })
      .catch(function (err) {
        if (/เข้าสู่ระบบ|หมดเวลา/.test(err.message) || err.status === 401) {
          window.SB.signOut().then(function () { location.reload(); });
          return;
        }
        state.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + err.message;
      });
  }

  $('#refreshBtn').addEventListener('click', function () {
    load().then(function () { toast('อัปเดตข้อมูลแล้ว'); });
  });

  /* ---------- ตัวกรอง ---------- */
  $('#search').addEventListener('input', function (e) {
    query = e.target.value.trim().toLowerCase();
    render();
  });

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (other) {
        other.classList.remove('is-active');
        other.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      filter = tab.dataset.filter;
      render();
    });
  });

  function visible() {
    return entries.filter(function (row) {
      if (filter === 'yes' && !row.attending) return false;
      if (filter === 'no' && row.attending) return false;
      if (query && String(row.name || '').toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
  }

  /* ---------- แสดงผล ---------- */
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

  function render() {
    var yes = entries.filter(function (r) { return r.attending; });
    var no = entries.length - yes.length;
    var heads = yes.reduce(function (sum, r) { return sum + (Number(r.guests) || 0); }, 0);

    $('#statGuests').textContent = heads;
    $('#statYes').textContent = yes.length;
    $('#statNo').textContent = no;
    $('#statTotal').textContent = entries.length;

    var rows = visible();
    var body = $('#rows');
    var table = $('#table');
    var state = $('#state');

    body.textContent = '';

    if (!entries.length) {
      table.hidden = true;
      state.textContent = 'ยังไม่มีใครตอบรับ';
      return;
    }
    if (!rows.length) {
      table.hidden = true;
      state.textContent = 'ไม่พบรายการที่ตรงกับที่ค้นหา';
      return;
    }

    state.textContent = '';
    table.hidden = false;

    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      var name = document.createElement('td');
      name.className = 'name';
      name.textContent = row.name || '—';
      tr.appendChild(name);

      var status = document.createElement('td');
      var pill = document.createElement('span');
      pill.className = 'pill ' + (row.attending ? 'pill--yes' : 'pill--no');
      pill.textContent = row.attending ? 'มาร่วมงาน' : 'ไม่สะดวก';
      status.appendChild(pill);
      tr.appendChild(status);

      var guests = document.createElement('td');
      guests.className = 'num';
      guests.textContent = row.attending ? (row.guests || 0) : '—';
      tr.appendChild(guests);

      var when = document.createElement('td');
      when.className = 'when';
      when.textContent = formatWhen(row.created_at);
      tr.appendChild(when);

      var actions = document.createElement('td');
      actions.className = 'num';
      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = 'ลบรายการนี้';
      del.setAttribute('aria-label', 'ลบรายการของ ' + (row.name || ''));
      del.addEventListener('click', function () { remove(row, del); });
      actions.appendChild(del);
      tr.appendChild(actions);

      body.appendChild(tr);
    });
  }

  function remove(row, button) {
    if (!window.confirm('ลบรายการของ "' + (row.name || '') + '" ใช่ไหม?')) return;
    button.disabled = true;
    window.SB.deleteRsvp(row.id)
      .then(function () {
        entries = entries.filter(function (r) { return r.id !== row.id; });
        render();
        toast('ลบรายการแล้ว');
      })
      .catch(function (err) {
        button.disabled = false;
        toast('ลบไม่สำเร็จ: ' + err.message);
      });
  }

  /* ---------- ดาวน์โหลด CSV ---------- */
  $('#exportBtn').addEventListener('click', function () {
    if (!entries.length) { toast('ยังไม่มีข้อมูลให้ดาวน์โหลด'); return; }

    var cell = function (value) {
      var text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };

    var lines = [['ชื่อ', 'สถานะ', 'จำนวน', 'ตอบเมื่อ'].join(',')];
    entries.forEach(function (row) {
      lines.push([
        cell(row.name),
        cell(row.attending ? 'มาร่วมงาน' : 'ไม่สะดวก'),
        cell(row.attending ? (row.guests || 0) : 0),
        cell(formatWhen(row.created_at)),
      ].join(','));
    });

    // BOM ข้างหน้า เพื่อให้ Excel อ่านภาษาไทยไม่เป็นตัวต่างดาว
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'rsvp.csv';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------- เริ่มทำงาน ---------- */
  if (window.SB.session()) showDash();
  else login.hidden = false;
})();
