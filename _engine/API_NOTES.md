# Stellarium Web Engine 接入笔记（本项目实测所得）

## 加载（关键坑）
- 引擎是裸 Emscripten 模块：`StelWebEngine({ wasmBinary, locateFile, canvas }) -> Promise<Module>`
- **必须传 `wasmBinary`（自己 fetch 的 ArrayBuffer）**，否则它会走 `findWasmBinary`
- 本地引擎文件已打补丁：`if(!scriptDirectory)scriptDirectory="";`
  （延迟实例化时 `document.currentScript` 为 null，原版会抛 `Cannot read properties of undefined (reading 'startsWith')`）
- `wasmBinary` 之外仍需 `locateFile`，用于其他资源路径

## Module 上的可用对象/函数
- `M.observer`: `longitude/latitude/elevation`（弧度/米）、`utc`（Date）、`yaw/pitch/roll`（弧度）、`azalt/space`
- `M.core`: `fov`（弧度）、`projection`、`selection`、`lock`、`clicks`、`zoom`、`exposure_scale`、`star_linear_scale`、`layers`
- 函数：`lookAt, pointAndLock, zoomTo, MJD2date, date2MJD, convertFrame, otypeToStr, on, change, getObj, getTree, createLayer, createObj, c2s, s2c`
- `M.canvas` / `M.ctx` 为 WebGL 上下文

## 已验证可用的操作
- 设置观测者：`observer.longitude = lon*π/180; observer.latitude = lat*π/180; observer.elevation = m`
- 设置时间：`observer.utc = new Date()`
- 设置视角：`observer.yaw = yaw*π/180; observer.pitch = pitch*π/180; core.fov = fov*π/180`
- 引擎自渲染（无需我们写渲染循环），canvas 会持续出图

## 待办（下一轮）
- 图层开关映射（连线/插画/大气/地景/深空/银河/卫星/网格/照片）：需枚举 `core.layers` 或 `M.createLayer`
- 点选：`core.clicks` 队列 + 读 `core.selection`（`name_translated_` / `designation_` 用 `c2s` 转字符串）
- 主页面挂载：进入「地平线观星」时用 SkyView 替换自研穹顶 canvas，失败回退

## 第二轮实测补充（图层 / 时间 / 点选）

### 时间写入（关键）
- `M.observer.utc` 是访问器，**读到的是 MJD 数值**；写入必须用数值：`M.observer.utc = M.date2MJD(date)`（直接给 Date 无效）
- 视角：`observer.yaw/pitch`（弧度）、`core.fov`（弧度）
- 验证：夜晚 22:00 画面上半屏均亮 ≈34/255（深蓝夜空），最亮像素 232–255（星点）

### 图层对象（与参考站九开关一一对应）
- 连线 `core.constellations.lines_visible`
- 插画 `core.constellations.images_visible`
- 大气 `core.atmosphere.visible`（关闭后整屏亮度 40.4 → 2.5）
- 地景 `core.landscapes.visible`（雾 `fog_visible`）
- 深空 `core.dsos.visible`
- 银河 `core.milkyway.visible`
- 卫星 `core.satellites.visible`
- 网格 `core.lines.azimuthal/equatorial/meridian/ecliptic`（逐项写，任一成功即可）
- 照片 `core.dss.visible`
- 其它：`stars / planets / labels / cardinals / constellations.bounds_visible`

### 点选（未解决）
- `core.clicks` 是 **number**（不是队列），`core.on_click` 是 **string**，`core.selection` 始终 null
- `M.on('click'|'selection'|'change')` 能订阅但真实点击后不触发
- 合成 CDP 点击与 `clicks` 赋值均未能让引擎产生 selection
- 下一步方向：① 读引擎 JS 里 `clicks` 的用法（是否为 embind vector 的 `.size()`）；② 试 `core.pointer`；③ 兜底方案：用 `M.getObj` + 屏幕投影自建拾取

## 第三轮实测补充（引擎 C 接口 / 时间条）

### 引擎导出的 core 层函数（wasm）
`_core_init / _core_update / _core_render / _core_on_mouse / _core_on_key / _core_on_pinch /
 _core_on_zoom / _core_lookat / _core_point_and_lock / _core_zoomto / _core_search /
 _core_set_time / _core_add_font / _core_get_module`

### 点选（仍未通）
- canvas 上真实 mousedown 能到达（自建监听可计数），引擎自己的 canvas.js 鼠标胶水也在包里
- 但 `_core_on_mouse(0,1,x,y,1)` + `(0,0,x,y,0)` 之后 `core.selection` 仍为 null
- `M.on('click', cb)` 实际是把回调指针写进 `core.on_click`（读出来是 `0x0`），全网格点击后回调计数为 0
- `_core_search("moon")` / `("jupiter")` 返回 `0`（空指针），说明这版 search 的签名不是单字符串
- **结论**：这版引擎的快照里没有可用的屏幕拾取入口 → 点选改为「自建投影拾取」：
  用 `observer.yaw/pitch/fov` + 我们的 RA/Dec 星表自行投影到屏幕做命中检测，
  命中后弹我们自己的中文资料卡（引擎只负责渲染）

### 时间控制（已实现）
- `observer.utc = M.date2MJD(date)` 是可靠写法（`_core_set_time` 语义不同，会把 utc 变成小数分数日）
- 引擎模式新增顶部时间条：时刻 / 时节 / 此刻 → 实测标签 22:00 → 12:00 生效、utc 随之变化、无报错
- `domeTimeBar` 在进入引擎模式时显示、退出时隐藏
