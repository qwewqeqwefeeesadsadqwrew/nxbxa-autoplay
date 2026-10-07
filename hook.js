/* ============================================================
   nxbxa 上线补丁壳 v1.0（页面版）
   ------------------------------------------------------------
   页面自己只放：index.html / hook.js / autoplay-nxbxa.js / nxbxconfig.json
   游戏本体（引擎、启动脚本、素材、关卡包）全部从官方 CDN 现拉。

   本文件只干一件事：把需要改的两个脚本拦下来——
   拉官方原版 → 就地打补丁 → 用 blob 交给页面。

     主包 assets/main/index.<ver>.js
       ① 远程配置地址 → 本站目录下的 nxbxconfig.json（7 个微恐关排最前）
       ② G.isunlock 白名单 → 前 7 关默认解锁，其余关卡照旧
       ③ 直播设置锁定 → 4 个绿勾（道具随机 / 最后判定胜负 / 自动翻页 5 秒 / 关卡无限时间）

     关卡公共包 assets/stagebg/index.<ver>.js
       ④ 关卡内青条上方显示「关卡名字：XXX」

   补丁打在原版字节上，替补丁点与本地实测版逐字节对齐（tools/verify-deploy-patches.js）。
   改规则时把 CFG.cacheName 的版本号 +1，否则浏览器会继续用老缓存。
   ============================================================ */

var CFG = {
  // 官方 CDN 目录（index.html 里的 <base> 也必须是它）
  cdn: "https://cgame.hulumao.top/nxbxa/web/",
  // 改任何规则都要 +1
  cacheName: "nxbxa-patch-v1",
  // ① 远程配置地址：换成「和页面同目录」的 nxbxconfig.json，任何域名/子路径都能用
  oldUrl: '"https://hulumao1.oss-cn-heyuan.aliyuncs.com/nxbxconfig2.json?t="',
  newUrl: 'location.href.replace(/[^/]*$/, "")+"nxbxconfig.json?t="',
  // ② 解锁白名单的插入点
  unlockNeedle: "isunlock:function(e){",
  // ③ 直播设置的插入点（原句：把 localuserdata.zbdata 读进设置对象之前）
  zbAnchor:
    "a.localuserdata.home=a.localuserdata.home||{endlist:[]},a.localuserdata.zbdata)a[o]=a.localuserdata.zbdata[o];",
  // ④ 关卡名插入点
  nameAnchor: 'c.loadResByBundle("stagehome","gohomewin",cc.Prefab,function(){})',
  // 兜底顺序（正常会去拉同目录的 nxbxconfig.json；这份只在拉取失败时用）
  order: {"geng":[106,112,105,76,82,109,111,14,55,47,3,2,6,11,39,65,152,18,7,236,228,235,227,234,233,232,231,230,229,206,202,201,200,199,198,197,196,194,193,192,191,190,189,188,187,186,185,184,183,182,181,180,179,178,177,176,175,174,173,172,171,170,145,165,166,167,164,169,163,168,162,161,160,159,157,158,156,153,154,151,195,150,148,149,147,146,141,144,143,142,140,138,137,134,133,132,131,130,129,128,127,71,107,125,115,103,118,108,120,104,119,101,126,116,88,102,110,89,78,5,97,95,94,96,91,90,121,86,84,85,83,122,81,80,75,77,92,123,72,73,66,68,124,64,53,60,52,16,87,99,32,74,51,8,50,1,13,44,212,12,43,38,41,49,237,254,238,239,240,249,250,251,252,241,242,243,244,245,246,247,248,253,15,17,40,0,9,4,10,19,20,21,22,23,24,25,26,27,28,30,33,34,35,36,37],"bao":[],"ying":[76,82,0,1,2,3,4,11,12,13,15,16,44,45,46,47,50,51,52,53,55,60,62,63,64,66,68,71,72,73,74,75,77,78,80,81,83,85,84,86,87,88,89,90,91,94,95,96,97,98,99],"zhao":[5,6,7,8,9,10,118,119,110,120,121,122,123,124],"zhi":[],"pin":[],"sha":[],"bu":[18,19,20,21,22,23,24,25,26,27,32,33,34,35,36,37],"jian":[117,116]},
};

