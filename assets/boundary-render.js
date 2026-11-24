/* 行政边界线渲染（洲 / 国 / 中国省市县）
 * 由主页面每帧调用 window.__updateBoundaries(now)。
 * 思路：把经纬点投到球面，再逐点投影到屏幕画折线；按球背面剔除。
 * 好处：线宽固定像素，放到区县级别依旧清晰；配色可随层级区分。 */
(function(){
"use strict";

var API = window.BOUNDARY_RENDER_API;
var DATA = window.BOUNDARY_DATA;
var canvas = document.getElementById('boundaryLayer');
if(!API || !DATA || !canvas || !window.THREE) return;

var ctx = canvas.getContext('2d');
var camera = API.camera;
var earthGroup = API.earthGroup;
var EARTH_R = API.earthRadius;
var toggleEl = API.toggleEl;
var B_R = EARTH_R + 0.0016;   // 与近景瓦片贴片同高，边界线和影像在中心区对齐

var W = 0, H = 0, DPR = 1;
var levels = null;
var drawn = false;
var lastAt = 0, lastRot = 1e9, lastOps = '';
var lastDrawMs = 0, lastFast = false;
var lastCam = new THREE.Vector3(1e9, 0, 0);
var mvp = new THREE.Matrix4();
var earthM = new THREE.Matrix4();

/* 图层可见性开关：拉远/关闭时不仅清画布，还把整层透明掉。
   画布被 clearRect 之后，合成器偶尔仍保留旧帧（缩到近景再拉远时，
   整屏会残留上一帧的省界绿线），用 opacity 变化强制重绘一帧最稳妥。 */
var layerVisible = false;
function setLayerVisible(v){
  if(v === layerVisible) return;
  layerVisible = v;
  canvas.style.opacity = v ? '1' : '0';
}
canvas.style.opacity = '0';

function lonLatVec(lon, lat){
  var phi = (lon + 180) / 360 * Math.PI * 2;
  var theta = (90 - lat) * Math.PI / 180;
  var st = Math.sin(theta);
  return [-Math.cos(phi) * st, Math.cos(theta), Math.sin(phi) * st];
}

/* 每条环预计算：单位球坐标数组 + 整圈包围圆（用于快速剔除背面整圈） */
function prepRings(rings){
  var out = [];
  if(!rings) return out;
  for(var i = 0; i < rings.length; i++){
    var flat = rings[i];
    var n = flat.length >> 1;
    if(n < 4) continue;
    var vec = new Float32Array(n * 3);
    var ax = 0, ay = 0, az = 0;
    for(var j = 0; j < n; j++){
      var v = lonLatVec(flat[j * 2], flat[j * 2 + 1]);
      vec[j * 3] = v[0]; vec[j * 3 + 1] = v[1]; vec[j * 3 + 2] = v[2];
      ax += v[0]; ay += v[1]; az += v[2];
    }
    var al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= al; ay /= al; az /= al;
    var minD = 1;
    for(var k = 0; k < n; k++){
      var d = vec[k * 3] * ax + vec[k * 3 + 1] * ay + vec[k * 3 + 2] * az;
      if(d < minD) minD = d;
    }
    out.push({ v: vec, n: n, cx: ax, cy: ay, cz: az, cosR: Math.max(-1, minD) });
  }
  return out;
}

function init(){
  if(levels) return;
  var provRings = [], list = DATA.provinces || [];
  for(var i = 0; i < list.length; i++){
    var rr = list[i].r || [];
    for(var j = 0; j < rr.length; j++) provRings.push(rr[j]);
  }
  levels = {
    continents: prepRings(DATA.continents),
    countries: prepRings(DATA.countries),
    provinces: prepRings(provRings),
    cities: prepRings(DATA.cities),
    districts: prepRings(DATA.districts)
  };
}

function resize(){
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawn = false;
}
window.addEventListener('resize', resize);

/* 线型：暗底 → 柔光 → 亮芯，昼面/夜面都能看清；省以下用细虚线降低压迫感。
   线宽整体加粗一档（原 1.0/1.05/0.85px 在放大到省界/市界层级时毛糙断续），
   并用更高 alpha 让连续线段更扎实、无碎段感。 */
var STYLE = {
  continents: { color: 'rgba(150,190,240,0.76)', width: 1.35, glow: 'rgba(120,170,240,0.22)', glowW: 6.2,
                under: 'rgba(4,8,18,0.30)', underW: 2.8 },
  countries:  { color: 'rgba(224,192,146,0.78)', width: 1.20, glow: 'rgba(201,162,92,0.20)', glowW: 5.4,
                under: 'rgba(4,8,18,0.34)', underW: 2.6 },
  provinces:  { color: 'rgba(158,204,184,0.80)', width: 1.40, glow: 'rgba(110,190,160,0.22)', glowW: 5.6,
                under: 'rgba(4,8,18,0.30)', underW: 2.4 },
  cities:     { color: 'rgba(240,228,202,0.82)', width: 1.45, glow: 'rgba(210,200,170,0.22)', glowW: 5.2,
                under: 'rgba(4,8,18,0.36)', underW: 2.5 },
  districts:  { color: 'rgba(243,217,164,0.62)', width: 1.20, glow: 'rgba(232,201,126,0.18)', glowW: 4.4,
                under: 'rgba(4,8,18,0.24)', underW: 2.1, dash: [3, 3] }
};

function strokeLevel(list, alpha, st, fast){
  if(alpha < 0.02 || !list || !list.length) return;
  var me = mvp.elements;
  var m = earthM.elements;
  var cam = camera.position;
  var d = cam.length();
  var camX = cam.x / d, camY = cam.y / d, camZ = cam.z / d;
  var visCos = B_R / d;
  var horizon = Math.acos(Math.min(1, B_R / d));
  var margin = 1600;   // 视口外剔除边距：原来 420 太小，长省界线跨出视口即断裂，产生“撕裂感”；加大后跨屏长线保持连续
  var pxPerRad = (H * 0.5) / Math.tan(camera.fov * Math.PI / 360) / Math.max(0.05, d - B_R);
  var any = false;

  ctx.beginPath();
  for(var ri = 0; ri < list.length; ri++){
    var ring = list[ri];
    var ang = Math.acos(Math.max(-1, Math.min(1, ring.cosR)));
    if(ang + horizon < Math.PI - 0.02){
      var lim = Math.cos(Math.min(Math.PI, ang + horizon + 0.02));
      /* 环心存的是地球局部坐标，必须先用 earthM 转到世界坐标，再和世界相机方向比较。
         原实现直接点乘，地球自转后整圈会被误判为背面；放大到近景阈值收紧时，
         日本/韩国一带的国界会被整层剔除（画布像素 5634 → 0）。 */
      var rcx = m[0] * ring.cx + m[4] * ring.cy + m[8] * ring.cz;
      var rcy = m[1] * ring.cx + m[5] * ring.cy + m[9] * ring.cz;
      var rcz = m[2] * ring.cx + m[6] * ring.cy + m[10] * ring.cz;
      if(rcx * camX + rcy * camY + rcz * camZ < lim) continue;
    }
    // 视口整圈剔除：环心投影后，用角半径估一个保守像素半径；不在屏幕附近的整圈直接跳过
    if(ang < 2.4){
      var bx = ring.cx * B_R, by = ring.cy * B_R, bz = ring.cz * B_R;
      var bcw = me[3] * bx + me[7] * by + me[11] * bz + me[15];
      if(bcw <= 0.00001){
        if(ang < 1.0) continue;          // 小环整圈在相机背后
      } else {
        var bpx = (me[0] * bx + me[4] * by + me[8] * bz + me[12]) / bcw;
        var bpy = (me[1] * bx + me[5] * by + me[9] * bz + me[13]) / bcw;
        var bsx = (bpx * 0.5 + 0.5) * W;
        var bsy = (-bpy * 0.5 + 0.5) * H;
        var radPx = B_R * Math.sin(Math.min(ang, 1.4)) * pxPerRad + 32;
        if(bsx < -radPx || bsx > W + radPx || bsy < -radPx || bsy > H + radPx) continue;
      }
    }
    var vec = ring.v, n = ring.n, started = false;
    for(var i = 0; i < n; i++){
      var vx = vec[i * 3], vy = vec[i * 3 + 1], vz = vec[i * 3 + 2];
      // 先用“点在球正面”剔除，再做矩阵投影
      var wx = m[0] * vx + m[4] * vy + m[8] * vz;
      var wy = m[1] * vx + m[5] * vy + m[9] * vz;
      var wz = m[2] * vx + m[6] * vy + m[10] * vz;
      if(wx * camX + wy * camY + wz * camZ < visCos){ started = false; continue; }

      var x = vx * B_R, y = vy * B_R, z = vz * B_R;
      var cw = me[3] * x + me[7] * y + me[11] * z + me[15];
      if(cw < 0.00001){ started = false; continue; }
      var px = (me[0] * x + me[4] * y + me[8] * z + me[12]) / cw;
      var py = (me[1] * x + me[5] * y + me[9] * z + me[13]) / cw;
      var sx = (px * 0.5 + 0.5) * W;
      var sy = (-py * 0.5 + 0.5) * H;
      if(sx < -margin || sx > W + margin || sy < -margin || sy > H + margin){
        started = false; continue;
      }
      if(!started){ ctx.moveTo(sx, sy); started = true; any = true; }
      else ctx.lineTo(sx, sy);
    }
  }
  if(!any) return;

  ctx.lineJoin = fast ? 'bevel' : 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  if(!fast){                               // 交互中省掉暗底与柔光，只画亮芯，减轻描边负担
    ctx.strokeStyle = st.under;
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = st.underW;
    ctx.stroke();
    ctx.strokeStyle = st.glow;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = st.glowW;
    ctx.stroke();
  }
  ctx.strokeStyle = st.color;
  ctx.globalAlpha = fast ? Math.min(1, alpha * 1.15) : alpha;
  ctx.lineWidth = st.width;
  if(st.dash && !fast) ctx.setLineDash(st.dash);   // 交互中改实线：虚线描边在长折线上很贵
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function update(now){
  var on = !toggleEl || toggleEl.checked;
  var d = camera.position.length();
  if(!on || d > 7.4){
    if(drawn){ ctx.clearRect(0, 0, W, H); drawn = false; }
    setLayerVisible(false);
    return;
  }
  if(!levels) init();
  if(!levels) return;

  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  earthGroup.updateMatrixWorld();
  var china = API.inChina();

  // 与地名层同步的五级递进：洲 → 国 → 省 → 地级市 → 区县
  var con = Math.max(0, Math.min(1, (7.4 - d) / 1.1)) * Math.max(0, Math.min(1, (d - 4.55) / 0.75));
  var ctry = Math.max(0, Math.min(1, (5.7 - d) / 0.95));
  var prov = china ? Math.max(0, Math.min(1, (4.5 - d) / 0.55)) : 0;
  var city = china ? Math.max(0, Math.min(1, (3.8 - d) / 0.5)) : 0;
  var distr = china ? Math.max(0, Math.min(1, (3.05 - d) / 0.4)) : 0;
  /* 贴到区域/城市级时，1:50m 边界数据本身已经比影像粗（折线每隔十几公里才有一个顶点），
     再画满亮度的金色线会盖过地表纹理。按距离淡一档，让边界退成"参考线"。 */
  var closeT = Math.max(0, Math.min(1, (3.10 - d) / 0.60));
  con *= (1 - 0.12 * closeT);
  ctry *= (1 - 0.30 * closeT);
  prov *= (1 - 0.20 * closeT);
  var ops = [con, ctry, prov, city, distr].map(function(x){ return x.toFixed(2); }).join(',');

  // 拖拽旋转时保持 30fps，让边界紧跟球面；滚轮缩放时降到 ~16fps，省下重绘开销
  var busy = API.orbitBusy ? API.orbitBusy() : false;
  var rotating = API.orbitRotating ? API.orbitRotating() : false;
  var fast = busy;
  var gap = rotating ? 33 : (busy ? 60 : 40);
  var moved = lastCam.distanceToSquared(camera.position) > 1e-8 ||
              Math.abs(earthGroup.rotation.y - lastRot) > 1e-5;
  // 交互结束后强制补一帧完整描边，避免画面停在上一步的“单线快速模式”里
  if(now - lastAt < gap || (!moved && ops === lastOps && !(lastFast && !fast))) return;
  lastAt = now;
  lastCam.copy(camera.position);
  lastRot = earthGroup.rotation.y;
  lastOps = ops;
  lastFast = fast;

  earthM.copy(earthGroup.matrixWorld);
  mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(earthM);

  var t0 = performance.now();
  ctx.clearRect(0, 0, W, H);
  var anyLevel = (con * 0.75 > 0.02) || (ctry * 0.85 > 0.02) || (prov > 0.02);
  drawn = anyLevel;
  if(anyLevel){
    strokeLevel(levels.continents, con * 0.75, STYLE.continents, fast);
    strokeLevel(levels.countries, ctry * 0.85, STYLE.countries, fast);
    if(prov > 0.02) strokeLevel(levels.provinces, prov, STYLE.provinces, fast);
  }
  setLayerVisible(anyLevel);
  // 按需求只保留洲界/国界/省界：地级市界与区县界不再绘制（地名标签仍由主页面管理）
  lastDrawMs = performance.now() - t0;
}

window.__updateBoundaries = update;
window.__boundaryState = function(){
  return {
    ready: !!levels,
    rings: levels ? {
      continents: levels.continents.length,
      countries: levels.countries.length,
      provinces: levels.provinces.length,
      cities: levels.cities.length,
      districts: levels.districts.length
    } : null,
    drawn: drawn,
    ms: Math.round(lastDrawMs * 10) / 10,
    fast: lastFast
  };
};

resize();
// 开场动画期间先把 14 万个经纬点预处理掉，避免进场后再卡一下
setTimeout(init, 900);
})();
