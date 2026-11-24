/* ============================================================================
 * 观星图鉴 · 详情页  (assets/atlas-detail.js)
 * 独立脚本：只在 body 末注入一个全屏页面，不改动主场景 IIFE。
 * 数据全部来自页面已有的真实数据表：
 *   STAR_SET / STAR_PLAIN / STAR_CULTURE / WEST_MAP / GRP_NAME / DOME_DSO
 * 位置与时间取自 window.__dome.state（当前观测地 + 模拟时刻）。
 * ========================================================================== */
(function () {
  "use strict";

  var DEG = Math.PI / 180;
  var MONTHS = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
                '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
  var AZ8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  /* 独立页（观星图鉴.html）里没有 hash 路由，不要改写地址栏 */
  var STANDALONE = !!window.__ATLAS_STANDALONE;

  /* 图鉴条目顺序（与观星图鉴网格一致） */
  var ORDER = ['角', '亢', '氐', '房', '心', '尾', '箕',
               '斗', '牛', '女', '虚', '危', '室', '壁',
               '奎', '娄', '胃', '昴', '毕', '觜', '参',
               '井', '鬼', '柳', '星', '张', '翼', '轸',
               '北斗', '紫微垣', '太微垣', '天市垣',
               '织女一', '河鼓二', '天津四', '天狼', '老人', '大角',
               '轩辕十四', '五车二', '北落师门', '南河三', '北河三',
               '参宿四', '帝星', '北极星'];

  /* 二十八宿星数（与图鉴 info 一致） */
  var COUNTS = {
    '角': 2, '亢': 4, '氐': 4, '房': 4, '心': 3, '尾': 9, '箕': 4,
    '斗': 6, '牛': 6, '女': 4, '虚': 2, '危': 3, '室': 2, '壁': 2,
    '奎': 16, '娄': 3, '胃': 3, '昴': 7, '毕': 8, '觜': 3, '参': 7,
    '井': 8, '鬼': 4, '柳': 8, '星': 7, '张': 6, '翼': 22, '轸': 4,
    '北斗': 7, '北极星': 1
  };

  /* 北斗七星的拜耳名（写成表比正则解析可靠） */
  var BEIDOU_BAYER = {
    '天枢': 'Alp UMa', '天璇': 'Bet UMa', '天玑': 'Gam UMa', '天权': 'Del UMa',
    '玉衡': 'Eps UMa', '开阳': 'Zet UMa', '摇光': 'Eta UMa'
  };

  /* 只在有把握时才写的找星路径；其余条目走程序算出来的方位指引 */
  var TIPS = {
    '北极星': '先找北斗：勺口的天璇与天枢连线，朝勺口方向延长约 5 倍，就是北极星。也可以用仙后座的「W」开口来指。',
    '北斗': '勺口两星（天璇→天枢）延长 5 倍指北极星；斗柄的指向随季节转动——东指天下皆春，南指皆夏，西指皆秋，北指皆冬。',
    '角': '沿北斗斗柄的弧线「春季大曲线」向东延伸，先遇到橙色的大角星，再顺着同一弧度往下，就是蓝白色的角宿一。',
    '心': '夏季大三角里那颗偏红的就是心宿二（天蝎座心脏）。也可以从大角星向东南方找，天蝎弯曲的尾部尽头便是。',
    '昴': '冬季傍晚抬头看西南方高处，金牛肩部一小团挤在一起的星星就是昴星团，视力好的能数出 6—7 颗；它与毕宿五、猎户座连成一条线。',
    '毕': '猎户座肩膀（参宿四）向西北延伸就是毕宿五（金牛座α），橙红色，很好认；毕宿五东南方不远的那颗暗一些的星才是距星毕宿一。',
    '参': '冬季南方最醒目的三颗等距排列的星是猎户腰带，腰带东南角那颗就是距星参宿一；腰带上方的参宿四偏红，下方参宿七偏蓝。',
    '觜': '就在猎户头部，参宿四正上方那一小撮星，三颗挤在一起，肉眼看上去像猎户的「头」。',
    '井': '从猎户座向东北方找，双子座的两颗亮星北河二、北河三是路标；井宿一在它们西侧，是一颗偏红的星。',
    '鬼': '巨蟹座中央那团朦胧的光斑就是鬼宿里的积尸气（M44），鬼宿四星围着它，城市里要等暗夜才看得清。',
    '柳': '长蛇座头部往西的那一串暗星，位置在巨蟹座与乌鸦座之间，整体比较暗，建议用双筒镜辅助。',
    '星': '长蛇座的心脏星宿一（Alphard）是这一带唯一的亮星，孤零零地悬在狮子座与乌鸦座之间，找到它就到星宿了。',
    '张': '从星宿一继续向东找，长蛇座弯曲的身体中段没有明显亮星，需要借助乌鸦座再往西推。',
    '翼': '巨爵座（酒杯）在西边，乌鸦座在东南，翼宿就在这两者之间的大片暗星区，靠星座轮廓定位。',
    '轸': '乌鸦座四颗星组成的四边形就是轸宿，是春季南方天空里最容易认的小四边形之一。',
    '奎': '秋季傍晚，从飞马座大四方形东侧往外找，仙女座那条星链的起点附近就是奎宿；奎宿一是颗 4 等的黄巨星，不显眼。',
    '娄': '白羊座的两颗亮星娄宿一（β）和娄宿二（α）位于飞马座脚下，秋季在东方升起。',
    '室': '秋季飞马座大四边形的西北角就是室宿一（α Peg），旁边紧挨着室宿二，合称「营室」。',
    '壁': '飞马座大四边形的东北角是壁宿一（γ Peg），与室宿一隔着四边形的一条边相望。',
    '紫微垣': '北极星周围的拱极天区，终年不落。用北斗和仙后座就能把它围出来，垣内最亮的星是帝星（小熊座β）。',
    '太微垣': '在狮子座的后半身与室女座之间，春季晚上位于南方高空，狮子座「镰刀」的东侧就是天区入口。',
    '天市垣': '夏季晚上，从武仙座与蛇夫座之间找，天市垣的星比较暗，需要避开城市灯光。',
    '织女一': '夏季大三角的直角顶点，青白色，夏夜几乎就在头顶；它属于天琴座，与旁边的织女二是双星。',
    '河鼓二': '夏季大三角最南端的亮星，就是牛郎星；它两侧各有一颗小星，民间称为「扁担星」。',
    '天津四': '夏季大三角第三个顶点，位于天鹅座尾部，银河从它身上穿过，是银河最亮的一段。',
    '天狼': '冬季傍晚向东南方看，全天最亮的星就是它；从猎户腰带三星向东南延长，几乎正指天狼。',
    '老人': '南方低空才看得到，冬季前后在正南方向贴近地平线；北纬 37° 以北基本看不到。',
    '大角': '沿北斗斗柄的弧线延长（「春季大曲线」），第一颗遇到的橙色亮星就是大角。',
    '轩辕十四': '狮子座「镰刀」底部的那颗蓝白色亮星；黄道从它附近经过，月亮和行星常从旁边掠过。',
    '五车二': '冬季北方高空，御夫座五边形里最亮的那颗，偏黄白色；它几乎整夜可见。',
    '北落师门': '秋季南方天空里孤零零的一颗亮星，周围没有别的亮星作参照，人称「秋季孤星」。',
    '南河三': '冬季大三角最东端的亮星，与天狼、参宿四大致等距，位于小犬座。',
    '北河三': '双子座最亮的那颗（β Gem），偏橙；它与北河二并肩，是双子的一对「头」。',
    '参宿四': '猎户的肩膀，明显偏红；它是一颗红超巨星，亮度有缓慢起伏，未来可能爆发为超新星。',
    '帝星': '小熊座的 β 星（Kochab），在北极星旁边；两千多年前它才是离天极最近的「北辰」。'
  };

  /* ---------------------------------------------------------------- 工具 */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad2(n) { n = Math.round(n); return (n < 10 ? '0' : '') + n; }

  function raText(deg) {
    var h = (((deg / 15) % 24) + 24) % 24;
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
    return hh + 'h ' + pad2(mm) + 'm';
  }
  function decText(deg) {
    var s = deg < 0 ? '−' : '+', a = Math.abs(deg);
    var dd = Math.floor(a), mm = Math.round((a - dd) * 60);
    if (mm === 60) { dd++; mm = 0; }
    return s + dd + '° ' + pad2(mm) + '′';
  }

  /* 球面角距（度） */
  function angDist(ra1, de1, ra2, de2) {
    var a1 = ra1 * DEG, a2 = ra2 * DEG, d1 = de1 * DEG, d2 = de2 * DEG;
    var c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
    c = Math.max(-1, Math.min(1, c));
    return Math.acos(c) / DEG;
  }

  /* 本地恒星时（度） */
  function lstDeg(date, lonDeg) {
    var jd = date.getTime() / 86400000 + 2440587.5;
    var D = jd - 2451545.0;
    var gmst = 280.46061837 + 360.98564736629 * D;
    return ((gmst + lonDeg) % 360 + 360) % 360;
  }

  /* 地平坐标 */
  function altAz(raDeg, decDeg, lst, latDeg) {
    var H = (lst - raDeg) * DEG, d = decDeg * DEG, la = latDeg * DEG;
    var sinAlt = Math.sin(d) * Math.sin(la) + Math.cos(d) * Math.cos(la) * Math.cos(H);
    sinAlt = Math.max(-1, Math.min(1, sinAlt));
    var alt = Math.asin(sinAlt) / DEG;
    var az = Math.atan2(-Math.cos(d) * Math.sin(H),
      Math.sin(d) * Math.cos(la) - Math.cos(d) * Math.sin(la) * Math.cos(H)) / DEG;
    return { alt: alt, az: (az + 360) % 360 };
  }

  function azName(a) { return AZ8[Math.round((((a % 360) + 360) % 360) / 45) % 8]; }

  function bestMonth(ra) {
    var m = Math.round(((ra - 180) / 360) * 12 + 6) % 12;
    if (m <= 0) m += 12;
    return m;
  }

  function hm(h) {
    h = ((h % 24) + 24) % 24;
    return pad2(Math.floor(h)) + ':' + pad2((h - Math.floor(h)) * 60);
  }

  /* -------------------------------------------------------- 观测地/时刻 */
  function observer() {
    var st = null;
    try { st = window.__dome && window.__dome.state; } catch (e) { st = null; }
    if (st && typeof st.lat === 'number' && typeof st.lon === 'number') {
      var y = new Date().getFullYear();
      var day = (typeof st.day === 'number') ? st.day : 0;
      var hour = (typeof st.hour === 'number') ? st.hour : 22;
      var date = new Date(y, 0, 1 + day, Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
      return { lat: st.lat, lon: st.lon, name: st.locName || '当前观测地', date: date };
    }
    return { lat: 40.14, lon: 94.66, name: '敦煌', date: new Date() };
  }

  /* ------------------------------------------------------------ 数据读取 */
  function setList() { return window.STAR_SET || []; }

  function findItem(name) {
    if (name === '北极星') {
      return {
        name: '北极星', group: '北', mag: 1.98, spec: 'F', lon: 37.95, lat: 89.26,
        info: '北极星即勾陈一（小熊座α），距北天极约0.7°，终夜几乎不动，古人以此定时定向。《论语》「譬如北辰，居其所而众星共之」。'
      };
    }
    var arr = setList();
    for (var i = 0; i < arr.length; i++) if (arr[i].name === name) return arr[i];
    return null;
  }

  function kindOf(name, it) {
    if (name === '北极星') return '亮星';
    if (it.zone) return '三垣天区';
    if (it.special) return '星组';
    if (it.single) return '亮星';
    return '星宿';
  }

  /* 从 info 里抽「距星名（西方星）」 */
  function parseJu(info) {
    var m = /距星([^（(]+)[（(]([^）)]+)[）)]/.exec(info || '');
    return m ? { name: m[1], west: m[2] } : null;
  }

  /* 从 info 里抽拜耳名，如「天琴座α」 */
  function parseBayer(info) {
    var m = /([\u4e00-\u9fa5]{2,4}座)\s*([α-ωΑ-Ωa-zA-Z0-9]{1,3})/.exec(info || '');
    return m ? (m[1] + m[2]) : '';
  }

  /* 邻近亮星：赤经赤纬接近的「名」组条目 */
  function nearBright(name, ra, dec, maxDeg) {
    var out = [], arr = setList();
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (!s.single || s.name === name) continue;
      var d = angDist(ra, dec, s.lon, s.lat);
      if (d <= maxDeg) out.push({ n: s.name, bayer: parseBayer(s.info), mag: s.mag, d: d });
    }
    out.sort(function (a, b) { return a.mag - b.mag; });
    return out;
  }

  /* 邻近深空天体 */
  function nearDSO(ra, dec, maxDeg) {
    var src = window.DOME_DSO || [], out = [];
    for (var i = 0; i < src.length; i++) {
      var o = src[i];
      var d = angDist(ra, dec, o.ra * 15, o.dec);
      if (d <= maxDeg) out.push({ n: o.n, type: o.type, mag: o.mag, size: o.size, d: d });
    }
    out.sort(function (a, b) { return a.mag - b.mag; });
    return out;
  }

  /* -------------------------------------------------------------- 记录体 */
  function buildRecord(name) {
    var it = findItem(name);
    if (!it) return null;

    var plain = (window.STAR_PLAIN || {})[name] || '';
    var cul = (window.STAR_CULTURE || {})[name] || null;
    var west = (window.WEST_MAP || {})[name] || '';
    var grpName = (window.GRP_NAME || {})[it.group] || '';
    var info = it.info || '';
    var ju = parseJu(info);
    var kind = kindOf(name, it);

    var order = ORDER.indexOf(name);
    var prev = order > 0 ? ORDER[order - 1] : null;
    var next = order >= 0 && order < ORDER.length - 1 ? ORDER[order + 1] : null;

    /* 宿序（四象内第几宿） */
    var sub = grpName;
    if (kind === '星宿') {
      var groups = { '东': 1, '北': 8, '西': 15, '南': 22 };
      var start = groups[it.group];
      if (start) sub = grpName + ' · 第 ' + (order - (start - 1) + 1) + ' 宿';
    }

    var lead = plain ? plain.split('。')[0] + '。' : (info ? info.split('。')[0] + '。' : '敦煌星图所绘天区之一。');

    return {
      name: name,
      it: it,
      kind: kind,
      sub: sub,
      grpName: grpName,
      west: west,
      plain: plain,
      info: info,
      cul: cul,
      ju: ju,
      bayer: parseBayer(info),
      lead: lead,
      ra: it.lon,
      dec: it.lat,
      mag: it.mag,
      spec: it.spec,
      count: COUNTS[name] || 0,
      bestMonth: bestMonth(it.lon),
      prev: prev,
      next: next,
      fov: (kind === '三垣天区' || name === '北斗') ? 46 : (kind === '亮星' ? 26 : 34)
    };
  }

  /* ------------------------------------------------------------ 天区连线图 */
  function drawChart(cv, rec) {
    var W = Math.max(320, cv.clientWidth || 520);
    var H = Math.round(W * 0.58);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';

    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    /* 背景 */
    var bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.62);
    bg.addColorStop(0, 'rgba(22,32,58,.92)');
    bg.addColorStop(1, 'rgba(7,10,20,.96)');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    var ra0 = rec.ra, dec0 = rec.dec, fov = rec.fov;
    var scale = Math.min(W, H) / (2 * Math.tan(fov / 2 * DEG));

    function proj(ra, dec) {
      var dr = (ra - ra0) * DEG, d0 = dec0 * DEG, d = dec * DEG;
      var cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dr);
      if (cosc <= 0.08) return null;
      var x = Math.cos(d) * Math.sin(dr) / cosc;
      var y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dr)) / cosc;
      return { x: W / 2 + x * scale, y: H / 2 - y * scale };
    }
    function inView(p) {
      return p && p.x > -60 && p.x < W + 60 && p.y > -60 && p.y < H + 60;
    }

    /* 二十八宿连线 */
    var mansions = [];
    var arr = setList();
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (['东', '北', '西', '南'].indexOf(s.group) >= 0 && !s.special) {
        mansions.push({ n: s.name, p: proj(s.lon, s.lat) });
      }
    }
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(120,150,205,.42)';
    g.beginPath();
    var started = false;
    for (var k = 0; k < mansions.length; k++) {
      var p = mansions[k].p;
      if (!p) { started = false; continue; }
      if (!started) { g.moveTo(p.x, p.y); started = true; }
      else g.lineTo(p.x, p.y);
    }
    g.stroke();

    /* 其他宿的点 */
    for (var m = 0; m < mansions.length; m++) {
      var q = mansions[m].p;
      if (!inView(q)) continue;
      var isCur = (mansions[m].n === rec.name);
      if (isCur) continue;
      g.beginPath();
      g.fillStyle = 'rgba(200,214,240,.55)';
      g.arc(q.x, q.y, 2.2, 0, Math.PI * 2);
      g.fill();
      if (fov <= 40) {
        g.fillStyle = 'rgba(190,200,220,.62)';
        g.font = '11px "Noto Serif SC","SimSun",serif';
        g.fillText(mansions[m].n + '宿', q.x + 5, q.y - 5);
      }
    }

    /* 邻近名星 */
    for (var b = 0; b < arr.length; b++) {
      var st = arr[b];
      if (!st.single) continue;
      var pp = proj(st.lon, st.lat);
      if (!inView(pp)) continue;
      g.beginPath();
      g.fillStyle = 'rgba(255,244,224,.9)';
      g.arc(pp.x, pp.y, 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,240,210,.75)';
      g.font = '11px "Noto Serif SC","SimSun",serif';
      g.fillText(st.name, pp.x + 6, pp.y + 4);
    }

    /* 当前条目 */
    var cp = proj(ra0, dec0);
    if (cp) {
      g.beginPath();
      g.strokeStyle = 'rgba(232,201,126,.55)';
      g.lineWidth = 1.2;
      g.arc(cp.x, cp.y, 12, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.fillStyle = '#F3D9A4';
      g.arc(cp.x, cp.y, 5.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#F6E3BC';
      g.font = '600 14px "Noto Serif SC","SimSun",serif';
      g.fillText(rec.name, cp.x + 14, cp.y + 5);
    }

    /* 角标 */
    g.fillStyle = 'rgba(168,159,139,.72)';
    g.font = '10.5px "Noto Serif SC","SimSun",serif';
    g.fillText('心射投影 · 视场约 ' + Math.round(fov) + '° · 北在上', 12, H - 12);

    /* 北向箭头 */
    g.strokeStyle = 'rgba(201,162,92,.6)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(W - 34, 44); g.lineTo(W - 34, 20);
    g.moveTo(W - 39, 26); g.lineTo(W - 34, 18); g.lineTo(W - 29, 26);
    g.stroke();
    g.fillStyle = 'rgba(201,162,92,.85)';
    g.font = '11px "Noto Serif SC","SimSun",serif';
    g.fillText('N', W - 39, 58);
  }

  /* -------------------------------------------------------------- 12 月图 */
  function yearCurve(rec, ob) {
    var out = [], y = ob.date.getFullYear();
    for (var m = 0; m < 12; m++) {
      var d = new Date(y, m, 15, 21, 0, 0, 0);
      var aa = altAz(rec.ra, rec.dec, lstDeg(d, ob.lon), ob.lat);
      out.push({ m: m, alt: aa.alt });
    }
    return out;
  }

  /* 升落时刻（约） */
  function riseSet(rec, ob) {
    var phi = ob.lat * DEG, dec = rec.dec * DEG;
    var cosH = -Math.tan(phi) * Math.tan(dec);
    if (cosH <= -1) return { text: '恒显 · 终夜不落' };
    if (cosH >= 1) return { text: '恒隐 · 本地不可见' };
    var H0 = Math.acos(cosH) / DEG;
    var d0 = new Date(ob.date.getFullYear(), ob.date.getMonth(), ob.date.getDate(), 0, 0, 0, 0);
    var lst0 = lstDeg(d0, ob.lon);
    function toLocal(t) {
      var dh = (((t - lst0) % 360 + 360) % 360) / 15.041;
      return ((dh + ob.lon / 15) % 24 + 24) % 24;
    }
    return { rise: toLocal(rec.ra - H0), set: toLocal(rec.ra + H0) };
  }

  /* ---------------------------------------------------------------- 渲染 */
  var root = null, current = null, canvasEl = null;

  function ensureDOM() {
    if (root) return;

    var css = document.createElement('style');
    css.textContent = [
      '#pageAtlasdetail{position:fixed;inset:0;z-index:44;display:none;flex-direction:column;overflow:hidden;',
      'background:radial-gradient(120% 90% at 50% -10%,rgba(201,162,92,.07),rgba(201,162,92,0) 55%),',
      'linear-gradient(165deg,#0B1020 0%,#070A16 60%,#05070F 100%);color:var(--ink,#E3DAC8)}',
      '#pageAtlasdetail.on{display:flex;animation:pgIn .3s cubic-bezier(.18,.72,.2,1)}',
      '#pageAtlasdetail .ad-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}',
      '#pageAtlasdetail .ad-scroll::-webkit-scrollbar{width:6px}',
      '#pageAtlasdetail .ad-scroll::-webkit-scrollbar-thumb{background:rgba(201,162,92,.28);border-radius:3px}',
      '#pageAtlasdetail .ad-wrap{max-width:1040px;margin:0 auto;padding:18px 26px 60px}',
      '#pageAtlasdetail .ad-crumb{font-size:11.5px;letter-spacing:.14em;color:var(--ink-dim,#A89F8B);margin-bottom:14px}',
      '#pageAtlasdetail .ad-crumb a{color:rgba(201,162,92,.9);cursor:pointer;text-decoration:none}',
      '#pageAtlasdetail .ad-crumb a:hover{color:#F0DFA8}',
      '#pageAtlasdetail .ad-crumb i{opacity:.45;font-style:normal;margin:0 6px}',
      '#pageAtlasdetail .ad-kicker{font-size:11px;letter-spacing:.28em;color:var(--gold,#C9A25C)}',
      '#pageAtlasdetail h1{margin:6px 0 10px;font-family:"Noto Serif SC","STKaiti","KaiTi","SimSun",serif;',
      'font-size:40px;letter-spacing:.1em;color:#F6E3BC;font-weight:700;line-height:1.2}',
      '#pageAtlasdetail h1 em{font-size:19px;font-style:normal;letter-spacing:.12em;color:rgba(201,162,92,.85);margin-left:12px}',
      '#pageAtlasdetail .ad-lead{font-size:14px;line-height:1.95;color:#D9CFBA;max-width:760px;margin:0 0 16px}',
      '#pageAtlasdetail .ad-btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}',
      '#pageAtlasdetail .ad-btn{padding:9px 18px;border-radius:9px;border:1px solid rgba(201,162,92,.42);',
      'background:rgba(201,162,92,.1);color:#F0DFA8;font-size:13px;cursor:pointer;font-family:inherit;letter-spacing:.08em}',
      '#pageAtlasdetail .ad-btn:hover{background:rgba(201,162,92,.22)}',
      '#pageAtlasdetail .ad-btn.go{background:var(--gold,#C9A25C);color:#1A1508;border-color:#E8C97E;font-weight:600}',
      '#pageAtlasdetail .ad-cols{display:grid;grid-template-columns:1.35fr 1fr;gap:20px;align-items:start}',
      '@media (max-width:820px){#pageAtlasdetail .ad-cols{grid-template-columns:1fr}',
      '#pageAtlasdetail h1{font-size:30px}}',
      '#pageAtlasdetail .ad-fig{margin:0}',
      '#pageAtlasdetail .ad-fig canvas{width:100%;display:block;border-radius:12px;',
      'border:1px solid rgba(201,162,92,.22)}',
      '#pageAtlasdetail .ad-fig figcaption{font-size:11px;color:var(--ink-dim,#A89F8B);margin-top:7px;letter-spacing:.06em}',
      '#pageAtlasdetail .ad-basic{border:1px solid rgba(201,162,92,.2);border-radius:12px;',
      'background:rgba(255,255,255,.022);padding:14px 16px}',
      '#pageAtlasdetail h3{margin:0 0 12px;font-family:"Noto Serif SC","STKaiti","KaiTi","SimSun",serif;',
      'font-size:16px;letter-spacing:.18em;color:#F0DFA8;font-weight:700;',
      'display:flex;align-items:center;gap:9px}',
      '#pageAtlasdetail h3::before{content:"";width:7px;height:7px;background:var(--gold,#C9A25C);transform:rotate(45deg);flex:none}',
      '#pageAtlasdetail .ad-basic dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:12.5px;line-height:1.6}',
      '#pageAtlasdetail .ad-basic dt{color:rgba(168,159,139,.92);letter-spacing:.05em;white-space:nowrap}',
      '#pageAtlasdetail .ad-basic dd{margin:0;color:#F0DFA8;font-weight:600;font-variant-numeric:tabular-nums;text-align:right}',
      '#pageAtlasdetail .ad-sec{margin-top:30px;padding-top:22px;border-top:1px solid rgba(201,162,92,.14)}',
      '#pageAtlasdetail .ad-sec p{margin:0 0 10px;font-size:13px;line-height:2;color:#DDD3BF}',
      '#pageAtlasdetail .ad-quote{margin:0 0 12px;padding:10px 14px;border-left:2px solid rgba(201,162,92,.6);',
      'border-radius:0 8px 8px 0;background:rgba(201,162,92,.1);color:#F0D9A8;font-size:13px;line-height:1.95;',
      'font-family:"Noto Serif SC","STKaiti","KaiTi","SimSun",serif}',
      '#pageAtlasdetail .ad-pos{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px}',
      '#pageAtlasdetail .ad-pos div{padding:11px 13px;border-radius:10px;border:1px solid rgba(201,162,92,.18);',
      'background:rgba(255,255,255,.022)}',
      '#pageAtlasdetail .ad-pos b{display:block;font-size:18px;color:#F0DFA8;font-variant-numeric:tabular-nums;',
      'font-weight:700;line-height:1.4}',
      '#pageAtlasdetail .ad-pos span{font-size:10.5px;color:rgba(168,159,139,.9);letter-spacing:.12em}',
      '#pageAtlasdetail .ad-bars{display:flex;align-items:flex-end;gap:5px;height:120px;margin-top:8px}',
      '#pageAtlasdetail .ad-bars .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;',
      'align-items:center;gap:5px;height:100%}',
      '#pageAtlasdetail .ad-bars .bar{width:100%;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#E8C97E,#8E6B2F);',
      'min-height:2px;transition:height .4s}',
      '#pageAtlasdetail .ad-bars .col > i{font-size:9.5px;color:rgba(168,159,139,.85);font-style:normal}',
      '#pageAtlasdetail .ad-bars .col > u{font-size:9.5px;color:rgba(201,162,92,.75);text-decoration:none;height:12px}',
      '#pageAtlasdetail table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#pageAtlasdetail th{text-align:left;font-weight:600;color:rgba(168,159,139,.95);font-size:11px;',
      'letter-spacing:.14em;padding:7px 10px;border-bottom:1px solid rgba(201,162,92,.28)}',
      '#pageAtlasdetail td{padding:8px 10px;border-bottom:1px solid rgba(201,162,92,.1);color:#E6DCC8}',
      '#pageAtlasdetail td b{color:#F0DFA8;font-weight:600}',
      '#pageAtlasdetail .ad-dso{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px}',
      '#pageAtlasdetail .ad-dso div{padding:10px 12px;border-radius:9px;border:1px solid rgba(201,162,92,.16);',
      'background:rgba(255,255,255,.02);font-size:12px}',
      '#pageAtlasdetail .ad-dso b{display:block;color:#F0DFA8;font-size:12.5px;margin-bottom:3px}',
      '#pageAtlasdetail .ad-dso span{color:rgba(168,159,139,.92);font-size:10.5px;letter-spacing:.06em}',
      '#pageAtlasdetail .ad-pager{display:flex;justify-content:space-between;gap:12px;margin-top:34px;',
      'padding-top:20px;border-top:1px solid rgba(201,162,92,.14)}',
      '#pageAtlasdetail .ad-pager button{padding:10px 16px;border-radius:9px;border:1px solid rgba(201,162,92,.3);',
      'background:rgba(201,162,92,.06);color:#E8DEC6;font-size:12.5px;cursor:pointer;font-family:inherit}',
      '#pageAtlasdetail .ad-pager button:hover{background:rgba(201,162,92,.18);color:#F6E3BC}',
      '#pageAtlasdetail .ad-pager button:disabled{opacity:.28;cursor:default}',
      '#pageAtlasdetail .ad-empty{font-size:12.5px;color:rgba(168,159,139,.8);line-height:1.9}',
      '#atlPage{background:var(--gold,#C9A25C);color:#1A1508;border-color:#E8C97E;font-weight:600}'
    ].join('');
    document.head.appendChild(css);

    root = document.createElement('section');
    root.id = 'pageAtlasdetail';
    root.setAttribute('aria-label', '星宿详情页');
    root.innerHTML =
      '<header class="pg-head">' +
        '<h2 id="adHeadTitle">星宿详情</h2>' +
        '<span class="pg-sub" id="adHeadSub">四象二十八宿</span>' +
        '<button class="pg-back" type="button" id="adBack">← 返回图鉴</button>' +
      '</header>' +
      '<div class="ad-scroll" id="adScroll"><div class="ad-wrap" id="adWrap"></div></div>';
    document.body.appendChild(root);

    $('adBack').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root && root.classList.contains('on')) close();
    });
    document.addEventListener('click', function (e) {
      var nav = e.target.closest ? e.target.closest('.pn-btn') : null;
      if (nav && root && root.classList.contains('on')) close();
    });
    window.addEventListener('resize', function () {
      if (root && root.classList.contains('on') && current && canvasEl) drawChart(canvasEl, current);
    });
  }

  function sec(title, bodyHTML) {
    return '<section class="ad-sec"><h3>' + title + '</h3>' + bodyHTML + '</section>';
  }

  function render(name) {
    ensureDOM();
    var rec = buildRecord(name);
    if (!rec) return false;
    current = rec;

    var ob = observer();
    var lst = lstDeg(ob.date, ob.lon);
    var aa = altAz(rec.ra, rec.dec, lst, ob.lat);
    var maxAlt = 90 - Math.abs(ob.lat - rec.dec);
    var rs = riseSet(rec, ob);
    var curve = yearCurve(rec, ob);

    $('adHeadTitle').textContent = rec.name + (rec.kind === '星宿' ? '宿' : '');
    $('adHeadSub').textContent = rec.grpName || rec.kind;

    var title = rec.name + (rec.kind === '星宿' ? '宿' : '');
    var eng = rec.west ? (rec.west + '座天区') : '';

    /* 基本信息 */
    var rows = [
      ['类型', rec.kind],
      ['所属', rec.grpName || '—'],
      ['距星', rec.ju ? (rec.ju.name + '（' + rec.ju.west + '）') : '—'],
      ['星官星数', rec.count ? rec.count + ' 星' : '—'],
      ['赤经', raText(rec.ra)],
      ['赤纬', decText(rec.dec)],
      ['视星等', (typeof rec.mag === 'number') ? rec.mag.toFixed(2) : '—'],
      ['光谱型', rec.spec ? rec.spec + ' 型' : '—'],
      ['西方天区', rec.west ? (rec.west + '座') : '三垣无对应'],
      ['最佳观测', rec.bestMonth + ' 月前后']
    ];
    var basicHTML = '<dl>' + rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl>';

    /* 今晚位置 */
    var posHTML =
      '<div class="ad-pos">' +
        '<div><span>此刻高度</span><b>' + aa.alt.toFixed(1) + '°</b></div>' +
        '<div><span>此刻方位</span><b>' + aa.az.toFixed(0) + '° · ' + azName(aa.az) + '</b></div>' +
        '<div><span>最高高度</span><b>' + maxAlt.toFixed(0) + '°</b></div>' +
        '<div><span>今日升起</span><b>' + (rs.text ? '—' : hm(rs.rise)) + '</b></div>' +
        '<div><span>今日落下</span><b>' + (rs.text ? '—' : hm(rs.set)) + '</b></div>' +
      '</div>' +
      '<p style="margin-bottom:6px">' +
        (aa.alt > 0 ? '此刻它在地平线之上，' : '此刻它在地平线之下，') +
        '观测地为 ' + esc(ob.name) + '（北纬 ' + ob.lat.toFixed(2) + '°，东经 ' + ob.lon.toFixed(2) + '°）。' +
        (rs.text ? rs.text + '。' : '升落时刻为当地平太阳时的近似值。') +
      '</p>';

    /* 12 月高度柱 */
    var top = 0, bottom = 0;
    curve.forEach(function (c) { if (c.alt > top) top = c.alt; if (c.alt < bottom) bottom = c.alt; });
    var span = Math.max(10, top - Math.min(0, bottom));
    var bars = curve.map(function (c, i) {
      var h = c.alt > 0 ? Math.max(2, c.alt / span * 100) : 0;
      return '<div class="col" title="' + MONTHS[i] + ' 21:00 高度 ' + c.alt.toFixed(1) + '°">' +
        '<u>' + (c.alt > 0 ? Math.round(c.alt) + '°' : '') + '</u>' +
        '<div class="bar" style="height:' + h + '%"></div>' +
        '<i>' + (i + 1) + '</i></div>';
    }).join('');
    var curveHTML = '<p style="margin:0 0 2px;font-size:11.5px;color:rgba(168,159,139,.9)">' +
      '每月 15 日 21:00 的高度（' + esc(ob.name) + '）</p><div class="ad-bars">' + bars + '</div>';

    /* 认识 */
    var knowHTML = '';
    if (rec.plain) knowHTML += '<p>' + esc(rec.plain) + '</p>';
    if (rec.info) knowHTML += '<p>' + esc(rec.info) + '</p>';
    if (!knowHTML) knowHTML = '<p class="ad-empty">暂无更多说明。</p>';

    /* 怎么找 */
    var tip = TIPS[rec.name];
    var findTxt = '';
    if (tip) findTxt += '<p>' + esc(tip) + '</p>';

    /* 用「最佳观测月的 21:00」算方位，而不是此刻 */
    var aaBest = (function () {
      var d = new Date(ob.date.getFullYear(), rec.bestMonth - 1, 15, 21, 0, 0, 0);
      return altAz(rec.ra, rec.dec, lstDeg(d, ob.lon), ob.lat);
    })();
    findTxt += '<p>' +
      esc(rec.bestMonth + ' 月前后是它最合适的时候') + '：那个月晚上九点，它在' + azName(aaBest.az) + '方向，高度约 ' +
      (aaBest.alt > 0 ? aaBest.alt.toFixed(0) + '°' : '还在地平线下（要等到后半夜）') + '。' +
      (maxAlt > 0
        ? '从 ' + esc(ob.name) + ' 看，它最高能升到约 ' + maxAlt.toFixed(0) + '°' +
          (maxAlt < 15 ? '，也就是说始终贴着地平线，要挑正南或东南方开阔的地方。' : '。')
        : '从 ' + esc(ob.name) + ' 所在的纬度看，它全年都在地平线以下，本地看不到。') +
      '</p>';
    if (rec.kind === '星宿') {
      findTxt += '<p>二十八宿沿黄道、赤道一带排开，从角宿起向东依次是：' +
        '角、亢、氐、房、心、尾、箕（东方苍龙），斗、牛、女、虚、危、室、壁（北方玄武），' +
        '奎、娄、胃、昴、毕、觜、参（西方白虎），井、鬼、柳、星、张、翼、轸（南方朱雀）。' +
        '找到相邻的' + (rec.prev ? rec.prev + '宿' : '') + (rec.next ? '或' + rec.next + '宿' : '') + '，就能推出它的位置。' +
        '</p>';
    }

    /* 名字与传说 */
    var culHTML = '';
    if (rec.cul) {
      if (rec.cul.quote) culHTML += '<div class="ad-quote">' + esc(rec.cul.quote) + '</div>';
      if (rec.cul.plain) culHTML += '<p>' + esc(rec.cul.plain) + '</p>';
      if (rec.cul.legend) culHTML += '<p>' + esc(rec.cul.legend) + '</p>';
    } else if (rec.info) {
      culHTML = '<p>' + esc(rec.info) + '</p>';
    } else {
      culHTML = '<p class="ad-empty">暂无收录。</p>';
    }

    /* 亮星表 */
    var starRows = [];
    if (rec.it && rec.it.stars && rec.it.stars.length) {
      rec.it.stars.forEach(function (s) {
        starRows.push([s.n, BEIDOU_BAYER[s.n] || '—', s.mag.toFixed(2)]);
      });
    } else {
      if (rec.ju) starRows.push([rec.ju.name, rec.bayer || '—', (typeof rec.mag === 'number') ? rec.mag.toFixed(2) : '—']);
      else starRows.push([rec.name, rec.bayer || '—', (typeof rec.mag === 'number') ? rec.mag.toFixed(2) : '—']);
      nearBright(rec.name, rec.ra, rec.dec, 15).forEach(function (s) {
        starRows.push([s.n, s.bayer || '—', s.mag.toFixed(2)]);
      });
    }
    var starHTML = '<table><thead><tr><th>恒星</th><th>拜耳名</th><th>视星等</th></tr></thead><tbody>' +
      starRows.map(function (r) {
        return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (starRows.length <= 1
        ? '<p class="ad-empty" style="margin-top:10px">本宿以距星定位，其余多为暗星；完整星官构成见上方「认识」。</p>'
        : '');

    /* 附近深空天体 */
    var dsos = nearDSO(rec.ra, rec.dec, 14);
    var dsoHTML;
    if (dsos.length) {
      dsoHTML = '<div class="ad-dso">' + dsos.slice(0, 8).map(function (o) {
        return '<div><b>' + esc(o.n) + '</b><span>' + esc(o.type) + ' · ' + o.mag.toFixed(1) + ' 等 · 距此 ' +
          o.d.toFixed(1) + '°</span></div>';
      }).join('') + '</div>';
    } else {
      dsoHTML = '<p class="ad-empty">这一带 14° 范围内暂未收录梅西耶天体。</p>';
    }

    /* 上下条 */
    var pager = '<div class="ad-pager">' +
      '<button type="button" ' + (rec.prev ? 'data-ad-prev="' + esc(rec.prev) + '"' : 'disabled') + '>← ' +
        (rec.prev ? esc(rec.prev + (ORDER.indexOf(rec.prev) < 28 ? '宿' : '')) : '已是第一条') + '</button>' +
      '<button type="button" ' + (rec.next ? 'data-ad-next="' + esc(rec.next) + '"' : 'disabled') + '>' +
        (rec.next ? esc(rec.next + (ORDER.indexOf(rec.next) < 28 ? '宿' : '')) : '已是最后一条') + ' →</button>' +
      '</div>';

    var html =
      '<div class="ad-crumb"><a id="adCrumb">观星图鉴</a><i>/</i>' +
        '<span>' + esc(rec.grpName || rec.kind) + '</span><i>/</i><b>' + esc(title) + '</b></div>' +
      '<div class="ad-kicker">' + esc(rec.kind) + (rec.sub ? ' · ' + esc(rec.sub) : '') + '</div>' +
      '<h1>' + esc(title) + (eng ? '<em>' + esc(eng) + '</em>' : '') + '</h1>' +
      '<p class="ad-lead">' + esc(rec.lead) + '</p>' +
      '<div class="ad-btns">' +
        '<button class="ad-btn go" type="button" id="adSky">在星图中查看</button>' +
        '<button class="ad-btn" type="button" id="adFocus">居中并跟随</button>' +
      '</div>' +
      '<div class="ad-cols">' +
        '<figure class="ad-fig"><canvas id="adCanvas"></canvas>' +
          '<figcaption>' + esc(title) + '及邻近二十八宿的相对位置；圆点大小只做示意，坐标为真实赤经赤纬。</figcaption>' +
        '</figure>' +
        '<aside class="ad-basic"><h3>基本信息</h3>' + basicHTML + '</aside>' +
      '</div>' +
      sec('今晚位置', posHTML + curveHTML) +
      sec('认识' + esc(title), knowHTML) +
      sec('怎么找', findTxt) +
      sec('名字与传说', culHTML) +
      sec('亮星', starHTML) +
      sec('附近深空天体', dsoHTML) +
      pager;

    $('adWrap').innerHTML = html;

    canvasEl = $('adCanvas');
    drawChart(canvasEl, rec);
    $('adScroll').scrollTop = 0;

    /* 交互 */
    $('adCrumb').addEventListener('click', function () {
      close();
      if (window.__pageApp) window.__pageApp.go('atlas');
    });
    $('adSky').addEventListener('click', function () { goSky(rec.name); });
    $('adFocus').addEventListener('click', function () { goSky(rec.name, true); });
    Array.prototype.forEach.call($('adWrap').querySelectorAll('[data-ad-prev],[data-ad-next]'), function (b) {
      b.addEventListener('click', function () {
        render(b.getAttribute('data-ad-prev') || b.getAttribute('data-ad-next'));
      });
    });

    return true;
  }

  function goSky(name, center) {
    close();
    try {
      if (window.__pageApp) window.__pageApp.go('star');
      if (center && window.__focusStar) window.__focusStar(name);
      else if (window.__highlightByName) window.__highlightByName(name);
    } catch (e) { /* 静默 */ }
  }

  function open(name) {
    if (!render(name)) {
      if (window.__toast) window.__toast('这条还没有详情页');
      return;
    }
    root.classList.add('on');
    if (STANDALONE) { if (window.__AtlasApp) window.__AtlasApp.refresh(); return; }
    document.body.classList.add('page-off');
    try {
      var h = (location.hash || '').replace(/^#/, '');
      var parts = h.split('&').filter(function (kv) { return kv && kv.split('=')[0] !== 'a'; });
      parts.push('a=' + encodeURIComponent(name));
      location.hash = '#' + parts.join('&');
    } catch (e) { /* 静默 */ }
  }

  function close() {
    if (!root) return;
    root.classList.remove('on');
    if (STANDALONE) { if (window.__AtlasApp) window.__AtlasApp.refresh(); return; }
    try {
      var h = (location.hash || '').replace(/^#/, '');
      var parts = h.split('&').filter(function (kv) { return kv && kv.split('=')[0] !== 'a'; });
      location.hash = parts.length ? ('#' + parts.join('&')) : '';
    } catch (e) { /* 静默 */ }
    if (window.__AtlasApp) window.__AtlasApp.refresh();
  }

  function isOpen() { return !!(root && root.classList.contains('on')); }

  window.__AtlasDetail = { open: open, close: close, isOpen: isOpen, _build: buildRecord };

  /* 深链接：#c=atlas&a=角 自动打开对应详情页 */
  function openFromHash() {
    if (STANDALONE) return;
    var h = location.hash || '';
    var m = /[?&]?a=([^&]+)/.exec(h);
    if (!/c=atlas/.test(h) || !m) {
      /* 后退键去掉了 a=：收起详情页，但保留图鉴页 */
      if (isOpen()) {
        root.classList.remove('on');
        if (!/c=atlas/.test(h)) document.body.classList.remove('page-off');
      }
      return;
    }
    var n = decodeURIComponent(m[1]);
    if (isOpen() && current && current.name === n) return;
    if (!render(n)) return;
    root.classList.add('on');
    document.body.classList.add('page-off');
  }
  window.addEventListener('hashchange', openFromHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(openFromHash, 260); });
  } else {
    setTimeout(openFromHash, 260);
  }
})();
