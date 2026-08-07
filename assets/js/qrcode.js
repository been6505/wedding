/**
 * ตัวสร้าง QR Code แบบไม่พึ่งไลบรารีภายนอก
 * รองรับโหมด byte (UTF-8) ระดับแก้ความผิดพลาด M เวอร์ชัน 1–20
 * เพียงพอสำหรับ URL ยาวถึง ~660 ตัวอักษร
 *
 * ใช้: QRCode.toSvg('https://example.com', { scale: 8, margin: 4 })
 */
window.QRCode = (function () {
  'use strict';

  // [เวอร์ชัน]: จำนวน codeword ทั้งหมด, ec ต่อบล็อก, บล็อกกลุ่ม1, data ต่อบล็อกกลุ่ม1, บล็อกกลุ่ม2, data ต่อบล็อกกลุ่ม2
  var SPEC = [
    null,
    [26, 10, 1, 16, 0, 0],
    [44, 16, 1, 28, 0, 0],
    [70, 26, 1, 44, 0, 0],
    [100, 18, 2, 32, 0, 0],
    [134, 24, 2, 43, 0, 0],
    [172, 16, 4, 27, 0, 0],
    [196, 18, 4, 31, 0, 0],
    [242, 22, 2, 38, 2, 39],
    [292, 22, 3, 36, 2, 37],
    [346, 26, 4, 43, 1, 44],
    [404, 30, 1, 50, 4, 51],
    [466, 22, 6, 36, 2, 37],
    [532, 22, 8, 37, 1, 38],
    [581, 24, 4, 40, 5, 41],
    [655, 24, 5, 41, 5, 42],
    [733, 28, 7, 45, 3, 46],
    [815, 28, 10, 46, 1, 47],
    [901, 26, 9, 43, 4, 44],
    [991, 26, 3, 44, 11, 45],
    [1085, 26, 3, 41, 13, 42],
  ];

  var ALIGN = [
    null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
    [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90],
  ];

  /* ---------- เลขคณิตบนสนามจำกัด GF(256) ---------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function generatorPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function eccFor(data, eccLength) {
    var gen = generatorPoly(eccLength);
    var remainder = new Array(eccLength).fill(0);

    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ remainder[0];
      remainder.shift();
      remainder.push(0);
      for (var j = 0; j < eccLength; j++) {
        remainder[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return remainder;
  }

  /* ---------- เข้ารหัสข้อมูล ---------- */
  function utf8Bytes(text) {
    var out = [];
    var encoded = unescape(encodeURIComponent(text));
    for (var i = 0; i < encoded.length; i++) out.push(encoded.charCodeAt(i));
    return out;
  }

  function dataCodewordCount(version) {
    var s = SPEC[version];
    return s[2] * s[3] + s[4] * s[5];
  }

  function pickVersion(byteLength) {
    for (var v = 1; v < SPEC.length; v++) {
      var countBits = v < 10 ? 8 : 16;
      var capacity = Math.floor((dataCodewordCount(v) * 8 - 4 - countBits) / 8);
      if (byteLength <= capacity) return v;
    }
    throw new Error('ข้อความยาวเกินไปสำหรับ QR code');
  }

  function buildCodewords(bytes, version) {
    var bits = [];
    var push = function (value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(0b0100, 4);                          // โหมด byte
    push(bytes.length, version < 10 ? 8 : 16); // จำนวนตัวอักษร
    bytes.forEach(function (b) { push(b, 8); });

    var totalDataBits = dataCodewordCount(version) * 8;

    // terminator ไม่เกิน 4 บิต
    for (var t = 0; t < 4 && bits.length < totalDataBits; t++) bits.push(0);
    // เติมให้ครบไบต์
    while (bits.length % 8 !== 0) bits.push(0);

    var codewords = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    // เติมไบต์สลับ 236 / 17 จนเต็ม
    var pad = [0xec, 0x11];
    for (var k = 0; codewords.length < totalDataBits / 8; k++) {
      codewords.push(pad[k % 2]);
    }
    return codewords;
  }

  function interleave(codewords, version) {
    var spec = SPEC[version];
    var eccLength = spec[1];
    var blocks = [];
    var offset = 0;

    var take = function (count, size) {
      for (var i = 0; i < count; i++) {
        var data = codewords.slice(offset, offset + size);
        offset += size;
        blocks.push({ data: data, ecc: eccFor(data, eccLength) });
      }
    };
    take(spec[2], spec[3]);
    take(spec[4], spec[5]);

    var result = [];
    var maxData = Math.max(spec[3], spec[5]);
    for (var i = 0; i < maxData; i++) {
      blocks.forEach(function (block) {
        if (i < block.data.length) result.push(block.data[i]);
      });
    }
    for (var j = 0; j < eccLength; j++) {
      blocks.forEach(function (block) { result.push(block.ecc[j]); });
    }
    return result;
  }

  /* ---------- วางลวดลายลงตาราง ---------- */
  function createMatrix(version) {
    var size = version * 4 + 17;
    var modules = [];
    var reserved = [];
    for (var i = 0; i < size; i++) {
      modules.push(new Array(size).fill(0));
      reserved.push(new Array(size).fill(false));
    }

    function setArea(row, col, height, width, fill) {
      for (var r = 0; r < height; r++) {
        for (var c = 0; c < width; c++) {
          var y = row + r, x = col + c;
          if (y < 0 || x < 0 || y >= size || x >= size) continue;
          modules[y][x] = fill(r, c);
          reserved[y][x] = true;
        }
      }
    }

    // finder pattern + separator (8x8 รวมเส้นคั่น)
    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (pos) {
      var row = pos[0], col = pos[1];
      setArea(row, col, 7, 7, function (r, c) {
        var edge = (r === 0 || r === 6 || c === 0 || c === 6);
        var core = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        return (edge || core) ? 1 : 0;
      });
      setArea(row - 1, col - 1, 9, 1, function () { return 0; });
      setArea(row - 1, col + 7, 9, 1, function () { return 0; });
      setArea(row - 1, col - 1, 1, 9, function () { return 0; });
      setArea(row + 7, col - 1, 1, 9, function () { return 0; });
    });

    // timing pattern
    for (var i = 8; i < size - 8; i++) {
      modules[6][i] = (i % 2 === 0) ? 1 : 0;
      reserved[6][i] = true;
      modules[i][6] = (i % 2 === 0) ? 1 : 0;
      reserved[i][6] = true;
    }

    // alignment pattern — เว้นสามมุมที่ทับ finder pattern
    // (ตัวที่คร่อมแถว/คอลัมน์ timing ต้องวาดตามปกติ ค่าโมดูลตรงกันอยู่แล้ว)
    var centers = ALIGN[version];
    var lastCenter = size - 7;
    centers.forEach(function (row) {
      centers.forEach(function (col) {
        var onFinder = (row === 6 && col === 6) ||
                       (row === 6 && col === lastCenter) ||
                       (row === lastCenter && col === 6);
        if (onFinder) return;
        setArea(row - 2, col - 2, 5, 5, function (r, c) {
          var edge = (r === 0 || r === 4 || c === 0 || c === 4);
          var center = (r === 2 && c === 2);
          return (edge || center) ? 1 : 0;
        });
      });
    });

    // dark module
    modules[size - 8][8] = 1;
    reserved[size - 8][8] = true;

    // จองพื้นที่ format information
    for (var f = 0; f < 9; f++) {
      if (!reserved[8][f] || f === 6) { reserved[8][f] = true; }
      if (!reserved[f][8] || f === 6) { reserved[f][8] = true; }
    }
    for (var g = 0; g < 8; g++) {
      reserved[8][size - 1 - g] = true;
      reserved[size - 1 - g][8] = true;
    }

    // จองพื้นที่ version information (เวอร์ชัน 7 ขึ้นไป)
    if (version >= 7) {
      for (var r2 = 0; r2 < 6; r2++) {
        for (var c2 = 0; c2 < 3; c2++) {
          reserved[r2][size - 11 + c2] = true;
          reserved[size - 11 + c2][r2] = true;
        }
      }
    }

    return { size: size, modules: modules, reserved: reserved };
  }

  function placeData(grid, codewords) {
    var size = grid.size;
    var bitIndex = 0;
    var totalBits = codewords.length * 8;

    var nextBit = function () {
      if (bitIndex >= totalBits) return 0; // remainder bits เป็น 0
      var bit = (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
      bitIndex++;
      return bit;
    };

    var upward = true;
    for (var right = size - 1; right > 0; right -= 2) {
      if (right === 6) right = 5; // ข้ามคอลัมน์ timing pattern
      for (var step = 0; step < size; step++) {
        var row = upward ? (size - 1 - step) : step;
        for (var offset = 0; offset < 2; offset++) {
          var col = right - offset;
          if (grid.reserved[row][col]) continue;
          grid.modules[row][col] = nextBit();
        }
      }
      upward = !upward;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; },
  ];

  function applyMask(grid, maskIndex) {
    var mask = MASKS[maskIndex];
    var out = grid.modules.map(function (row) { return row.slice(); });
    for (var r = 0; r < grid.size; r++) {
      for (var c = 0; c < grid.size; c++) {
        if (grid.reserved[r][c]) continue;
        if (mask(r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function formatBits(maskIndex) {
    // ระดับ M = 0b00
    var data = (0b00 << 3) | maskIndex;
    var value = data << 10;
    for (var i = 4; i >= 0; i--) {
      if ((value >> (i + 10)) & 1) value ^= 0b10100110111 << i;
    }
    return ((data << 10) | value) ^ 0b101010000010010;
  }

  function versionBits(version) {
    var value = version << 12;
    for (var i = 5; i >= 0; i--) {
      if ((value >> (i + 12)) & 1) value ^= 0b1111100100101 << i;
    }
    return (version << 12) | value;
  }

  function drawFormat(modules, size, maskIndex) {
    var bits = formatBits(maskIndex);
    // bit(0) คือบิตสูงสุด (b14) เรียงจากซ้ายไปขวา ตามรูปในมาตรฐาน
    var bit = function (i) { return (bits >> (14 - i)) & 1; };

    // สำเนาที่หนึ่ง: รอบ finder pattern มุมซ้ายบน
    for (var i = 0; i <= 5; i++) modules[8][i] = bit(i);
    modules[8][7] = bit(6);
    modules[8][8] = bit(7);
    modules[7][8] = bit(8);
    for (var j = 9; j <= 14; j++) modules[14 - j][8] = bit(j);

    // สำเนาที่สอง: มุมซ้ายล่าง (b14–b8) และมุมขวาบน (b7–b0)
    for (var k = 0; k <= 6; k++) modules[size - 1 - k][8] = bit(k);
    for (var m = 0; m <= 7; m++) modules[8][size - 8 + m] = bit(7 + m);
  }

  function drawVersion(modules, size, version) {
    if (version < 7) return;
    var bits = versionBits(version);
    for (var i = 0; i < 18; i++) {
      var bit = (bits >> i) & 1;
      var row = Math.floor(i / 3);
      var col = i % 3;
      modules[row][size - 11 + col] = bit;
      modules[size - 11 + col][row] = bit;
    }
  }

  /* ---------- คะแนนโทษสำหรับเลือก mask ---------- */
  function penalty(modules, size) {
    var score = 0;

    // กฎ 1: โมดูลสีเดียวกันติดกันตั้งแต่ 5 ช่อง
    var runScore = function (get) {
      var total = 0;
      for (var a = 0; a < size; a++) {
        var run = 1;
        for (var b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) {
            run++;
          } else {
            if (run >= 5) total += run - 2;
            run = 1;
          }
        }
        if (run >= 5) total += run - 2;
      }
      return total;
    };
    score += runScore(function (r, c) { return modules[r][c]; });
    score += runScore(function (c, r) { return modules[r][c]; });

    // กฎ 2: บล็อก 2x2 สีเดียวกัน
    for (var r = 0; r < size - 1; r++) {
      for (var c = 0; c < size - 1; c++) {
        var v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    // กฎ 3: แกน 1:1:3:1:1 (มืด-สว่าง-มืดสามช่อง-สว่าง-มืด)
    // ที่มีพื้นที่สว่าง 4 ช่องขนาบข้างใดข้างหนึ่ง หรืออยู่ชิดขอบสัญลักษณ์
    var core = [1, 0, 1, 1, 1, 0, 1];

    var findCore = function (line, from) {
      for (var start = from; start <= size - 7; start++) {
        var hit = true;
        for (var i = 0; i < 7; i++) {
          if (line[start + i] !== core[i]) { hit = false; break; }
        }
        if (hit) return start;
      }
      return -1;
    };

    var allLight = function (line, from, to) {
      for (var i = Math.max(from, 0); i < Math.min(to, size); i++) {
        if (line[i]) return false;
      }
      return true;
    };

    var scanLine = function (line) {
      var found = 0;
      var idx = findCore(line, 0);
      while (idx !== -1) {
        var after = idx + 7;
        if (idx === 0 || idx === size - 7 ||
            allLight(line, idx - 4, idx) || allLight(line, after, after + 4)) {
          found += 40;
        } else {
          // ไม่เข้าเงื่อนไข — เริ่มมองหาแกนถัดไปจากกลางลวดลายเดิม
          after = idx + 4;
        }
        idx = findCore(line, after);
      }
      return found;
    };

    for (var i3 = 0; i3 < size; i3++) {
      var column = [];
      for (var j3 = 0; j3 < size; j3++) column.push(modules[j3][i3]);
      score += scanLine(modules[i3]);
      score += scanLine(column);
    }

    // กฎ 4: สัดส่วนโมดูลสีเข้มต่างจาก 50%
    var dark = 0;
    for (var i2 = 0; i2 < size; i2++) {
      for (var j2 = 0; j2 < size; j2++) dark += modules[i2][j2];
    }
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  /* ---------- API ---------- */
  function generate(text, options) {
    options = options || {};
    var bytes = utf8Bytes(String(text));
    var version = pickVersion(bytes.length);
    var codewords = interleave(buildCodewords(bytes, version), version);

    var grid = createMatrix(version);
    placeData(grid, codewords);

    var best = null;
    var forced = typeof options.mask === 'number' ? options.mask : null;

    // มาตรฐานกำหนดให้ให้คะแนน mask จากตารางที่ยัง "ไม่มี" format/version info
    // (ISO/IEC 18004:2015 หัวข้อ 7.8) จึงเขียนสองส่วนนั้นหลังเลือก mask ได้แล้ว
    for (var m = 0; m < 8; m++) {
      if (forced !== null && m !== forced) continue;
      var modules = applyMask(grid, m);
      var score = forced !== null ? 0 : penalty(modules, grid.size);
      if (!best || score < best.score) best = { score: score, modules: modules, mask: m };
    }

    drawFormat(best.modules, grid.size, best.mask);
    drawVersion(best.modules, grid.size, version);

    return { size: grid.size, version: version, mask: best.mask, modules: best.modules };
  }

  function toSvg(text, options) {
    options = options || {};
    var scale = options.scale || 8;
    var margin = options.margin == null ? 4 : options.margin;
    var dark = options.dark || '#000000';
    var light = options.light || '#ffffff';

    var qr = generate(text, options);
    var total = (qr.size + margin * 2) * scale;

    var path = [];
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (!qr.modules[r][c]) continue;
        path.push('M' + ((c + margin) * scale) + ' ' + ((r + margin) * scale) +
                  'h' + scale + 'v' + scale + 'h-' + scale + 'z');
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + total + '" height="' + total +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
      '<path fill="' + dark + '" d="' + path.join('') + '"/></svg>';
  }

  return { generate: generate, toSvg: toSvg };
})();
