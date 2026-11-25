// ==UserScript==
// @name         Via 脚本更新器
// @namespace    https://tianxinshanbian.github.io/via-scripts
// @version      1.0.1
// @description  读取远程版本清单，发现新版在页面底部提示，点一下跳到 .user.js 安装地址由 Via 完成覆盖更新
// @author       you
// @run-at       document-end
// @match        https://*/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    /* ============ 只改这三行 ============ */
    var LOCAL_VER   = '1.0.1';                                                  // 必须和上面 @version 一致
    var BASE_URL    = 'https://tianxinshanbian.github.io/via-scripts';           // 清单所在目录，不带结尾斜杠
    var SCRIPT_NAME = 'via-updater.user.js';                                     // 线上脚本文件名
    /* =================================== */

    var ROOT        = BASE_URL.replace(/\/+$/, '');
    var META_JS     = ROOT + '/version.js';      // 优先：<script> 加载，不受 CORS 限制
    var META_JSON   = ROOT + '/version.json';    // 兜底：fetch 读 JSON
    var INSTALL_URL = ROOT + '/' + SCRIPT_NAME;
    var KEY         = 'via_upd_' + SCRIPT_NAME;
    var COOLDOWN_MS = 24 * 60 * 60 * 1000;       // 24 小时内最多提示一次

    function verNewer(cur, remote) {
        var a = String(cur).split('.'), b = String(remote).split('.');
        for (var i = 0; i < Math.max(a.length, b.length); i++) {
            var x = parseInt(a[i] || 0, 10), y = parseInt(b[i] || 0, 10);
            if (isNaN(x)) x = 0;
            if (isNaN(y)) y = 0;
            if (y !== x) return y > x;
        }
        return false;
    }

    function readTs() {
        try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { return 0; }
    }
    function writeTs() {
        try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    }

    function showTip(info) {
        if (!document.body || document.getElementById('via-upd-tip')) return;

        var box = document.createElement('div');
        box.id = 'via-upd-tip';
        box.style.cssText = [
            'position:fixed', 'left:12px', 'right:12px', 'bottom:16px', 'z-index:2147483647',
            'display:flex', 'align-items:center', 'gap:10px',
            'padding:11px 14px', 'border-radius:12px',
            'background:rgba(28,32,38,.96)', 'color:#f2f0ea',
            'font:14px/1.45 -apple-system,"Microsoft YaHei",sans-serif',
            'box-shadow:0 6px 22px rgba(0,0,0,.32)'
        ].join(';');

        var txt = document.createElement('div');
        txt.style.cssText = 'flex:1;min-width:0';
        txt.innerHTML = '<b>脚本有新版本 v' + String(info.version) + '</b>'
            + '<span style="color:#9aa3ad;margin-left:6px">当前 ' + LOCAL_VER + '</span>';

        var go = document.createElement('a');
        go.href = info.url || INSTALL_URL;
        go.textContent = '立即更新';
        go.style.cssText = 'flex:none;color:#ffd479;font-weight:600;text-decoration:none;padding:7px 12px;border:1px solid rgba(255,212,121,.35);border-radius:8px';

        var later = document.createElement('span');
        later.textContent = '×';
        later.style.cssText = 'flex:none;padding:7px 8px;color:#9aa3ad;font-size:16px;line-height:1;cursor:pointer';
        later.onclick = function () { box.parentNode && box.parentNode.removeChild(box); };

        go.addEventListener('click', function () { writeTs(); });

        box.appendChild(txt);
        box.appendChild(go);
        box.appendChild(later);
        document.body.appendChild(box);
    }

    function handle(info) {
        if (!info || !info.version) return;
        if (!verNewer(LOCAL_VER, info.version)) return;
        writeTs();
        if (document.body) showTip(info);
        else window.addEventListener('load', function () { showTip(info); });
    }

    /* 通道 1：<script src> 加载 version.js —— 跨域不受 CORS 限制 */
    function viaScript() {
        var s = document.createElement('script');
        s.src = META_JS + '?t=' + Date.now();
        s.onload = function () {
            if (window.__VIA_UPD__) handle(window.__VIA_UPD__);
        };
        s.onerror = viaFetch;
        (document.head || document.documentElement).appendChild(s);
        setTimeout(function () {
            if (!window.__VIA_UPD__) viaFetch();
        }, 2500);
    }

    /* 通道 2：fetch 读 version.json —— 需要服务器允许跨域（GitHub Pages 允许） */
    function viaFetch() {
        if (typeof fetch !== 'function') return;
        try {
            fetch(META_JSON + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(handle)
                .catch(function () {});
        } catch (e) {}
    }

    function check() {
        if (Date.now() - readTs() < COOLDOWN_MS) return;
        viaScript();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(check, 800);
    } else {
        window.addEventListener('load', function () { setTimeout(check, 800); });
    }
})();
