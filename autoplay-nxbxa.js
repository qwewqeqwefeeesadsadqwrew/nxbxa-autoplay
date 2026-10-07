/* ============================================================
   《nxbxa 拖图游戏》自动玩 · 7 关随机顺序 · 无限循环（页内版 v1.0）
   ------------------------------------------------------------
   打开页面即自动开跑：
     每轮把 7 关（床下有人/楼梯之下/不要出声/无限流BOSS/凶手不是我/
     笼中之物/人为刀俎）Fisher-Yates 洗牌 → 按随机顺序一关一关打
     → 每关：回列表 → 点关卡卡片 → （微恐关自动点"同意"）→ 进关自动玩
     → 通关弹窗停 2.5~3.8s → 返回主页 → 停 1.3~2.4s → 下一关
     → 7 关打完重新洗牌，无限循环。

   打法口径（与录制/回归版一致）：
     · 不点「提示」（配对关系从游戏状态直读，画面不穿帮）
     · 「加步数」口径 B：开局不点，只有真失误 errNum ≤ 2 才自动补一次
     · 落点两档：106/112 = 大图正中心；其余 5 关 = 用户复录校准的偏下位置
     · 下排横滑找卡 → 上提 6×26px 拿起 → 举着等大图翻页 → 两拍稳定对齐 → 松手

   事件注入：页内合成 MouseEvent（引擎的鼠标通道，与真人鼠标同一套处理链）；
   UI 点击（关卡卡片/微恐同意/成功返回）优先合成点击，失败回退直接调游戏接口。
   ============================================================ */