(function () {
  var CDN_PREFIX = CFG.cdn;
  var CACHE_NAME = CFG.cacheName;
  var mainRe = /\/assets\/main\/index(\.[0-9a-f]+)?\.js(\?|#|$)/;
  var stagebgRe = /\/assets\/stagebg\/index(\.[0-9a-f]+)?\.js(\?|#|$)/;
  var mem = Object.create(null);

  function isTarget(abs) {
    return abs.indexOf(CDN_PREFIX) === 0 && (mainRe.test(abs) || stagebgRe.test(abs));
  }

  var UNLOCK_INS =
    "if(" +
    CFG.order.geng
      .slice(0, 7)
      .map(function (i) {
        return "e==" + i;
      })
      .join("||") +
    ")return!0;";

  var ZB_SNIPPET =
    "a.localuserdata.home=a.localuserdata.home||{endlist:[]},a.localuserdata.zbdata=a.localuserdata.zbdata||{},/*zbSettingsPatch*/" +
    "(function(d){d.isran=!0,d.issomepass=!0,d.isTurning=!0,d.turningTime=5,d.isInfinitetime=!0," +
    "d.isLive=!1,d.isszb=!1,d.isHeadUp=!1,d.isNotNext=!1,d.isNotClick=!1,d.isLvTime=!1,d.isStroke=!1," +
    "d.isRefreshBtn=!1,d.isDragturning=!1,d.isShowNumber=!1,d.isKeyboardturning=!1,d.isSerialnumber=!1,d.isHidePopUp=!1})(a.localuserdata.zbdata)," +
    "a.localuserdata.zbdata)a[o]=a.localuserdata.zbdata[o];";

  var NAME_SNIPPET =
    "/*stageNamePatch*/" +
    '(function(g,e,n){var b=g.getChildByName("titleBg");if(!b)return;' +
    'var d=b.getChildByName("stageNameLabel");' +
    'if(!d){d=new cc.Node("stageNameLabel");var L=d.addComponent(cc.Label);' +
    "L.fontSize=26;L.lineHeight=26;d.color=cc.color(0,0,0,255);" +
    "var O=d.addComponent(cc.LabelOutline);O.color=cc.color(255,255,255,255);O.width=2;" +
    "d.parent=b;d.setPosition(0,54)}" +
    'var s=e.stage&&e.stage[n.curStageId]?e.stage[n.curStageId].word:"";' +
    'if(s){d.active=!0;d.getComponent(cc.Label).string="\\u5173\\u5361\\u540d\\u5b57\\uff1a"+s}' +
    "else{d.active=!1}})(this.node,r,c)," +
    CFG.nameAnchor;

  function count(s, sub) {
    return s.split(sub).length - 1;
  }

  // ---- 主包：3 处补丁 ----
  function patchMain(s) {
    var hits = 0;

    // ① 远程配置地址
    if (count(s, CFG.oldUrl) === 1) {
      s = s.replace(CFG.oldUrl, CFG.newUrl);
      hits++;
    }

    // ② 内联兜底数组（只动 config 模块那一段）
    var startMark = '"config"),i.__esModule=!0';
    var start = s.indexOf(startMark);
    var end = s.indexOf("initbyremote:function(){", start);
    if (start >= 0 && end > start) {
      var head = s.slice(0, start);
      var mid = s.slice(start, end);
      var tail = s.slice(end);
      for (var k in CFG.order) {
        var re = new RegExp("(" + k + ":\\[)[0-9,]*\\]");
        var m = mid.match(re);
        if (!m) continue;
        mid = mid.replace(re, m[1] + CFG.order[k].join(",") + "]");
        hits++;
      }
      s = head + mid + tail;
    }

    // ③ 解锁白名单
    if (count(s, CFG.unlockNeedle) === 1) {
      s = s.replace(CFG.unlockNeedle, CFG.unlockNeedle + UNLOCK_INS);
      hits++;
    }

    // ④ 直播设置锁定
    if (count(s, CFG.zbAnchor) === 1) {
      s = s.replace(CFG.zbAnchor, ZB_SNIPPET);
      hits++;
    }

    return hits ? s : null;
  }

  // ---- 关卡公共包：关卡名字 ----
  function patchStagebg(s) {
    if (count(s, CFG.nameAnchor) !== 1) return null;
    return s.replace(CFG.nameAnchor, NAME_SNIPPET);
  }

  function sanityCheck(txt, url) {
    try {
      new Function(txt);
    } catch (e) {
      console.warn("[nxbxa] warning: patched script failed the syntax check (still shipped): " + url + " :: " + (e && e.message));
    }
  }

  function fetchAndPatch(url) {
    var isMain = mainRe.test(url);
    return fetch(url, { credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.arrayBuffer();
      })
      .then(function (ab) {
        var txt = new TextDecoder("utf-8").decode(ab);
        var out = isMain ? patchMain(txt) : patchStagebg(txt);
        if (out == null) {
          console.warn("[nxbxa] no patch point found, shipping as-is: " + url);
          return null;
        }
        console.log("[nxbxa] patched (" + (isMain ? "main" : "stagebg") + ") - " + Math.round(ab.byteLength / 1024) + "KB - " + url.replace(CDN_PREFIX, ""));
        sanityCheck(out, url);
        return new Blob([out], { type: "application/javascript" });
      });
  }

  function cacheGet(url) {
    if (!window.caches) return Promise.resolve(null);
    return caches
      .open(CACHE_NAME)
      .then(function (c) {
        return c.match(url);
      })
      .then(function (r) {
        return r ? r.blob() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function cachePut(url, blob) {
    if (!window.caches) return Promise.resolve();
    return caches
      .open(CACHE_NAME)
      .then(function (c) {
        return c.put(url, new Response(blob, { headers: { "Content-Type": "application/javascript" } }));
      })
      .catch(function () {});
  }

  function resolvePatched(url) {
    if (mem[url]) return Promise.resolve(mem[url]);
    return cacheGet(url).then(function (blob) {
      if (blob) {
        mem[url] = URL.createObjectURL(blob);
        return mem[url];
      }
      return fetchAndPatch(url).then(function (b) {
        if (!b) return null;
        mem[url] = URL.createObjectURL(b);
        cachePut(url, b);
        return mem[url];
      });
    });
  }

  // ---- 劫持 <script src>，命中就换成补丁后的 blob ----
  var proto = window.HTMLScriptElement && window.HTMLScriptElement.prototype;
  if (proto) {
    var d = Object.getOwnPropertyDescriptor(proto, "src");
    var rawSetSrc = d && d.set ? d.set : function (v) { proto.setAttribute.call(this, "src", v); };
    var rawGetSrc = d && d.get ? d.get : function () { return this.getAttribute("src") || ""; };
    var rawSetAttr = proto.setAttribute;

    function rewrite(el, abs) {
      el.__nxbPending = abs;
      resolvePatched(abs).then(
        function (u) {
          if (el.__nxbPending !== abs) return;
          rawSetSrc.call(el, u || abs);
        },
        function (e) {
          if (el.__nxbPending !== abs) return;
          console.warn("[nxbxa] fetch failed, falling back to the original url: " + abs, e);
          rawSetSrc.call(el, abs);
        }
      );
    }

    Object.defineProperty(proto, "src", {
      configurable: true,
      enumerable: d ? d.enumerable : true,
      get: function () {
        return rawGetSrc.call(this);
      },
      set: function (v) {
        var abs = null;
        try {
          abs = new URL(String(v), document.baseURI).href;
        } catch (e) {}
        if (abs && isTarget(abs)) {
          rewrite(this, abs);
          return;
        }
        rawSetSrc.call(this, v);
      },
    });

    proto.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === "src") {
        this.src = value;
        return;
      }
      return rawSetAttr.call(this, name, value);
    };
  }

  window.__NXBX_HOOK__ = { version: "1.0", isTarget: isTarget, patchMain: patchMain, patchStagebg: patchStagebg };
})();
