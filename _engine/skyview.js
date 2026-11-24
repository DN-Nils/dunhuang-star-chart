/* ═══════════════════════════════════════════════════════════════
   SkyView —— Stellarium Web Engine 封装（地平线观星专业模式）
   引擎：stellarium-web-engine.js + .wasm（AGPL-3.0，见页脚署名）
   本文件只做：加载、挂载、观测者/时间同步、视角控制、点选
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* 路径基于本文件自身位置解析，页面放在哪一层都能找到引擎 */
  var BASE = (function(){
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return s.replace(/[^/]*$/, '');
    } catch (e) {}
    return '_engine/';
  })();
  var ENGINE_JS = BASE + 'stellarium-web-engine.js';
  var ENGINE_WASM = BASE + 'stellarium-web-engine.wasm';

  var M = null;            // 引擎模块
  var canvas = null;
  var host = null;
  var ready = false;
  var booting = null;
  var lastErr = null;

  /* ── 加载引擎 ── */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (global.StelWebEngine) return res();
      var s = document.createElement('script');
      s.src = src + '?v=' + Date.now();
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('引擎脚本加载失败')); };
      document.head.appendChild(s);
    });
  }

  /* 无条件加载脚本（loadScript 带 StelWebEngine 短路，只适合引擎本体） */
  function loadScriptRaw(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('脚本加载失败: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (booting) return booting;
    booting = (async function () {
      if (!global.WebAssembly) throw new Error('浏览器不支持 WebAssembly');
      await loadScript(ENGINE_JS);
      if (!global.StelWebEngine) throw new Error('引擎未就绪');

      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'skyEngineCanvas';
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;' +
                               'cursor:grab;touch-action:none;';
        host.appendChild(canvas);
      }
      /* file:// 下浏览器会拦截对本地 .wasm 的 fetch（opaque origin），
         因此：优先按协议走 base64 内嵌版，http(s) 才直接 fetch wasm */
      var buf = null;
      var isFile = (global.location && global.location.protocol === 'file:');
      if (!isFile) {
        try { buf = await (await fetch(ENGINE_WASM + '?v=1')).arrayBuffer(); }
        catch (e) { buf = null; }
      }
      if (!buf) {
        await loadScriptRaw(BASE + 'wasm-b64.js');
        var b64 = global.__STEL_WASM_B64;
        if (!b64) throw new Error('WASM 数据缺失');
        var bin = atob(b64);
        var len = bin.length;
        var u8 = new Uint8Array(len);
        for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
        buf = u8.buffer;
      }
      M = await global.StelWebEngine({
        wasmBinary: buf,
        locateFile: function (f) { return ENGINE_WASM.replace(/[^/]*$/, '') + String(f || '').split('/').pop(); },
        canvas: canvas
      });
      ready = true;
      resize();
      applyTouchStyles();
      return M;
    })().catch(function (e) {
      lastErr = e;
      throw e;
    });
    return booting;
  }

  /* ── 尺寸 ── */
  function resize() {
    if (!canvas) return;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(host.clientWidth * dpr));
    var h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = host.clientWidth + 'px';
      canvas.style.height = host.clientHeight + 'px';
    }
  }

  /* ── 观测者与时间 ── */
  var state = { lat: 40.14, lon: 94.66, elevation: 1200, yaw: 0, pitch: 20, fov: 70 };

  function setObserver(o) {
    if (!ready) return false;
    if (o) {
      if (typeof o.lat === 'number') state.lat = o.lat;
      if (typeof o.lon === 'number') state.lon = o.lon;
      if (typeof o.elevation === 'number') state.elevation = o.elevation;
    }
    try {
      var ob = M.observer;
      ob.longitude = state.lon * Math.PI / 180;
      ob.latitude = state.lat * Math.PI / 180;
      ob.elevation = state.elevation;
    } catch (e) { return false; }
    return true;
  }

  function setDate(date) {
    if (!ready || !date) return false;
    state.date = date;
    try { M.observer.utc = date; } catch (e) { return false; }
    return true;
  }

  function setView(yawDeg, pitchDeg, fovDeg) {
    if (!ready) return false;
    if (typeof yawDeg === 'number') state.yaw = yawDeg;
    if (typeof pitchDeg === 'number') state.pitch = Math.max(-85, Math.min(88, pitchDeg));
    if (typeof fovDeg === 'number') state.fov = Math.max(12, Math.min(120, fovDeg));
    try {
      var ob = M.observer;
      ob.yaw = state.yaw * Math.PI / 180;
      ob.pitch = state.pitch * Math.PI / 180;
      M.core.fov = state.fov * Math.PI / 180;
    } catch (e) { return false; }
    return true;
  }

  /* ── 交互：拖动环视 / 滚轮缩放 ── */
  var drag = null;
  function applyTouchStyles() {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      var k = state.fov / 900;
      setView(state.yaw - dx * k, state.pitch + dy * k, state.fov);
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var wasClick = drag.moved < 6;
      drag = null;
      canvas.style.cursor = 'grab';
      if (wasClick && typeof onClick === 'function') onClick(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointercancel', function () { drag = null; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      setView(state.yaw, state.pitch, state.fov * (e.deltaY > 0 ? 1.12 : 0.89));
    }, { passive: false });
  }

  /* ── 点选 ── */
  var onClick = null;
  function localPos(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var dpr = canvas.width / Math.max(1, r.width);
    return [Math.round((clientX - r.left) * dpr), Math.round((clientY - r.top) * dpr)];
  }

  /* 通过引擎的 clicks 队列做一次点击，再读 selection */
  function pickAt(clientX, clientY) {
    if (!ready) return null;
    var pos = localPos(clientX, clientY);
    try {
      var C = M.core;
      if (C.clicks && typeof C.clicks.push === 'function') {
        C.clicks.push({ pos: pos, pressed: true, moved: false });
      }
      var sel = C.selection;
      if (!sel) return null;
      var names = [];
      try { names.push(M.c2s(sel.name_translated_)); } catch (e) {}
      try { names.push(M.c2s(sel.designation_)); } catch (e) {}
      return { raw: sel, names: names.filter(Boolean) };
    } catch (e) { return null; }
  }

  /* ── 图层：与参考站的九个开关一一对应（引擎 core 子对象） ── */
  var LAYER_MAP = {
    'lines':          ['constellations', 'lines_visible'],   // 连线
    'illustrations':  ['constellations', 'images_visible'],  // 插画
    'atmosphere':     ['atmosphere', 'visible'],             // 大气
    'landscape':      ['landscapes', 'visible'],             // 地景
    'dso':            ['dsos', 'visible'],                   // 深空
    'milkyway':       ['milkyway', 'visible'],               // 银河
    'satellites':     ['satellites', 'visible'],             // 卫星
    'grid':           ['lines', null],                       // 网格（多子项）
    'stars':          ['stars', 'visible'],
    'planets':        ['planets', 'visible'],
    'labels':         ['labels', 'visible'],
    'cardinals':      ['cardinals', 'visible'],
    'bounds':         ['constellations', 'bounds_visible'],
    'fog':            ['landscapes', 'fog_visible'],
    'moonOrbits':     ['planets', 'srt_show_orbits']
  };

  function coreObj(key) {
    try { return M.core && M.core[key] ? M.core[key] : null; } catch (e) { return null; }
  }

  function setLayer(name, on) {
    if (!ready) return false;
    var map = LAYER_MAP[name];
    if (!map) return false;
    var obj = coreObj(map[0]);
    if (!obj) return false;
    try {
      if (name === 'grid') {
        // 网格：core.lines.azimuthal / equatorial / equatorial_jnow / meridian / ecliptic
        // 是**子对象**（各有 visible），不是布尔字段——必须写 .visible，否则会把对象覆盖掉
        var subs = ['azimuthal', 'equatorial', 'equatorial_jnow', 'meridian', 'ecliptic'];
        var ok = false;
        for (var i = 0; i < subs.length; i++) {
          var sub = obj[subs[i]];
          if (sub && typeof sub === 'object') {
            try { sub.visible = !!on; ok = true; } catch (e) {}
          }
        }
        if (!ok) { try { obj.visible = !!on; ok = true; } catch (e) {} }
        return ok;
      }
      obj[map[1]] = !!on;
      return true;
    } catch (e) { return false; }
  }

  /* 读取当前图层状态（用于 UI 回显与测试） */
  function getLayers() {
    if (!ready) return null;
    var out = {};
    Object.keys(LAYER_MAP).forEach(function (k) {
      var map = LAYER_MAP[k], obj = coreObj(map[0]);
      if (!obj) { out[k] = null; return; }
      try {
        if (k === 'grid') {
          var any = false;
          ['azimuthal', 'equatorial', 'equatorial_jnow', 'meridian', 'ecliptic'].forEach(function (s) {
            var sub = obj[s];
            if (sub && typeof sub === 'object' && sub.visible) any = true;
          });
          out[k] = any;
        }
        else out[k] = !!obj[map[1]];
      } catch (e) { out[k] = null; }
    });
    return out;
  }

  /* ── 导出 ── */
  global.SkyView = {
    boot: boot,
    isReady: function () { return ready; },
    lastError: function () { return lastErr; },
    mount: function (el) { host = el; },
    resize: resize,
    setObserver: setObserver,
    setDate: setDate,
    setView: setView,
    /* 视角以引擎内部真值为准（引擎会对 yaw/pitch 做归一化，本地缓存会有偏差） */
    getState: function () {
      if (ready) {
        try {
          var D = Math.PI / 180;
          return { yaw: M.observer.yaw / D, pitch: M.observer.pitch / D,
                   fov: M.core.fov / D, lat: state.lat, lon: state.lon, date: state.date };
        } catch (e) {}
      }
      return { yaw: state.yaw, pitch: state.pitch, fov: state.fov,
               lat: state.lat, lon: state.lon, date: state.date };
    },
    pickAt: pickAt,
    onPick: function (fn) { onClick = fn; },
    setLayer: setLayer,
    getLayers: getLayers,
    module: function () { return M; }
  };
})(window);