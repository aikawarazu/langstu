/* ===== 最小 ZIP 实现（无第三方依赖）=====
   只做两件事：把若干文件打包成 zip（store 模式，不压缩——音频本身已压缩，文本也就几 MB），
   以及读回自己导出的 zip（只需支持 store）。导出/导入用同一套，保证往返幂等。 */
window.LSZip = (function () {
  var enc = new TextEncoder(), dec = new TextDecoder();
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }
  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function bytesOf(data) {
    if (data == null) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') return enc.encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return enc.encode(JSON.stringify(data));
  }

  /* files: [{path, data(string|Uint8Array|JSON)}] → Blob */
  function create(files, onProgress) {
    var parts = [], central = [], offset = 0, now = dosTime(new Date());
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        var name = enc.encode(f.path), body = bytesOf(f.data);
        var crc = crc32(body);
        var lh = new Uint8Array(30 + name.length);
        lh.set([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x08], 0);   /* version 20, flag UTF-8, store */
        lh.set(u16(now.time), 8); lh.set(u16(now.date), 10);
        lh.set(u32(crc), 14); lh.set(u32(body.length), 18); lh.set(u32(body.length), 22);
        lh.set(u16(name.length), 26);
        lh.set(name, 30);
        parts.push(lh, body);
        var ch = new Uint8Array(46 + name.length);
        ch.set([0x50, 0x4B, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00], 0);
        ch.set([0x00, 0x08], 4);
        ch.set(u16(now.time), 10); ch.set(u16(now.date), 12);
        ch.set(u32(crc), 16); ch.set(u32(body.length), 20); ch.set(u32(body.length), 24);
        ch.set(u16(name.length), 28);
        ch.set(u32(offset), 42);
        ch.set(name, 46);
        central.push(ch);
        offset += lh.length + body.length;
        if (onProgress) onProgress(i + 1, files.length, f.path);
      });
    });
    return chain.then(function () {
      var cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
      var eocd = new Uint8Array(22);
      eocd.set([0x50, 0x4B, 0x05, 0x06], 0);
      eocd.set(u16(files.length), 8); eocd.set(u16(files.length), 10);
      eocd.set(u32(cdSize), 12); eocd.set(u32(offset), 16);
      return new Blob(parts.concat(central, [eocd]), { type: 'application/zip' });
    });
  }

  /* 读回：只支持 store（自己导出的包），返回 {names, get(name)→Blob, text(name), json(name)} */
  function read(blob) {
    return blob.slice(Math.max(0, blob.size - 66000)).arrayBuffer().then(function (tailBuf) {
      var tail = new Uint8Array(tailBuf), off = -1;
      for (var i = tail.length - 22; i >= 0; i--) {
        if (tail[i] === 0x50 && tail[i + 1] === 0x4B && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { off = i; break; }
      }
      if (off < 0) throw new Error('不是合法的 zip 文件');
      var dv = new DataView(tailBuf);
      var count = dv.getUint16(off + 10, true);
      var cdSize = dv.getUint32(off + 12, true);
      var cdOff = dv.getUint32(off + 16, true);
      return blob.slice(cdOff, cdOff + cdSize).arrayBuffer().then(function (cdBuf) {
          var p = 0, entries = [], dv2 = new DataView(cdBuf);
          for (var n = 0; n < count && p + 46 <= cdBuf.byteLength; n++) {
            if (dv2.getUint32(p, true) !== 0x02014b50) break;
            var method = dv2.getUint16(p + 10, true);
            var compSize = dv2.getUint32(p + 20, true);
            var nameLen = dv2.getUint16(p + 28, true);
            var extraLen = dv2.getUint16(p + 30, true);
            var cmtLen = dv2.getUint16(p + 32, true);
            var lhOff = dv2.getUint32(p + 42, true);
            var name = dec.decode(new Uint8Array(cdBuf, p + 46, nameLen));
            entries.push({ name: name, method: method, compSize: compSize, lhOff: lhOff });
            p += 46 + nameLen + extraLen + cmtLen;
          }
          return {
            names: entries.map(function (e) { return e.name; }),
            entries: entries,
            _blob: blob,
            get: function (name) {
              var e = entries.filter(function (x) { return x.name === name; })[0];
              if (!e) return Promise.resolve(null);
              return blob.slice(e.lhOff, e.lhOff + 30).arrayBuffer().then(function (lh) {
                var d = new DataView(lh);
                var nLen = d.getUint16(26, true), xLen = d.getUint16(28, true);
                var start = e.lhOff + 30 + nLen + xLen;
                return blob.slice(start, start + e.compSize);
              });
            },
            text: function (name) {
              return this.get(name).then(function (b) { return b ? b.text() : null; });
            },
            json: function (name) {
              return this.text(name).then(function (t) { return t ? JSON.parse(t) : null; });
            }
          };
        });
    });
  }

  return { create: create, read: read, crc32: crc32 };
})();
