// ═══════════════════════════════════════════════════════════════
// SkyView 素材加载 —— 接入 Stellarium Web Engine 的星表/星座/地景等数据源
// 数据来自 cdn.skyamble.com（与参考站同源），引擎按 HiPS 协议按需拉取瓦片
// ═══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  // 与参考站同源的素材根（HiPS 协议：引擎按需拉 properties + 瓦片）
  var SKYAMBLE = 'https://cdn.skyamble.com';
  var SOURCES = {
    stars:        SKYAMBLE + '/localdata/stars3',
    skyculture:   SKYAMBLE + '/localdata/skycultures/western',
    dso:          SKYAMBLE + '/skydata/surveys/dso',
    milkyway:     SKYAMBLE + '/skydata/surveys/milkyway',
    landscape:    SKYAMBLE + '/skydata/landscapes/guereins',
    moon:         SKYAMBLE + '/skydata/surveys/sso/moon',
    sun:          SKYAMBLE + '/skydata/surveys/sso/sun',
    satellites:   SKYAMBLE + '/tle/tle_satellite.jsonl.gz',
    comets:       SKYAMBLE + '/skydata/mpc/CometEls.txt',
    asteroids:    SKYAMBLE + '/localdata/mpcorb.dat'
  };

  var loaded = {};
  var loading = null;

  function loadAll(M) {
    if (loading) return loading;
    loading = (async function () {
      var C = M.core;
      var log = [];
      function tryAdd(label, layer, opts) {
        try {
          layer.addDataSource(opts);
          loaded[label] = true;
          log.push(label + ': ok');
        } catch (e) {
          log.push(label + ': ERR ' + (e.message || e));
        }
      }
      // 星表（Gaia DR2，含星等/光谱）
      tryAdd('stars', C.stars, { url: SOURCES.stars });
      // 西方星座文化（连线 + 插画 + 名称）
      tryAdd('skyculture', C.skycultures, { url: SOURCES.skyculture, key: 'western' });
      C.skycultures.current_id = 'western';
      // 深空天体（Messier / NGC）
      tryAdd('dso', C.dsos, { url: SOURCES.dso });
      // 银河
      tryAdd('milkyway', C.milkyway, { url: SOURCES.milkyway });
      // 地景（guereins 野外全景）
      tryAdd('landscape', C.landscapes, { url: SOURCES.landscape, key: 'guereins' });
      C.landscapes.current_id = 'guereins';
      // 月亮与太阳纹理
      tryAdd('moon', C.planets, { url: SOURCES.moon, key: 'moon' });
      tryAdd('sun', C.planets, { url: SOURCES.sun, key: 'sun' });
      // 卫星 TLE
      tryAdd('satellites', C.satellites, { url: SOURCES.satellites, key: 'jsonl/sat' });
      // 彗星与小行星
      tryAdd('comets', C.comets, { url: SOURCES.comets, key: 'mpc_comets' });
      tryAdd('asteroids', C.minor_planets, { url: SOURCES.asteroids, key: 'mpc_asteroids' });
      global.__skySourcesLog = log;
      return loaded;
    })();
    return loading;
  }

  global.SkySources = {
    loadAll: loadAll,
    loaded: function () { return loaded; },
    SOURCES: SOURCES
  };
})(window);