(function () {
  var W = window;
  if (W.__NXBX && W.__NXBX.stop) {
    // 已经在跑：忽略这次重复注入，绝不打断正在跑的实例
    if (W.__NXBX.running !== false) {
      try {
        W.__NXBX.logAdd && W.__NXBX.logAdd("脚本被重复注入：忽略本次，保留正在跑的实例", true);
      } catch (e) {}
      return;
    }
    try {
      W.__NXBX.stop();
    } catch (e) {}
  }
  var AP = (W.__NXBX = {
    version: "1.0",
    t0: Date.now(),
    running: true,
    log: [],
    state: { round: 0, order: [], cur: null, done: 0, lastResult: null },
  });

  function log(msg, loud) {
    var s = ((Date.now() - AP.t0) / 1000).toFixed(1) + "s " + msg;
    AP.log.push(s);
    if (AP.log.length > 2000) AP.log.splice(0, 1000);
    if (loud) {
      try {
        console.log("[自动玩] " + s);
      } catch (e) {}
    }
  }
  AP.logAdd = log;
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function G() {
    try {
      return W.__require("G");
    } catch (e) {
      return null;
    }
  }
  function now() {
    return Date.now();
  }

  // ---------- 合成输入 ----------
  // 电脑浏览器：走鼠标通道；手机浏览器（引擎判定 isMobile 时压根不注册鼠标监听）：
  // 同样的动作换成触摸事件发出去，游戏才认。
  var TOUCH_MODE = null;
  function isTouchMode() {
    if (TOUCH_MODE === null) {
      try {
        TOUCH_MODE = !!(window.cc && cc.sys && cc.sys.isMobile);
      } catch (e) {
        TOUCH_MODE = false;
      }
    }
    return TOUCH_MODE;
  }
  function makeTouch(cv, x, y, id) {
    var o = {
      identifier: id,
      target: cv,
      clientX: Math.round(x),
      clientY: Math.round(y),
      pageX: Math.round(x),
      pageY: Math.round(y),
      screenX: Math.round(x),
      screenY: Math.round(y),
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 0,
      force: 1,
    };
    try {
      return new Touch(o);
    } catch (e) {
      return o;
    }
  }
  function fireTouch(cv, type, x, y) {
    var name =
      type === "mousedown" ? "touchstart" : type === "mouseup" ? "touchend" : type === "mousemove" ? "touchmove" : null;
    if (!name) return;
    var t = makeTouch(cv, x, y, 1);
    var list = name === "touchend" ? [] : [t];
    var ev = null;
    try {
      ev = new TouchEvent(name, {
        bubbles: true,
        cancelable: true,
        view: window,
        touches: list,
        targetTouches: list,
        changedTouches: [t],
      });
    } catch (e) {
      // 老浏览器没有 TouchEvent 构造器：用 CustomEvent 补上触摸数组
      ev = new CustomEvent(name, { bubbles: true, cancelable: true });
      ev.touches = list;
      ev.targetTouches = list;
      ev.changedTouches = [t];
    }
    cv.dispatchEvent(ev);
  }
  function fire(type, x, y, buttons) {
    var cv = document.getElementById("GameCanvas");
    if (!cv) return;
    if (isTouchMode()) {
      fireTouch(cv, type, x, y);
      return;
    }
    cv.dispatchEvent(
      new MouseEvent(type, {
        clientX: Math.round(x),
        clientY: Math.round(y),
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: buttons,
      })
    );
  }
  function fireMove(x, y) {
    fire("mousemove", x, y, 0);
  }
  async function fireClick(x, y) {
    fire("mousemove", x, y, 0);
    await sleep(90);
    fire("mousedown", x, y, 1);
    await sleep(70);
    fire("mousemove", x + 1, y + 1, 1);
    await sleep(50);
    fire("mouseup", x + 1, y + 1, 0);
  }

  // ---------- 视口换算 ----------
  function viewCtx() {
    var cv = document.getElementById("GameCanvas");
    var r = cv.getBoundingClientRect();
    var vs = cc.view.getVisibleSize();
    var sc = Math.min(r.width / vs.width, r.height / vs.height);
    var ox = (r.width - vs.width * sc) / 2;
    var oy = (r.height - vs.height * sc) / 2;
    return { r: r, vs: vs, sc: sc, ox: ox, oy: oy };
  }
  function cssOf(n) {
    var v = viewCtx();
    var w = n.convertToWorldSpaceAR(cc.v2(0, 0));
    return [Math.round(v.r.left + v.ox + w.x * v.sc), Math.round(v.r.top + v.oy + (v.vs.height - w.y) * v.sc)];
  }
  function walk(root, fn) {
    if (!root) return;
    fn(root);
    var cs = root.children || [];
    for (var i = 0; i < cs.length; i++) walk(cs[i], fn);
  }
  function findIn(root, fn) {
    var hit = null;
    walk(root, function (n) {
      if (!hit && fn(n)) hit = n;
    });
    return hit;
  }
  function findByName(root, name) {
    return findIn(root, function (n) {
      return n.name === name && n.activeInHierarchy;
    });
  }

  // ---------- 状态读取（同回归版 v7） ----------
  function READ() {
    var g = G();
    var s = g && g.game;
    if (!s || !s.paiNode) return { err: "no-game", stage: g ? g.curStageId : null };
    var v = viewCtx();
    var r = v.r;
    var vs = v.vs;
    var sc = v.sc;
    var ox = v.ox;
    var oy = v.oy;
    var C = function (wx, wy) {
      return [Math.round(r.left + ox + wx * sc), Math.round(r.top + oy + (vs.height - wy) * sc)];
    };
    var boxC = function (n) {
      var b = n.getBoundingBoxToWorld();
      return {
        css: C(b.x + b.width / 2, b.y + b.height / 2),
        top: Math.round(r.top + oy + (vs.height - (b.y + b.height)) * sc),
        w: Math.round(b.width * sc),
        h: Math.round(b.height * sc),
      };
    };
    var pages = s.pageView.getPages();
    var pagesInfo = pages.map(function (p, i) {
      var it = p.children.filter(function (c) {
        return /^item\d+$/.test(c.name);
      })[0] || null;
      var b = it ? boxC(it) : null;
      var pb = boxC(p);
      return {
        i: i,
        name: it ? it.name : null,
        active: it ? it.active : false,
        css: b ? b.css : null,
        yTop: b ? b.top : null,
        w: b ? b.w : 0,
        h: b ? b.h : 0,
        pcss: pb ? pb.css : null,
        pw: pb ? pb.w : 0,
      };
    });
    var cards = [];
    for (var hi = 0; hi < s.paiNode.children.length; hi++) {
      var h = s.paiNode.children[hi];
      var it2 = h.children[0];
      var isItem = it2 && /^item\d+$/.test(it2.name);
      var b2 = isItem ? boxC(it2) : null;
      cards.push({ item: isItem ? it2.name : null, active: isItem ? it2.active : false, css: b2 ? b2.css : null, w: b2 ? b2.w : 0 });
    }
    var btns = {};
    var pn = s.node.parent;
    ["btn_jiabushu", "btn_tishi"].forEach(function (nm) {
      var b = pn.getChildByName(nm);
      if (b) {
        var w = b.convertToWorldSpaceAR(cc.v2(0, 0));
        btns[nm] = { active: b.active, css: C(w.x, w.y) };
      } else btns[nm] = null;
    });
    var pvCur = -1;
    var pvScrolling = null;
    try {
      pvCur = s.pageView.getCurrentPageIndex();
    } catch (e) {}
    try {
      pvScrolling = s.pageView.isScrolling ? s.pageView.isScrolling() : null;
    } catch (e) {}
    var idx = pvCur >= 0 && pvCur < pages.length ? pvCur : s.pageViewIndex;
    var cur = pagesInfo[idx] || null;
    var colRef = cur && cur.pcss && cur.pw > 50 ? cur : null;
    if (!colRef)
      colRef =
        pagesInfo.filter(function (pg) {
          return pg.pcss && pg.pw > 50;
        })[0] || null;
    var col = colRef ? [colRef.pcss[0] - Math.round(colRef.pw / 2), colRef.pcss[0] + Math.round(colRef.pw / 2)] : null;
    if (!col || col[1] - col[0] < 200) col = [438, 846];
    return {
      stage: g.curStageId,
      n: s.winArr.length,
      pageIndex: idx,
      pvCur: pvCur,
      pvScrolling: pvScrolling,
      matched: s.winArr.reduce(function (a, b) {
        return a + b;
      }, 0),
      errNum: s.errNum,
      time: s.time,
      pages: pagesInfo,
      cards: cards,
      btns: btns,
      col: col,
    };
  }

  // ---------- 列表页：扫弹窗 ----------
  function sweepListPopups() {
    var g = G();
    if (!g || !g.allnode || !g.allnode.selnode) return [];
    var sn = g.allnode.selnode;
    var acts = [];
    // 签到
    var signNode = findIn(sn, function (n) {
      return n.name === "sign" && n.activeInHierarchy;
    });
    if (signNode) {
      try {
        var sc = signNode.getComponent("Sign");
        if (sc && sc.btnClose) {
          sc.btnClose();
          acts.push("sign");
        }
      } catch (e) {}
    }
    var bg = sn.getChildByName("selstagebg");
    if (bg) {
      var comp = bg.getComponent("selstage");
      // 推荐关广告
      var gg = bg.getChildByName("ggnode");
      if (gg && gg.active && comp && comp.closegg) {
        comp.closegg();
        acts.push("gg");
      }
      // 限时奖励
      var cl = bg.getChildByName("cl");
      if (cl && cl.active && comp && comp.closeclpanel) {
        comp.closeclpanel();
        acts.push("cl");
      }
      // 侧边栏
      var ce = bg.getChildByName("cebianlanbtn");
      if (ce && ce.active && comp && comp.onccebian) {
        // 侧边栏会有全屏黑罩：直接调关闭入口
        try {
          comp.node.getChildByName("zb") && comp.node.getChildByName("zb").active && comp.onccebian({ target: ce });
          acts.push("cebian");
        } catch (e) {}
      }
    }
    // 侧边栏浮层（挂在 selnode 下的 login/cebianlan 预制体）
    var ceNode = findIn(sn, function (n) {
      return n.name === "cebianlan" && n.activeInHierarchy;
    });
    if (ceNode) {
      try {
        var cec = ceNode.getComponent("cebianlan");
        if (cec && typeof cec.close === "function") {
          cec.close();
          acts.push("cebianlan.close");
        }
      } catch (e) {}
    }
    // 解锁推广面板（列表页会自己弹出来，正好挡住中间的卡）
    var unl = sn.getChildByName("unlock");
    if (unl && unl.active) {
      try {
        var uc = unl.getComponent("unlock");
        if (uc && uc.oncclose) {
          uc.oncclose({ target: unl.getChildByName("close") });
          acts.push("unlock");
        }
      } catch (e) {}
    }
    return acts;
  }

  // ---------- 列表页：进关卡 ----------
  async function waitOnList(maxMs) {
    var t0 = now();
    while (now() - t0 < maxMs) {
      var g = G();
      if (g && g.curStageId === -1 && g.allnode.selnode && g.allnode.selnode.active && !(g.allnode.gamenode && g.allnode.gamenode.active)) {
        var bg = g.allnode.selnode.getChildByName("selstagebg");
        if (bg) return true;
      }
      await sleep(400);
    }
    return false;
  }
  async function ensureOnList() {
    var g = G();
    if (!g) return false;
    var already = await waitOnList(200);
    if (already) return true;
    log("不在列表，回列表（backToHall）");
    try {
      g.backToHall();
    } catch (e) {
      log("backToHall 出错 " + e.message);
    }
    return await waitOnList(15000);
  }
  function listCtx() {
    var g = G();
    if (!g || !g.allnode || !g.allnode.selnode) return null;
    var bg = g.allnode.selnode.getChildByName("selstagebg");
    if (!bg) return null;
    var comp = bg.getComponent("selstage");
    return { g: g, sn: g.allnode.selnode, bg: bg, comp: comp };
  }
  function findStageItem(id) {
    var c = listCtx();
    if (!c) return null;
    var hit = null;
    walk(c.sn, function (n) {
      if (!hit && n.name === "stageItem" && n.activeInHierarchy && n.ttag === id) hit = n;
      return;
    });
    return hit;
  }
  function pageIndexInList() {
    var c = listCtx();
    if (!c || !c.comp || !c.comp.pv) return 0;
    try {
      return c.comp.pv.getCurrentPageIndex();
    } catch (e) {
      return 0;
    }
  }
  // 这张卡在第几个 page（按外层的 content 数）
  function pageIndexOfItem(item) {
    var c = listCtx();
    if (!c || !c.comp || !c.comp.pv || !c.comp.pv.content) return -1;
    var content = c.comp.pv.content;
    var n = item;
    while (n && n.parent && n.parent !== content) n = n.parent;
    if (!n || n.parent !== content) return -1;
    return content.children.indexOf(n);
  }
  // 每页 6 张竖排、窗口只露 4 张：卡在折下面时，真人会先把列表往上滑一下
  function scrollViewOf(node) {
    var n = node;
    while (n) {
      var s = n.getComponent && n.getComponent(cc.ScrollView);
      if (s) return s;
      n = n.parent;
    }
    return null;
  }
  async function flipListPage(toIdx) {
    var c = listCtx();
    if (!c || !c.comp || !c.comp.pv) return false;
    var cur = pageIndexInList();
    if (cur === toIdx) return true;
    var dirData = toIdx > cur ? "2" : "1"; // 2=下一页 1=上一页
    // 优先点页面上的翻页箭头（fanye 按钮）
    var arrows = [];
    walk(c.bg, function (n) {
      if (n.name === "fanye" && n.activeInHierarchy) arrows.push(n);
    });
    if (arrows.length >= 2 && c.comp && typeof c.comp.oncturnpage === "function") {
      for (var pass = 0; pass < Math.abs(toIdx - cur); pass++) {
        var before = pageIndexInList();
        var btn = toIdx > before ? arrows[arrows.length - 1] : arrows[0];
        var pt = cssOf(btn);
        await fireClick(pt[0], pt[1]);
        await sleep(900);
        if (pageIndexInList() === before) {
          try {
            c.comp.oncturnpage({ target: btn }, toIdx > before ? "2" : "1");
          } catch (e) {
            log("翻页失败 " + e.message);
            return false;
          }
          await sleep(900);
        }
      }
    } else if (c.comp && typeof c.comp.oncturnpage === "function") {
      for (var k = 0; k < 3 && pageIndexInList() !== toIdx; k++) {
        try {
          c.comp.oncturnpage(null, dirData);
        } catch (e) {}
        await sleep(800);
      }
    }
    return pageIndexInList() === toIdx;
  }
  async function enterStage(id) {
    if (!(await ensureOnList())) {
      log("列表页没等到");
      return false;
    }
    sweepListPopups();
    await sleep(300);
    // 卡片是否在屏内
    var item = findStageItem(id);
    if (!item) {
      // 本页没有 → 翻页找（前 7 关分布在前两页）
      var c = listCtx();
      if (c && c.comp && c.comp.pv) {
        var pageCount = c.comp.pv.getPages().length;
        for (var p = 0; p < Math.min(pageCount, 8); p++) {
          if (await flipListPage(p)) {
            item = findStageItem(id);
            if (item) break;
          }
        }
      }
    }
    if (!item) {
      log("列表里找不到关卡卡片 " + id);
      return false;
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      item = findStageItem(id);
      if (!item) break;
      var pt = cssOf(item);
      var inScreen = pt[0] > 4 && pt[0] < 1276 && pt[1] > 4 && pt[1] < 716;
      if (!inScreen) {
        // 同一页里被折下去的两张：滚列表；不在本页：翻页
        var pgIdx = pageIndexOfItem(item);
        if (pgIdx === pageIndexInList()) {
          var sv = scrollViewOf(item);
          if (sv) {
            if (pt[1] > 700) {
              log(id + " 在折叠下面，先把列表滑上去");
              sv.scrollToBottom(0.45);
            } else {
              sv.scrollToTop(0.45);
            }
            await sleep(1000);
            continue;
          }
        }
        if (pgIdx < 0) pgIdx = 0;
        await flipListPage(pgIdx);
        await sleep(900);
        continue;
      }
      sweepListPopups(); // 点之前再清一遍：解锁/推荐面板会自己弹出来挡路
      await sleep(500 + Math.random() * 800); // 拟人：看两眼再点
      await fireClick(pt[0], pt[1]);
      // 点完不一定立刻有反应：微恐关要先弹预警，最多等 3.5s
      var t0 = now();
      var started = false;
      var kongNode = null;
      var g = null;
      while (now() - t0 < 3500) {
        g = G();
        started = g && (g.curStageId === id || (g.allnode.loadingnode && g.allnode.loadingnode.active));
        kongNode = g && g.allnode.effnode && g.allnode.effnode.getChildByName("kong");
        if (started || kongNode) break;
        await sleep(250);
      }
      if (started || kongNode) break;
      // 点击没生效：先清一遍弹窗、再用鼠标点第二次，第二次还不行才回退 emit
      if (attempt < 2) {
        log(id + " 合成点击没反应，清弹窗后再点一次");
        sweepListPopups();
        await sleep(900);
        continue;
      }
      log(id + " 合成点击未生效，回退直接进关");
      sweepListPopups();
      try {
        item.emit("touchend", { target: item });
      } catch (e) {}
      await sleep(1500);
    }
    // 微恐预警
    var g2 = G();
    var t0 = now();
    while (now() - t0 < 9000) {
      g2 = G();
      var kong = g2 && g2.allnode.effnode && g2.allnode.effnode.getChildByName("kong");
      if (kong) {
        var kongban = kong.getChildByName("kongban");
        var agr = kongban && kongban.getChildByName("agr");
        if (agr) {
          await sleep(1300 + Math.random() * 1200); // 真人看一眼再点
          var kp = cssOf(agr);
          await fireClick(kp[0], kp[1]);
          await sleep(1500);
        }
        var still = G().allnode.effnode.getChildByName("kong");
        if (still) {
          try {
            var kc = kong.getComponent("kong");
            kc && kc.oncagr && kc.oncagr({ target: agr });
            log("微恐同意 回退直接调用");
          } catch (e) {}
          await sleep(1200);
        }
        break;
      }
      if (g2 && g2.curStageId === id) break;
      await sleep(400);
    }
    // 等游戏就绪
    var t1 = now();
    while (now() - t1 < 45000) {
      var g3 = G();
      var s = g3 && g3.game;
      if (s && s.paiNode && g3.curStageId === id) return true;
      await sleep(500);
    }
    log("进关超时 " + id);
    return false;
  }

  // ---------- 关卡内：主玩法 ----------
  async function playStage(TARGET) {
    var t0 = now();
    var CENTER_DROP = TARGET === 106 || TARGET === 112;
    var F_DROP = CENTER_DROP ? 0.5 : 0.6525;
    var F_PARK = CENTER_DROP ? 0.473 : 0.701;
    var PARK = [618, 316];
    var st = READ();
    if (st.err) {
      log("进关后读状态失败 " + st.err);
      return { ok: false, why: "no-game" };
    }
    var N = st.n;
    log("进关 " + TARGET + "：共 " + N + " 页，当前第 " + st.pageIndex + " 页，错误次数 " + st.errNum);

    // 录屏（window.__REC=true 时）
    if (W.__REC && !W.__RECH) {
      try {
        var cvr = document.getElementById("GameCanvas");
        var stream = cvr.captureStream(30);
        var chunks = [];
        var mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
        mr.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        W.__RECH = { mr: mr, chunks: chunks };
        mr.start(1000);
        log("录屏已开始");
      } catch (e) {
        log("录屏启动失败 " + e.message);
      }
    }

    // 翻页方向跟踪
    var lastPg = st.pageIndex;
    var lastFlipT = now();
    var dir = null;
    function noteFlip(pg) {
      if (pg === lastPg) return;
      if (Math.abs(pg - lastPg) === 1) dir = pg > lastPg ? 1 : -1;
      lastPg = pg;
      lastFlipT = now();
    }
    log("先观察一下翻页…");
    for (var k = 0; k < 40; k++) {
      await sleep(200);
      var s1 = READ();
      if (s1.err) break;
      noteFlip(s1.pageIndex);
      if (dir !== null) break;
    }
    if (dir === null) dir = 1;
    log("翻页方向：" + (dir > 0 ? "向后 →" : "向前 ←"));

    function arriveOrder(cur, d, count) {
      var out = [];
      var pos = cur;
      var dd = d;
      for (var k2 = 1; k2 <= (count || 12) || out.length < 12; k2++) {
        pos += dd;
        if (pos < 0 || pos > N - 1) {
          dd = -dd;
          pos += 2 * dd;
        }
        out.push({ page: pos, steps: k2 });
        if (k2 > 30) break;
      }
      return out;
    }
    async function swipeRow(fromX, y, dx) {
      fireMove(fromX, y);
      await sleep(120);
      fire("mousedown", fromX, y, 1);
      for (var i = 1; i <= 10; i++) {
        fire("mousemove", fromX + (dx * i) / 10, y, 1);
        await sleep(22);
      }
      await sleep(110);
      fire("mouseup", fromX + dx, y, 0);
      await sleep(950);
    }
    function gapX(cards, midX, col) {
      var cs = cards
        .filter(function (c) {
          return c.active && c.css;
        })
        .map(function (c) {
          return c.css[0];
        })
        .sort(function (a, b) {
          return a - b;
        });
      var left = null;
      var right = null;
      for (var i = 0; i < cs.length; i++) {
        if (cs[i] <= midX) left = cs[i];
        if (cs[i] >= midX && right === null) right = cs[i];
      }
      var g2 = midX;
      if (left !== null && right !== null && right - left > 20) g2 = Math.round((left + right) / 2);
      else if (left !== null && Math.abs(left - midX) < 25) g2 = midX + 40;
      if (col) g2 = Math.max(col[0] + 20, Math.min(col[1] - 20, g2));
      return g2;
    }
    async function ensureCardVisible(cardName, st0) {
      var s0 = st0;
      var lastX = null;
      var lastDx = null;
      for (var guard = 0; guard < 3; guard++) {
        var card = s0.cards.filter(function (c) {
          return c.active && c.item === cardName;
        })[0];
        if (!card || !card.css || !s0.col) return { ok: false, st: s0, why: "下排无此卡" };
        var l = s0.col[0];
        var r = s0.col[1];
        if (card.css[0] >= l + 45 && card.css[0] <= r - 45) {
          await sleep(650);
          var s9 = READ();
          var c9 = s9.cards.filter(function (c) {
            return c.active && c.item === cardName;
          })[0];
          if (c9 && c9.css && s9.col && c9.css[0] >= s9.col[0] + 45 && c9.css[0] <= s9.col[1] - 45) return { ok: true, st: s9 };
          s0 = s9;
          continue;
        }
        var midX = Math.round((l + r) / 2);
        var y = card.css[1];
        var dx = Math.max(-280, Math.min(280, midX - card.css[0]));
        if (lastX !== null && Math.abs(card.css[0] - lastX) < 8 && lastDx !== null) dx = -lastDx;
        lastX = card.css[0];
        lastDx = dx;
        await swipeRow(gapX(s0.cards, midX, s0.col), y, dx);
        s0 = READ();
      }
      var card2 = s0.cards.filter(function (c) {
        return c.active && c.item === cardName;
      })[0];
      return { ok: false, st: s0, why: "滑不到位 " + JSON.stringify(card2 && card2.css) };
    }
    async function liftCard(cardCss) {
      fireMove(cardCss[0], cardCss[1]);
      await sleep(150);
      fire("mousedown", cardCss[0], cardCss[1], 1);
      await sleep(80);
      for (var k3 = 1; k3 <= 6; k3++) {
        fire("mousemove", cardCss[0], cardCss[1] - k3 * 26, 1);
        await sleep(18);
      }
      fire("mousemove", PARK[0], PARK[1], 1);
      await sleep(90);
    }
    function cardInRow(s1, name) {
      if (!s1 || s1.err || !s1.cards) return false;
      return s1.cards.some(function (c) {
        return c.active && c.item === name;
      });
    }
    async function holdAndDrop(targetPage, maxWaitMs) {
      var t1 = now();
      var prev = null;
      var k4 = 0;
      var prevPg = null;
      var hits = 0;
      var seen = [];
      while (now() - t1 < maxWaitMs) {
        var cur = READ();
        if (cur.err) return { ok: false, why: "no-game" };
        noteFlip(cur.pageIndex);
        if (cur.pageIndex !== prevPg) {
          if (seen.length < 30) seen.push([Math.round((now() - t1) / 100) / 10, cur.pageIndex]);
          prevPg = cur.pageIndex;
        }
        var tg = cur.pages[targetPage];
        if (cur.pageIndex === targetPage && !cur.pvScrolling && tg && tg.active && tg.css) {
          hits++;
          var ctr = tg.css;
          var drop = tg.yTop != null && tg.h > 50 ? [ctr[0], Math.round(tg.yTop + F_DROP * tg.h)] : ctr;
          if (prev && Math.abs(ctr[0] - prev[0]) <= 6 && Math.abs(ctr[1] - prev[1]) <= 6) {
            fire("mousemove", drop[0], drop[1], 1);
            await sleep(90);
            var chk = READ();
            var c2 = chk.pages[targetPage];
            if (!chk.err && chk.pageIndex === targetPage && c2 && c2.active && c2.css) {
              var d0 = c2.css[0] - ctr[0];
              var d1 = c2.css[1] - ctr[1];
              if (Math.abs(d0) <= 12 && Math.abs(d1) <= 12) {
                fire("mouseup", drop[0], drop[1], 0);
                return { ok: true, waited: now() - t1, hits: hits, seen: seen };
              }
            }
            prev = null;
            continue;
          }
          prev = ctr;
          await sleep(150);
          continue;
        }
        prev = null;
        k4++;
        var dx2 = Math.round(20 * Math.sin(k4 * 0.33));
        var dy2 = Math.round(25 * Math.sin(k4 * 0.21 + 1));
        fire("mousemove", PARK[0] + dx2, PARK[1] + dy2, 1);
        await sleep(170);
      }
      fire("mousemove", 60, 680, 1);
      await sleep(90);
      fire("mouseup", 60, 680, 0);
      await sleep(700);
      return { ok: false, why: "等了 " + Math.round(maxWaitMs / 1000) + "s 没等到页 " + targetPage, hits: hits, seen: seen };
    }

    // 关卡内兜底：成功/失败/超时弹窗
    function layerState() {
      var g = G();
      var canvas = cc.find("Canvas");
      if (!g || !canvas) return {};
      var out = {};
      try {
        out.success = !!canvas.getChildByName("succesLayer");
        out.fail = !!canvas.getChildByName("failLayer");
        out.timeout = !!canvas.getChildByName("timeoutLayer");
      } catch (e) {}
      return out;
    }

    var rounds = 0;
    var stuck = 0;
    var result = { ok: false, why: "loop-end" };
    while (rounds++ < 24) {
      try {
      // 超时看门狗
      if (now() - t0 > 6.5 * 60 * 1000) {
        result = { ok: false, why: "整关超 6.5 分钟" };
        break;
      }
      var lay = layerState();
      if (lay.success) {
        result = { ok: true, why: "success-layer" };
        break;
      }
      if (lay.timeout) {
        log("超时弹窗：自动加时");
        var tl = cc.find("Canvas").getChildByName("timeoutLayer");
        var tc = tl && tl.getComponent("TimeoutLayer");
        try {
          tc && tc.onBtn_addTime();
        } catch (e) {
          log("加时出错 " + e.message);
        }
        await sleep(2500);
        var stillT = cc.find("Canvas").getChildByName("timeoutLayer");
        if (stillT) {
          try {
            tc && tc.onBtn_back();
          } catch (e) {}
          result = { ok: false, why: "超时且加时失败" };
          await sleep(1500);
          break;
        }
        continue;
      }
      if (lay.fail) {
        log("失败弹窗：自动重开本关");
        var fl = cc.find("Canvas").getChildByName("failLayer");
        var fc = fl && fl.getComponent("FailLayer");
        await sleep(1200);
        try {
          fc && fc.on_replay();
        } catch (e) {
          log("重开出错 " + e.message);
        }
        // 等重新进关
        var tf = now();
        while (now() - tf < 40000) {
          await sleep(600);
          var sf = READ();
          if (!sf.err && sf.matched < sf.n) break;
        }
        var sf2 = READ();
        if (sf2.err) {
          result = { ok: false, why: "重开后读不到状态" };
          break;
        }
        N = sf2.n;
        lastPg = sf2.pageIndex;
        lastFlipT = now();
        stuck = 0;
        continue;
      }

      st = READ();
      if (st.err) {
        log("状态读取失败：" + st.err);
        result = { ok: false, why: "read-fail" };
        break;
      }
      if (st.matched >= N) {
        result = { ok: true, why: "matched" };
        break;
      }
      if (st.errNum <= 2 && st.btns.btn_jiabushu && st.btns.btn_jiabushu.active) {
        await fireClick(st.btns.btn_jiabushu.css[0], st.btns.btn_jiabushu.css[1]);
        await sleep(700);
        st = READ();
        log("补加步数 → 错误次数 " + st.errNum);
      }
      var unmatched = st.pages
        .filter(function (p) {
          return p.active;
        })
        .map(function (p) {
          return p.i;
        });
      if (!unmatched.length) {
        result = { ok: true, why: "no-unmatched" };
        break;
      }
      function inWin(s, c) {
        return !!(c && c.css && s.col && c.css[0] >= s.col[0] + 45 && c.css[0] <= s.col[1] - 45);
      }
      function looseIn(s, c) {
        return !!(c && c.css && s.col && c.css[0] >= s.col[0] + 20 && c.css[0] <= s.col[1] - 20);
      }
      function cardOf(s, name) {
        if (!s || s.err || !s.cards) return undefined;
        return s.cards.filter(function (c) {
          return c.active && c.item === name;
        })[0];
      }
      function orderOf(s) {
        var arr = [];
        if (!s || s.err || !s.pages) return arr;
        var sinceFlip0 = (now() - lastFlipT) / 1000;
        if (s.pages[s.pageIndex] && s.pages[s.pageIndex].active && sinceFlip0 <= 2.5) arr.push({ page: s.pageIndex, steps: 0 });
        var rest = arriveOrder(s.pageIndex, dir, 40).filter(function (o) {
          return (
            unmatched.indexOf(o.page) >= 0 &&
            !arr.some(function (x) {
              return x.page === o.page;
            })
          );
        });
        return arr.concat(rest);
      }
      var card = null;
      var s1 = st;
      for (var attempt = 0; attempt < 4 && !card; attempt++) {
        var order = orderOf(s1);
        if (!order.length) break;
        var best = order[0];
        var cBest = cardOf(s1, "item" + best.page);
        if (cBest && inWin(s1, cBest)) {
          card = cBest;
          break;
        }
        var visBest = order.filter(function (o) {
          return inWin(s1, cardOf(s1, "item" + o.page)) && o.steps * 5 - (now() - lastFlipT) / 1000 <= 15;
        })[0];
        if (visBest) {
          card = cardOf(s1, "item" + visBest.page);
          break;
        }
        var r = await ensureCardVisible("item" + best.page, s1);
        s1 = r.st;
        var cAfter = cardOf(s1, "item" + best.page);
        if (r.ok && cAfter && inWin(s1, cAfter)) {
          card = cAfter;
          break;
        }
      }
      if (!card || !card.css) {
        var left = (s1.cards || [])
          .filter(function (c) {
            return c.active && c.css && unmatched.indexOf(Number(String(c.item).replace("item", ""))) >= 0;
          })
          .map(function (c) {
            return [c.item, c.css[0]];
          });
        log("第" + rounds + "轮：下排滑不到位（未匹配卡位 " + JSON.stringify(left) + "），跳过");
        if (stuck++ >= 2) {
          log("     连续找不到卡，来回大扫下排");
          for (var i2 = 0; i2 < 6 && !card; i2++) {
            var cc3 = s1.col || [438, 846];
            var y2 = ((s1.cards || []).filter(function (c) {
              return c.active && c.css;
            })[0] || { css: [0, 613] }).css[1];
            await swipeRow(i2 % 2 === 0 ? cc3[0] + 40 : cc3[1] - 40, y2, i2 % 2 === 0 ? -280 : 280);
            s1 = READ();
            var ord2 = orderOf(s1);
            var c22 = ord2.length ? cardOf(s1, "item" + ord2[0].page) : null;
            if (c22 && inWin(s1, c22)) card = c22;
          }
          stuck = 0;
        }
        if (!card) {
          await sleep(400);
          continue;
        }
      }
      var targetPage = Number(String(card.item).replace("item", ""));
      var beforeMatched = st.matched;
      async function settleCard(name) {
        var a = await READ();
        for (var i3 = 0; i3 < 6; i3++) {
          await sleep(260);
          var b = await READ();
          var ca = cardOf(a, name);
          var cb = cardOf(b, name);
          a = b;
          if (ca && cb && ca.css && cb.css && Math.abs(ca.css[0] - cb.css[0]) <= 2 && Math.abs(ca.css[1] - cb.css[1]) <= 2) return cb;
        }
        return cardOf(a, name);
      }
      var cStable = await settleCard(card.item);
      if (cStable && cStable.css) card = cStable;
      {
        var sNow = await READ();
        var cNow = cardOf(sNow, card.item);
        if (!cNow || !looseIn(sNow, cNow)) {
          log("     起手前 " + card.item + " 滑出窗了，重新找");
          await sleep(300);
          continue;
        }
        card = cNow;
      }
      log("第" + rounds + "轮：拿 " + card.item + "（目标第 " + targetPage + " 页，当前第 " + st.pageIndex + " 页）");
      {
        var sP = await READ();
        for (var i4 = 0; i4 < 6 && sP.pvScrolling; i4++) {
          await sleep(200);
          sP = READ();
        }
        var pg = (sP.pages || [])[sP.pageIndex] ||
          (sP.pages || []).filter(function (p) {
            return p.yTop != null && p.w > 20;
          })[0];
        if (pg && pg.yTop != null && pg.h > 50 && pg.css) {
          PARK = [pg.css[0], Math.round(pg.yTop + F_PARK * pg.h)];
        }
      }
      await liftCard(card.css);
      var chkLift = await READ();
      if (chkLift.err) {
        result = { ok: false, why: "read-fail" };
        break;
      }
      if (cardInRow(chkLift, card.item)) {
        fire("mousemove", 60, 680, 1);
        await sleep(120);
        fire("mouseup", 60, 680, 0);
        await sleep(600);
        var s2 = await READ();
        var card2 = (s2.cards || []).filter(function (c) {
          return c.active && c.item === card.item && c.css && s2.col && c.css[0] >= s2.col[0] + 40 && c.css[0] <= s2.col[1] - 40;
        })[0];
        if (!card2) {
          log("     拿 " + card.item + " 没拿起来，且它不在窗内，跳过");
          stuck++;
          await sleep(400);
          continue;
        }
        log("     第一次没拿起来，再拿一次");
        await liftCard(card2.css);
        chkLift = await READ();
        if (chkLift.err) {
          result = { ok: false, why: "read-fail" };
          break;
        }
        if (cardInRow(chkLift, card.item)) {
          fire("mousemove", 60, 680, 1);
          await sleep(120);
          fire("mouseup", 60, 680, 0);
          await sleep(600);
          log("     还是没拿起来，跳过");
          stuck++;
          continue;
        }
      }
      var r1 = await holdAndDrop(targetPage, 60000);
      if (!r1.ok) {
        log("     ✗ " + r1.why + (r1.seen && r1.seen.length > 6 ? "；页序 " + JSON.stringify(r1.seen) : ""));
        await sleep(300);
        continue;
      }
      await sleep(1200);
      var after = await READ();
      if (!after.err && after.matched > beforeMatched) {
        log(
          "     ✓ 命中（等待 " +
            (r1.waited / 1000).toFixed(1) +
            "s，到过目标页 " +
            r1.hits +
            " 次）→ " +
            after.matched +
            "/" +
            N
        );
        stuck = 0;
      } else {
        log("     ✗ 没命中（matched " + after.matched + "，errNum " + after.errNum + "）");
        stuck++;
        if (stuck >= 3) {
          log("     连续没进账，横滑下排换目标");
          await swipeRow(Math.round(((st.col && st.col[0]) || 438) + 200), 613, 300);
          stuck = 0;
        }
      }
      await sleep(350);
      } catch (eR) {
        // 单轮出异常（读状态落空/页面切换中）不能让整关崩掉：记一笔，接着干
        log("第" + rounds + "轮异常：" + (eR && eR.message ? eR.message : eR) + "，稍后继续");
        await sleep(900);
        continue;
      }
    }
    var fin = READ();
    var out = {
      ok: !fin.err && fin.matched >= (fin.err ? 0 : fin.n),
      matched: fin.err ? -1 : fin.matched,
      n: fin.err ? -1 : fin.n,
      errNum: fin.err ? -1 : fin.errNum,
      sec: Math.round((now() - t0) / 1000),
      why: result.why,
    };
    return out;
  }

  // ---------- 成功弹窗 → 返回主页 ----------
  async function leaveStage() {
    var canvas = cc.find("Canvas");
    var sl = canvas && canvas.getChildByName("succesLayer");
    if (!sl) {
      // 没有成功弹窗（异常路径）：直接回列表
      var g0 = G();
      if (g0 && g0.curStageId !== -1) {
        try {
          g0.backToHall();
        } catch (e) {}
      }
      await waitOnList(12000);
      return;
    }
    await sleep(2600 + Math.random() * 1300); // 观众看结算
    // 找「返回主页」按钮：先按名字找，再按回调找
    var btn = null;
    walk(sl, function (n) {
      if (btn) return;
      var nm = (n.name || "").toLowerCase();
      if (nm.indexOf("back") >= 0 || nm.indexOf("fanhui") >= 0 || n.name === "返回主页") btn = n;
    });
    if (!btn) {
      walk(sl, function (n) {
        if (btn) return;
        var b = n.getComponent ? n.getComponent(cc.Button) : null;
        if (b && b.clickEvents) {
          for (var i = 0; i < b.clickEvents.length; i++) {
            if (/back|fanhui/i.test(b.clickEvents[i].handler || "")) {
              btn = n;
              break;
            }
          }
        }
      });
    }
    if (btn) {
      var pt = cssOf(btn);
      log("成功弹窗：点返回主页 @" + JSON.stringify(pt));
      await fireClick(pt[0], pt[1]);
      await sleep(1800);
    }
    var okList = await waitOnList(1500);
    if (!okList) {
      // 回退：直接调用组件方法
      var comp = sl.getComponent("SuccesLayer");
      if (comp && comp.onBtn_back) {
        try {
          comp.onBtn_back();
          log("返回主页 回退直接调用");
        } catch (e) {
          log("返回主页 直接调用失败 " + e.message);
        }
      } else {
        var g1 = G();
        try {
          g1.backToHall();
        } catch (e) {}
      }
      await waitOnList(12000);
    }
  }

  // ---------- 洗牌 ----------
  var STAGES = [106, 112, 105, 76, 82, 109, 111];
  function shuffled() {
    // 调试用：地址栏加 #order=109,82 可以固定顺序（不影响正常随机）
    var m = /order=([\d,]+)/.exec(location.hash || "");
    if (m) {
      var fixed = m[1]
        .split(",")
        .map(Number)
        .filter(function (v) {
          return STAGES.indexOf(v) >= 0;
        });
      if (fixed.length) return fixed;
    }
    var a = STAGES.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j];
      a[j] = a[k];
      a[k] = t;
    }
    return a;
  }

  // ---------- 主循环 ----------
  var roundNo = 0;
  var lastPlayed = -1;
  async function mainLoop() {
    // 等游戏引导就绪
    for (var i = 0; i < 120; i++) {
      var g = G();
      if (g && g.allnode && g.allnode.selnode && g.allnode.selnode.getChildByName("selstagebg")) break;
      await sleep(1000);
    }
    await sleep(2200); // 落地后先停一下
    log("自动玩启动（7 关随机关卡）", true);
    while (AP.running) {
      roundNo++;
      var order = shuffled();
      if (order[0] === lastPlayed && order.length > 1) {
        var t = order[0];
        order[0] = order[order.length - 1];
        order[order.length - 1] = t;
      }
      AP.state.round = roundNo;
      AP.state.order = order.slice();
      AP.state.done = 0;
      log("第 " + roundNo + " 轮随机顺序：" + order.join(" → "), true);
      for (var oi = 0; oi < order.length && AP.running; oi++) {
        var id = order[oi];
        AP.state.cur = id;
        try {
        var entered = await enterStage(id);
        if (!entered) {
          log("进关失败 " + id + "，回列表继续");
          await ensureOnList();
          continue;
        }
        var res = await playStage(id);
        AP.state.lastResult = { id: id, res: res };
        log("关卡 " + id + " 结束：matched " + res.matched + "/" + res.n + "，错误次数 " + res.errNum + "，耗时 " + res.sec + "s（" + res.why + "）", true);
        if (res.ok) {
          await leaveStage();
          AP.state.done++;
          await sleep(1300 + Math.random() * 1100); // 列表上停一下再点下一关
        } else {
          // 失败/超时中止：直接回列表，继续下一关
          var gl = G();
          try {
            gl && gl.backToHall();
          } catch (e) {}
          await waitOnList(15000);
          await sleep(1200);
        }
        } catch (eOne) {
          // 单关异常：回列表接着打下一关，不让整轮/整夜跑挂掉
          log("关卡 " + id + " 异常：" + (eOne && eOne.message ? eOne.message : eOne) + "，回列表继续", true);
          try {
            var gE = G();
            gE && gE.backToHall();
          } catch (e2) {}
          await waitOnList(12000);
          await sleep(1200);
        }
      }
      log("第 " + roundNo + " 轮完成，重新洗牌", true);
    }
  }

  AP.stop = function () {
    AP.running = false;
    log("收到停止指令", true);
  };

  // 启动
  function boot() {
    mainLoop().catch(function (e) {
      log("主循环异常：" + (e && e.message ? e.message : e), true);
      // 兜底自愈：没被叫停就 10 秒后自动重启主循环
      if (AP.running) {
        log("10 秒后自动重启主循环", true);
        setTimeout(boot, 10000);
      }
    });
  }
  boot();
})();
