// ==UserScript==
// @name         拾光解析
// @namespace    https://viayoo.com/86wod5
// @version      8.0.4
// @description  Via通用 · 聚合TV悬浮导航 · 底部抽屉界面 · 接口云端自动同步（跟随拾光映画接口源）
// @run-at       document-start
// @match        *://*/*
// @grant        none
// @all-frames   true
// ==/UserScript==

(function() {
    'use strict';

    if (window.__float_btn_loaded) return;
    window.__float_btn_loaded = true;

    // ================= 云端接口清单 =================
    // apis.js / apis.json 由 sync_apis.py 从「拾光映画接口源」同步后发布到 GitHub Pages
    const LOCAL_VER = '8.0.4';
    const CLOUD_SOURCES = [
        'https://tianxinshanbian.github.io/via-scripts',
        'https://cdn.jsdelivr.net/gh/tianxinshanbian/via-scripts@main'
    ];
    const CLOUD_BASE = CLOUD_SOURCES[0];
    const APIS_JS_URL = CLOUD_BASE + '/apis.js';
    const APIS_JSON_URL = CLOUD_BASE + '/apis.json';
    const VERSION_JS_URL = CLOUD_BASE + '/version.js';
    const LS_APIS = 'via_apis_cache_v2';
    const LS_PREFS = 'via_api_prefs_v2';
    const LS_APIS_AT = 'via_apis_pull_at';
    const LS_UPD_AT = 'via_ver_check_at';
    const PULL_GAP = 30 * 60 * 1000;
    const CHECK_GAP = 12 * 60 * 60 * 1000;

    // 云端拉不到时的内置兜底（与拾光映画当前接口源一致）
    const FALLBACK_APIS = [
        'https://art.txnp.cn/?url=',
        'https://jiexi.789jiexi.icu:4433/?url=',
        'https://bfq.txnp.cn/player?url=',
        'https://jx.nnxv.cn/tv.php?url=',
        'https://jx.202617.xyz/tv.php?url=',
        'https://im1907.top/?jx=',
        'https://z1.im1907.top/?jx=',
        'https://free.maccms.xyz/?url='
    ];
    const FALLBACK_DEFAULT = [
        'https://art.txnp.cn/?url=',
        'https://jiexi.789jiexi.icu:4433/?url='
    ];

    function strHash(s) {
        var h = 0;
        s = String(s || '');
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return Math.abs(h).toString(36);
    }

    function loadPrefs() {
        try { return JSON.parse(localStorage.getItem(LS_PREFS) || '{}') || {}; } catch (e) { return {}; }
    }

    function savePrefs() {
        try {
            var o = {};
            interfaces.forEach(function (i) { o[i.url] = (i.visible !== false); });
            localStorage.setItem(LS_PREFS, JSON.stringify(o));
        } catch (e) {}
    }

    function buildInterfaces(apis, defaults) {
        var list = (apis || []).map(function (u) { return String(u || '').trim(); }).filter(Boolean);
        var out = [];
        var used = {};
        list.forEach(function (url) {
            var host = url.replace(/^https?:\/\//i, '').split('/')[0] || url;
            var label = host;
            if (used[host]) { label = host + ' ' + used[host]; }
            used[host] = (used[host] || 0) + 1;
            out.push({
                name: label,
                url: url,
                id: 'a' + strHash(url),
                visible: true,
                isDefault: (defaults || []).indexOf(url) >= 0
            });
        });
        if (out.length && !out.some(function (x) { return x.isDefault; })) out[0].isDefault = true;
        return out;
    }

    var interfaces = buildInterfaces(FALLBACK_APIS, FALLBACK_DEFAULT);
    var apiMeta = { count: interfaces.length, updated_at: '', origin: '内置' };

    function applyInterfaceList(apis, defaults, meta) {
        var next = buildInterfaces(apis, defaults);
        if (!next.length) return false;
        var prefs = loadPrefs();
        next.forEach(function (i) { if (typeof prefs[i.url] === 'boolean') i.visible = prefs[i.url]; });
        interfaces = next;
        apiMeta = meta || { count: next.length, updated_at: '', origin: '云端' };
        return true;
    }

    function readApiCache() {
        try {
            var obj = JSON.parse(localStorage.getItem(LS_APIS) || 'null');
            if (!obj || !obj.apis || !obj.apis.length) return false;
            return applyInterfaceList(obj.apis, obj.default_apis || [], {
                count: obj.apis.length,
                updated_at: obj.updated_at || '',
                origin: '云端'
            });
        } catch (e) { return false; }
    }

    function loadRemoteScript(url, marker, timeout, cb) {
        var done = false;
        var node = null;
        function finish(obj) {
            if (done) return;
            done = true;
            try { if (node && node.parentNode) node.parentNode.removeChild(node); } catch (e) {}
            cb(obj);
        }
        try {
            node = document.createElement('script');
            node.src = url;
            node.async = true;
            node.onload = function () { finish(window[marker] || null); };
            node.onerror = function () { finish(null); };
            (document.head || document.documentElement).appendChild(node);
        } catch (e) { finish(null); return; }
        setTimeout(function () { finish(null); }, timeout || 4000);
    }

    function loadRemoteMulti(file, marker, timeout, cb) {
        var i = 0;
        function next() {
            if (i >= CLOUD_SOURCES.length) { cb(null); return; }
            var url = CLOUD_SOURCES[i++] + '/' + file + '?t=' + Date.now();
            loadRemoteScript(url, marker, timeout, function (obj) {
                if (obj) { cb(obj); } else { next(); }
            });
        }
        next();
    }

    function pullApis(force, done) {
        var now = Date.now();
        var last = 0;
        try { last = parseInt(localStorage.getItem(LS_APIS_AT) || '0', 10); } catch (e) {}
        if (!force && last && now - last < PULL_GAP) { if (done) done(false); return; }
        loadRemoteMulti('apis.js', '__VIA_APIS__', 3500, function (payload) {
            if (!payload || !payload.apis || !payload.apis.length) {
                if (done) done(false);
                return;
            }
            applyInterfaceList(payload.apis, payload.default_apis || [], {
                count: payload.apis.length,
                updated_at: payload.updated_at || '',
                origin: '云端'
            });
            try { localStorage.setItem(LS_APIS, JSON.stringify(payload)); } catch (e) {}
            try { localStorage.setItem(LS_APIS_AT, String(now)); } catch (e) {}
            if (done) done(true);
        });
    }

    // 启动即用本地缓存，随后按 30 分钟节流去云端刷新
    readApiCache();
    setTimeout(function () { pullApis(false); }, 800);

    const originalUA = navigator.userAgent.toLowerCase();
    
    function isIOS() {
        return /iphone|ipad|ipod/.test(originalUA) && !/android/.test(originalUA);
    }

    function isAndroid() {
        return /android/.test(originalUA);
    }

    const deviceType = isIOS() ? 'ios' : isAndroid() ? 'android' : 'other';

    function loadSettings() {
        try {
            const saved = localStorage.getItem('video_parser_settings_v3');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    simulateAndroid: parsed.simulateAndroid !== undefined ? parsed.simulateAndroid : (deviceType === 'ios'),
                    defaultInterfaceId: parsed.defaultInterfaceId || '',
                    autoFullscreen: parsed.autoFullscreen !== undefined ? parsed.autoFullscreen : false,
                    homeUrl: parsed.homeUrl || ''
                };
            }
        } catch (e) {}
        return {
            simulateAndroid: deviceType === 'ios',
            defaultInterfaceId: '',
            autoFullscreen: false,
            homeUrl: ''
        };
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem('video_parser_settings_v3', JSON.stringify(settings));
        } catch (e) {}
    }

    const settings = loadSettings();

    // ===== 聚合TV 主页地址（必须改成你安卓端打开聚合TV 的实际地址）=====
    // 示例：'file:///sdcard/聚合TV/index.html' 或 'https://你的域名/index.html'
    const HOME_URL = 'file:///sdcard/聚合TV/index.html';

    function simulateAndroid() {
        if (!settings.simulateAndroid) return;
        
        try {
            const androidUA = 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
            
            Object.defineProperty(navigator, 'userAgent', {
                value: androidUA,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'platform', {
                value: 'Linux armv8l',
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'vendor', {
                value: 'Google Inc.',
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                value: 8,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'maxTouchPoints', {
                value: 10,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'language', {
                value: 'zh-CN',
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'languages', {
                value: ['zh-CN', 'zh', 'en-US', 'en'],
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'userAgentData', {
                value: {
                    brands: [
                        { brand: 'Google Chrome', version: '120' },
                        { brand: 'Chromium', version: '120' },
                        { brand: 'Not_A Brand', version: '99' }
                    ],
                    mobile: true,
                    platform: 'Android',
                    getHighEntropyValues: async () => ({
                        platformVersion: '13',
                        model: 'SM-G998B',
                        architecture: 'arm',
                        uaFullVersion: '120.0.0.0',
                        fullVersionList: [
                            { brand: 'Google Chrome', version: '120.0.0.0' },
                            { brand: 'Chromium', version: '120.0.6099.109' }
                        ]
                    })
                },
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'connection', {
                value: {
                    effectiveType: '4g',
                    type: 'cellular',
                    downlink: 10,
                    rtt: 50,
                    saveData: false,
                    onchange: null
                },
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(navigator, 'deviceMemory', {
                value: 8,
                writable: false,
                enumerable: true,
                configurable: true
            });

            Object.defineProperty(window, 'devicePixelRatio', {
                value: 3,
                writable: false,
                enumerable: true,
                configurable: true
            });

            Object.defineProperty(window.screen, 'width', {
                value: 1080,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(window.screen, 'height', {
                value: 2400,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(window.screen, 'availWidth', {
                value: 1080,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(window.screen, 'availHeight', {
                value: 2300,
                writable: false,
                enumerable: true,
                configurable: true
            });
            
            Object.defineProperty(window.screen, 'orientation', {
                value: {
                    type: 'portrait-primary',
                    angle: 0,
                    onchange: null,
                    lock: async () => {},
                    unlock: () => {}
                },
                writable: false,
                enumerable: true,
                configurable: true
            });

            window.Android = {
                appVersion: '13',
                os: 'Android',
                version: '13',
                getVersion: () => '13',
                getOS: () => 'Android',
                getDeviceId: () => 'android_' + Math.random().toString(36).substr(2, 15),
                getIMEI: () => '123456789012345',
                getIMSI: () => '460001234567890',
                getPhoneNumber: () => '',
                isAppInstalled: (pkg) => false,
                openApp: (pkg) => {},
                closeApp: () => {},
                share: (text) => {},
                copyToClipboard: (text) => {},
                vibrate: (ms) => {},
                toast: (msg) => {},
                getNetworkType: () => '4G',
                isWifi: () => false,
                isMobile: () => true,
                getBatteryLevel: () => 0.85,
                isCharging: () => false,
                hasPermission: (perm) => true,
                requestPermission: (perm, cb) => { cb(true); },
                downloadFile: (url, name) => {},
                openUrl: (url) => { location.href = url; },
                setClipboardText: (text) => {},
                getClipboardText: () => '',
                getAppName: () => 'Via',
                getPackageName: () => 'mark.via',
                getBuildModel: () => 'SM-G998B',
                getBuildBrand: () => 'samsung',
                getBuildManufacturer: () => 'samsung',
                getBuildVersionRelease: () => '13',
                getBuildSDKVersion: () => 33,
                isRooted: () => false,
                getAndroidId: () => 'abc1234567890def',
                getSerialNumber: () => 'SMG998B123456789',
                getMacAddress: () => '00:11:22:33:44:55',
                getWifiSSID: () => '',
                getWifiBSSID: () => '',
                getLocation: (cb) => { cb({ lat: 39.9042, lng: 116.4074 }); },
                getBrightness: () => 200,
                setBrightness: (val) => {},
                getVolume: () => 70,
                setVolume: (val) => {},
                toggleFlashlight: (on) => {},
                isFlashlightAvailable: () => true,
                takeScreenshot: () => {},
                recordScreen: (start) => {},
                startActivity: (pkg) => {},
                sendBroadcast: (action, extras) => {},
                registerReceiver: (action, cb) => {},
                unregisterReceiver: (action) => {},
                getSharedPreferences: (name) => ({
                    getString: (key, def) => def || '',
                    getInt: (key, def) => def || 0,
                    getBoolean: (key, def) => def || false,
                    putString: (key, val) => {},
                    putInt: (key, val) => {},
                    putBoolean: (key, val) => {},
                    commit: () => true
                }),
                showToast: (msg, duration) => {},
                showDialog: (title, msg) => {},
                showProgress: (msg) => {},
                hideProgress: () => {},
                selectFile: (cb) => {},
                selectImage: (cb) => {},
                selectVideo: (cb) => {},
                captureImage: (cb) => {},
                getExternalStoragePath: () => '/sdcard',
                readFile: (path) => '',
                writeFile: (path, content) => {},
                deleteFile: (path) => {},
                existsFile: (path) => false,
                listFiles: (path) => [],
                createDirectory: (path) => {},
                getFileSize: (path) => 0,
                getFileLastModified: (path) => Date.now(),
                openFile: (path) => {},
                installApk: (path) => {},
                uninstallApp: (pkg) => {},
                getInstalledPackages: () => [],
                getRunningProcesses: () => [],
                killProcess: (pid) => {},
                getProcessId: () => 1234,
                getProcessName: () => 'mark.via',
                getSystemService: (name) => ({}),
                getActivity: () => ({}),
                getApplicationContext: () => ({}),
                getResources: () => ({
                    getString: (id) => '',
                    getColor: (id) => 0xFF000000,
                    getDimension: (id) => 0,
                    getDrawable: (id) => ({})
                }),
                getDisplayMetrics: () => ({
                    widthPixels: 1080,
                    heightPixels: 2400,
                    density: 3,
                    densityDpi: 480,
                    scaledDensity: 3
                }),
                runOnUiThread: (runnable) => { runnable(); },
                postDelayed: (runnable, delay) => setTimeout(runnable, delay),
                removeCallbacks: (runnable) => {}
            };

            window.android = window.Android;

            Object.defineProperty(window, 'webkit', {
                value: {
                    messageHandlers: {
                        AndroidInterface: {
                            postMessage: (msg) => {}
                        }
                    },
                    WebStorage: {
                        localStorage: window.localStorage,
                        sessionStorage: window.sessionStorage
                    }
                },
                writable: false,
                enumerable: true,
                configurable: true
            });

            const appSchemes = ['baiduboxapp://', 'snssdk1128://', 'douyin://', 'aweme://', 
                                'qqmusic://', 'y.qq.com://', 'v.qq.com://', 'tenvideo://',
                                'iqiyi://', 'youku://', 'le://', 'letv://',
                                'mgtv://', 'sohu://', 'pptv://', 'kugou://',
                                'kuwo://', 'xiami://', 'neteasecloudmusic://',
                                'taobao://', 'tmall://', 'jd://', 'pinduoduo://',
                                'meituan://', 'eleme://', 'dianping://', 'ctrip://',
                                'fliggy://', 'alibaba://', 'wx://', 'wechat://',
                                'weixin://', 'qq://', 'sinaweibo://', 'weibo://',
                                'zhihu://', 'bilibili://', 'bili://', 'acfun://',
                                'kuaishou://', 'pipixia://', 'xiaohongshu://', 'zhuanlan://',
                                'toutiao://', 'newsapp://', 'ucbrowser://', 'uc://',
                                'cmbrowser://', 'qqbrowser://', 'baidu://',
                                'alipays://', 'alipay://', 'mybank://', 'cmbchina://',
                                'icbc://', 'ccb://', 'bankcomm://', 'spdb://',
                                'citic://', 'ceb://', 'hxb://', 'psbc://',
                                'abc://', 'boc://', 'cgb://', 'pingan://',
                                'cmbc://', 'bos://', 'czb://', 'shbank://',
                                'everbright://', 'zgyh://', 'hkb://', 'hkbea://',
                                'scb://', 'bocom://', 'cdb://', 'sdb://',
                                'ncb://', 'gcb://', 'jsb://', 'njcb://',
                                'hzcb://', 'czbank://', 'qcb://', 'ccqcb://',
                                'nbcb://', 'ltcb://', 'zbcb://', 'dycb://',
                                'jscb://', 'sccb://', 'csb://', 'wcb://',
                                'qzccb://', 'tzcb://', 'cdccb://', 'mycb://',
                                'ycbc://', 'gycb://', 'xzcb://', 'lycb://',
                                'ljcb://', 'hlcb://', 'dccb://', 'kccb://',
                                'jlcb://', 'sycb://', 'dlcb://', 'ccbsh://',
                                'bccb://', 'hebcb://', 'hbccb://', 'sxccb://',
                                'hnccb://', 'gdccb://', 'gxccb://', 'ynccb://',
                                'xzccb://', 'nxccb://', 'gsccb://', 'qhccb://',
                                'xjccb://', 'xjbc://', 'xjkb://', 'xjzc://',
                                'xjys://', 'xjny://', 'xjwx://', 'xjty://',
                                'xjxd://', 'xjyc://', 'xjgx://', 'xjhs://',
                                'xjqx://', 'xjxs://', 'xjzy://', 'xjhh://',
                                'xjxy://', 'xjkh://', 'xjly://', 'xjsw://',
                                'xjxc://', 'xjpf://', 'xjqd://', 'xjzd://',
                                'xjqt://', 'xjzs://', 'xjwd://', 'xjdx://',
                                'xjhd://', 'xjmt://', 'xjjt://', 'xjlc://',
                                'xjzc://', 'xjhb://', 'xjsc://', 'xjyc://',
                                'xjzx://', 'xjqx://', 'xjhs://', 'xjxd://',
                                'xjpf://', 'xjqd://', 'xjzd://', 'xjqt://'];

            window.addEventListener('beforeunload', (e) => {
                const currentUrl = location.href.toLowerCase();
                for (const scheme of appSchemes) {
                    if (currentUrl.includes(scheme.toLowerCase())) {
                        e.preventDefault();
                        e.returnValue = '';
                        break;
                    }
                }
            });

            document.addEventListener('click', (e) => {
                const target = e.target.closest('a, button');
                if (target) {
                    const href = target.getAttribute('href') || '';
                    const onClick = target.getAttribute('onclick') || '';
                    for (const scheme of appSchemes) {
                        if (href.toLowerCase().includes(scheme.toLowerCase()) || 
                            onClick.toLowerCase().includes(scheme.toLowerCase())) {
                            e.preventDefault();
                            e.stopPropagation();
                            break;
                        }
                    }
                }
            }, true);

            const originalOpen = window.open;
            window.open = function(url, name, features) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return null;
                        }
                    }
                }
                return originalOpen.call(this, url, name, features);
            };

            const originalLocationAssign = window.location.assign;
            window.location.assign = function(url) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return;
                        }
                    }
                }
                return originalLocationAssign.call(this, url);
            };

            const originalLocationReplace = window.location.replace;
            window.location.replace = function(url) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return;
                        }
                    }
                }
                return originalLocationReplace.call(this, url);
            };

            navigator.getBattery = function() {
                return Promise.resolve({
                    level: 0.85,
                    charging: false,
                    chargingTime: Infinity,
                    dischargingTime: 3600,
                    onlevelchange: null,
                    onchargingchange: null,
                    onchargingtimechange: null,
                    ondischargingtimechange: null
                });
            };

            navigator.permissions = {
                query: async (desc) => {
                    return {
                        state: 'granted',
                        name: desc.name,
                        onchange: null
                    };
                },
                request: async (desc) => {
                    return {
                        state: 'granted',
                        name: desc.name,
                        onchange: null
                    };
                }
            };

            if (!navigator.geolocation) {
                navigator.geolocation = {
                    getCurrentPosition: (success, error, options) => {
                        success({
                            coords: {
                                latitude: 39.9042,
                                longitude: 116.4074,
                                accuracy: 100,
                                altitude: null,
                                altitudeAccuracy: null,
                                heading: null,
                                speed: null
                            },
                            timestamp: Date.now()
                        });
                    },
                    watchPosition: (success, error, options) => {
                        success({
                            coords: {
                                latitude: 39.9042,
                                longitude: 116.4074,
                                accuracy: 100,
                                altitude: null,
                                altitudeAccuracy: null,
                                heading: null,
                                speed: null
                            },
                            timestamp: Date.now()
                        });
                        return 1;
                    },
                    clearWatch: (id) => {}
                };
            }

            window.matchMedia = function(query) {
                const matches = query.includes('max-width') ? window.innerWidth <= parseInt(query.match(/\d+/)[0]) :
                               query.includes('min-width') ? window.innerWidth >= parseInt(query.match(/\d+/)[0]) :
                               query.includes('orientation: portrait') ? window.innerHeight > window.innerWidth :
                               query.includes('orientation: landscape') ? window.innerWidth > window.innerHeight :
                               false;
                
                return {
                    matches: matches,
                    media: query,
                    onchange: null,
                    addListener: () => {},
                    removeListener: () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => false
                };
            };

            window.addEventListener('resize', () => {});
            window.addEventListener('orientationchange', () => {});
            
            const originalHistoryPushState = history.pushState;
            history.pushState = function(state, title, url) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return;
                        }
                    }
                }
                return originalHistoryPushState.call(this, state, title, url);
            };

            const originalHistoryReplaceState = history.replaceState;
            history.replaceState = function(state, title, url) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return;
                        }
                    }
                }
                return originalHistoryReplaceState.call(this, state, title, url);
            };

            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            return Promise.resolve(new Response(JSON.stringify({ error: 'Scheme not allowed' }), { status: 400 }));
                        }
                    }
                }
                return originalFetch.call(this, url, options);
            };

            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (typeof url === 'string') {
                    for (const scheme of appSchemes) {
                        if (url.toLowerCase().includes(scheme.toLowerCase())) {
                            this._blocked = true;
                            return;
                        }
                    }
                }
                return originalXHROpen.apply(this, arguments);
            };

            const originalXHRSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(data) {
                if (this._blocked) {
                    this.status = 400;
                    this.statusText = 'Bad Request';
                    this.responseText = JSON.stringify({ error: 'Scheme not allowed' });
                    if (this.onreadystatechange) {
                        this.readyState = 4;
                        this.onreadystatechange();
                    }
                    return;
                }
                return originalXHRSend.apply(this, arguments);
            };
        } catch (e) {
            console.error('Simulate Android error:', e);
        }
    }

    simulateAndroid();

    function initScript() {
        if (document.body) {
            createBtn();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                createBtn();
            });
            setTimeout(() => {
                if (document.body) createBtn();
            }, 500);
            setTimeout(() => {
                if (document.body) createBtn();
            }, 1500);
            setTimeout(() => {
                if (document.body) createBtn();
            }, 3000);
            setTimeout(() => {
                if (document.body) createBtn();
            }, 5000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
        document.addEventListener('load', initScript);
    } else {
        initScript();
    }
    
    if (window.top === window.self) {
        setTimeout(() => {
            if (!document.getElementById('floatBtn') && document.body) {
                createBtn();
            }
        }, 2000);
    }

    // ============ 界面：底部抽屉（Via 手机端习惯） ============
    const DEFAULT_HOME_URL = 'file:///sdcard/聚合TV/index.html';

    // 解析站自身不显示悬浮球（避免在解析页里套娃）
    const PARSER_DOMAINS = [
        'nnxv.cn', 'xmflv.com', '202617.xyz', '789jiexi.icu', 'bfq.txnp.cn',
        'jx.2s0.cn', 'jx.dmflv.cc', 'video.isyour.love', 'vip.xilibo.com',
        'jx.77flv.cc', 'jx.flvcd.com', 'jx.qqwtt.com', 'jx.wmxz.wang',
        'txnp.cn', 'im1907.top', 'maccms.xyz'
    ];

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function apiStatusText() {
        return (apiMeta.count || interfaces.length) + ' 条 · ' + apiMeta.origin;
    }

    function injectUiStyle() {
        if (document.getElementById('viaPxStyle')) return;
        const st = document.createElement('style');
        st.id = 'viaPxStyle';
        st.textContent = `
#viaPxRoot{position:fixed;inset:0;pointer-events:none;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
#viaPxFab{position:fixed;right:16px;bottom:96px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ff8a2b,#ff4400);color:#fff;font-size:26px;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,68,0,.45);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .18s,opacity .22s;z-index:2;}
#viaPxFab.hide{opacity:0;pointer-events:none;transform:scale(.65);}
#viaPxFab.press{transform:scale(.9);}
#viaPxMask{position:fixed;inset:0;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .22s;z-index:3;}
#viaPxMask.on{opacity:1;pointer-events:auto;}
#viaPxSheet{position:fixed;left:0;right:0;bottom:0;background:#151821;color:#e8eaed;border-radius:20px 20px 0 0;
 box-shadow:0 -8px 28px rgba(0,0,0,.5);transform:translateY(106%);transition:transform .28s cubic-bezier(.22,.9,.3,1);
 z-index:4;max-height:78vh;display:flex;flex-direction:column;pointer-events:auto;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));}
#viaPxSheet.on{transform:translateY(0);}
.viaPxGrip{width:38px;height:4px;border-radius:2px;background:#3a3f4b;margin:9px auto 2px;flex:none;}
#viaPxMain{padding:2px 16px 12px;overflow-y:auto;}
.viaPxHead{display:flex;align-items:center;justify-content:space-between;margin:6px 0 12px;}
.viaPxTitle{font-size:17px;font-weight:600;letter-spacing:.5px;}
.viaPxMeta{display:block;font-size:11px;color:#8b93a1;margin:-6px 0 10px;}.viaPxVer{font-size:11px;color:#8b93a1;}
.viaPxGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.viaPxCard{min-width:0;background:#1d2230;border:1px solid #262c3b;border-radius:14px;padding:11px 12px;color:#e8eaed;
 text-align:left;display:flex;flex-direction:column;gap:3px;min-height:62px;cursor:pointer;font-size:13px;
 transition:background .15s,border-color .15s;}
.viaPxCard:active{background:#252c3d;}
.viaPxCard.def{border-color:#ff7a18;background:#241a12;}
.viaPxCard .nm{font-weight:600;word-break:break-all;line-height:1.25;}
.viaPxCard .sub{font-size:11px;color:#8b93a1;}
.viaPxCard .sub.on{color:#ff9440;}
.viaPxEmpty{grid-column:1/-1;color:#8b93a1;font-size:13px;padding:24px 0;text-align:center;}
.viaPxBar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:14px;}
.viaPxBar.single{grid-template-columns:minmax(0,1fr);}
.viaPxBar button{padding:11px 2px;border-radius:12px;border:none;background:#222839;color:#dfe3ea;
 font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;overflow:hidden;}
.viaPxBar button:active{background:#2b3348;}
.viaPxBar .ghost{background:#191d28;color:#9aa3b2;}
#viaPxSettings{padding:2px 16px 8px;overflow-y:auto;display:none;}
.viaPxSec{font-size:12px;color:#8b93a1;margin:10px 0 4px;}
.viaPxRow{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #232838;}
.viaPxRow .l{font-size:14px;color:#e8eaed;}
.viaPxRow .l i{display:block;font-size:11px;color:#8b93a1;font-style:normal;margin-top:2px;}
.viaPxRow .r{display:flex;align-items:center;gap:12px;}
.viaPxRow input[type="radio"]{width:19px;height:19px;accent-color:#ff7a18;}
.viaPxSw{position:relative;display:inline-block;width:42px;height:24px;flex:none;cursor:pointer;}
.viaPxSw input{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;opacity:0;z-index:3;cursor:pointer;
 -webkit-appearance:none;appearance:none;border:0;background:transparent;}
.viaPxSw i{pointer-events:none;position:absolute;inset:0;background:#2c3244;border-radius:12px;transition:background .2s;}
.viaPxSw i:after{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;}
.viaPxSw input:checked + i{background:#ff6a00;}
.viaPxSw input:checked + i:after{transform:translateX(18px);}
.viaPxInput{width:100%;margin-top:6px;padding:9px 12px;border-radius:10px;border:1px solid #2c3244;
 background:#11141d;color:#e8eaed;font-size:12px;font-family:inherit;box-sizing:border-box;}
.viaPxMini{padding:6px 12px;border-radius:10px;border:1px solid #3a4155;background:#1d2230;color:#ff9a4d;
 font-size:12px;cursor:pointer;font-family:inherit;flex:none;}
.viaPxMini:active{background:#252c3d;}
.viaPxVer{font-size:11px;color:#6d7484;text-align:center;margin:12px 0 4px;}
.viaPxMsg{position:fixed;left:50%;bottom:32%;transform:translateX(-50%);background:rgba(20,22,30,.94);
 color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:2147483646;opacity:0;
 transition:opacity .2s;pointer-events:none;max-width:80vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.4);}
.viaPxMsg.on{opacity:1;}
#viaUpdBar{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1f2329;color:#fff;
 font-size:13px;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:12px;
 box-shadow:0 -3px 14px rgba(0,0,0,.45);font-family:-apple-system,"PingFang SC",sans-serif;}
video{display:block !important;opacity:1 !important;visibility:visible !important;}
iframe{display:block !important;opacity:1 !important;visibility:visible !important;}
`;
        document.head.appendChild(st);
    }

    // 主页按钮的兜底地址（设置里可改）
    if (window.top === window.self) {
        setTimeout(function () {
            if (!document.getElementById('viaPxFab') && document.body) createBtn();
        }, 2000);
    }

    function createBtn() {
        if (document.getElementById('viaPxFab')) return;
        try {
            const host = (window.location.hostname || '').toLowerCase();
            for (let d = 0; d < PARSER_DOMAINS.length; d++) {
                if (host.indexOf(PARSER_DOMAINS[d]) >= 0) return;
            }
            if (!document.head || !document.body) return;

            injectUiStyle();

            const root = document.createElement('div');
            root.id = 'viaPxRoot';
            root.innerHTML = `
<div id="viaPxMask"></div>
<div id="viaPxFab">⚡</div>
<div id="viaPxSheet">
  <div class="viaPxGrip"></div>
  <div id="viaPxMain">
    <div class="viaPxHead"><span class="viaPxTitle">视频解析</span></div><div class="viaPxMeta" id="viaPxMeta"></div>
    <div class="viaPxGrid" id="viaPxGrid"></div>
    <div class="viaPxBar">
      <button data-act="home">🏠 主页</button>
      <button data-act="copy">📋 复制</button>
      <button data-act="settings">⚙️ 设置</button>
      <button data-act="close" class="ghost">关闭</button>
    </div>
  </div>
  <div id="viaPxSettings"></div>
</div>
<div class="viaPxMsg" id="viaPxMsg"></div>`;
            document.body.appendChild(root);
            window.__viaPxRoot = root;

            const fab = root.querySelector('#viaPxFab');
            const mask = root.querySelector('#viaPxMask');
            const sheet = root.querySelector('#viaPxSheet');
            const msg = root.querySelector('#viaPxMsg');
            const grid = root.querySelector('#viaPxGrid');
            const metaEl = root.querySelector('#viaPxMeta');
            const mainView = root.querySelector('#viaPxMain');
            const setView = root.querySelector('#viaPxSettings');

            let msgTimer = null;
            function tip(text) {
                msg.textContent = text;
                msg.classList.add('on');
                if (msgTimer) clearTimeout(msgTimer);
                msgTimer = setTimeout(function () { msg.classList.remove('on'); }, 2000);
            }
            window.__viaPxToast = tip;

            function openSheet() {
                renderGrid();
                mainView.style.display = 'block';
                setView.style.display = 'none';
                mask.classList.add('on');
                sheet.classList.add('on');
            }
            function closeSheet() {
                mask.classList.remove('on');
                sheet.classList.remove('on');
            }

            function renderGrid() {
                const list = interfaces.filter(function (i) { return i.visible !== false; });
                metaEl.textContent = apiStatusText();
                if (!list.length) {
                    grid.innerHTML = '<div class="viaPxEmpty">没有启用接口，去「设置」里打开</div>';
                    return;
                }
                let html = '';
                list.forEach(function (i) {
                    html += '<button class="viaPxCard' + (i.isDefault ? ' def' : '') + '" data-url="' + escHtml(i.url) + '">'
                        + '<span class="nm">' + escHtml(i.name) + '</span>'
                        + '<span class="sub' + (i.isDefault ? ' on' : '') + '">' + (i.isDefault ? '默认接口' : '点击解析') + '</span></button>';
                });
                grid.innerHTML = html;
            }

            function renderSettings() {
                let html = '<div class="viaPxHead"><span class="viaPxTitle">设置</span><span class="viaPxVer">' + LOCAL_VER + '</span></div>';
                html += '<div class="viaPxRow"><span class="l">云端清单<i>' + escHtml(apiStatusText() + (apiMeta.updated_at ? ' · ' + apiMeta.updated_at.slice(5, 16) : '')) + '</i></span>'
                    + '<button class="viaPxMini" data-act="sync">立即同步</button></div>';
                html += '<div class="viaPxRow"><span class="l">脚本版本<i>' + escHtml(LOCAL_VER) + '</i></span>'
                    + '<button class="viaPxMini" data-act="checkver">检查更新</button></div>';
                html += '<div class="viaPxSec">默认接口 · 右侧开关控制是否显示</div>';
                interfaces.forEach(function (i, idx) {
                    html += '<div class="viaPxRow"><span class="l">' + escHtml(i.name) + '</span><span class="r">'
                        + '<input type="radio" name="viaPxDef" data-idx="' + idx + '"' + (i.isDefault ? ' checked' : '') + '>'
                        + '<span class="viaPxSw"><input type="checkbox" data-vis="' + idx + '"' + (i.visible !== false ? ' checked' : '') + '><i></i></span>'
                        + '</span></div>';
                });
                html += '<div class="viaPxSec">浏览器行为</div>';
                html += '<div class="viaPxRow"><span class="l">自动全屏<i>视频开始播放就全屏</i></span>'
                    + '<span class="viaPxSw"><input type="checkbox" id="viaPxFull"' + (settings.autoFullscreen ? ' checked' : '') + '><i></i></span></div>';
                html += '<div class="viaPxRow"><span class="l">模拟安卓手机<i>改 UA / 拦截 App 跳转</i></span>'
                    + '<span class="viaPxSw"><input type="checkbox" id="viaPxSim"' + (settings.simulateAndroid ? ' checked' : '') + '><i></i></span></div>';
                html += '<div class="viaPxRow" style="display:block"><span class="l">主页地址<i>点「🏠 主页」跳这里</i></span>'
                    + '<input class="viaPxInput" id="viaPxHome" placeholder="留空则「🏠 主页」不可用；可填 https://… 或 App 打开地址" value="' + escHtml(settings.homeUrl || '') + '"></div>';
                html += '<div class="viaPxSec">关于</div>';
                html += '<div class="viaPxBar single" style="margin-top:16px"><button data-act="back" class="ghost">返回</button></div>';
                html += '<div class="viaPxVer">接口源：拾光映画 · 分发：GitHub Pages / jsDelivr</div>';
                setView.innerHTML = html;
            }

            function parseWith(url) {
                if (!url) return;
                try {
                    const t = document.createElement('textarea');
                    t.value = location.href;
                    t.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
                    document.body.appendChild(t);
                    t.select();
                    document.execCommand('copy');
                    document.body.removeChild(t);
                } catch (e) {}
                closeSheet();
                location.href = url + encodeURIComponent(location.href);
            }

            function defaultUrl() {
                const d = interfaces.filter(function (i) { return i.isDefault && i.visible !== false; })[0]
                    || interfaces.filter(function (i) { return i.visible !== false; })[0];
                return d ? d.url : '';
            }

            // ---- 悬浮球：拖动 + 单击开面板 + 双击直解 ----
            let drag = { on: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false };
            let lastTap = 0;
            let suppressClick = false;

            function posStart(cx, cy) {
                const r = fab.getBoundingClientRect();
                drag.on = true; drag.moved = false;
                drag.sx = cx; drag.sy = cy; drag.ox = r.left; drag.oy = r.top;
                fab.style.transition = 'none';
                fab.classList.add('press');
            }
            function posMove(cx, cy, evt) {
                if (!drag.on) return;
                const dx = cx - drag.sx, dy = cy - drag.sy;
                if (!drag.moved && (Math.abs(dx) + Math.abs(dy)) < 8) return;
                drag.moved = true;
                const w = fab.offsetWidth, h = fab.offsetHeight;
                let nx = Math.min(Math.max(0, drag.ox + dx), window.innerWidth - w);
                let ny = Math.min(Math.max(0, drag.oy + dy), window.innerHeight - h);
                fab.style.left = nx + 'px';
                fab.style.top = ny + 'px';
                fab.style.right = 'auto';
                fab.style.bottom = 'auto';
                if (evt && evt.cancelable) evt.preventDefault();
            }
            function posEnd() {
                if (!drag.on) return;
                drag.on = false;
                fab.classList.remove('press');
                fab.style.transition = '';
                if (drag.moved) {
                    suppressClick = true;
                    try {
                        localStorage.setItem('via_fab_pos', JSON.stringify({ l: fab.style.left, t: fab.style.top }));
                    } catch (e) {}
                    setTimeout(function () { suppressClick = false; }, 60);
                }
            }
            fab.addEventListener('touchstart', function (e) { const t = e.touches[0]; posStart(t.clientX, t.clientY); }, { passive: true });
            fab.addEventListener('touchmove', function (e) { const t = e.touches[0]; posMove(t.clientX, t.clientY, e); }, { passive: false });
            fab.addEventListener('touchend', posEnd);
            fab.addEventListener('mousedown', function (e) { posStart(e.clientX, e.clientY); });
            window.addEventListener('mousemove', function (e) { posMove(e.clientX, e.clientY, e); });
            window.addEventListener('mouseup', posEnd);

            fab.addEventListener('click', function (e) {
                e.stopPropagation();
                if (suppressClick) return;
                const now = Date.now();
                if (now - lastTap < 300) {
                    lastTap = 0;
                    closeSheet();
                    parseWith(defaultUrl());
                    return;
                }
                lastTap = now;
                if (sheet.classList.contains('on')) { closeSheet(); } else { openSheet(); }
            });

            // 恢复上次拖动位置
            try {
                const saved = JSON.parse(localStorage.getItem('via_fab_pos') || 'null');
                if (saved && saved.l && saved.t) {
                    fab.style.left = saved.l; fab.style.top = saved.t;
                    fab.style.right = 'auto'; fab.style.bottom = 'auto';
                }
            } catch (e) {}

            mask.addEventListener('click', closeSheet);

            grid.addEventListener('click', function (e) {
                const card = e.target.closest('.viaPxCard');
                if (card && card.dataset.url) parseWith(card.dataset.url);
            });

            mainView.addEventListener('click', function (e) {
                const btn = e.target.closest('button[data-act]');
                if (!btn) return;
                const act = btn.dataset.act;
                if (act === 'close') { closeSheet(); return; }
                if (act === 'copy') {
                    try {
                        const t = document.createElement('textarea');
                        t.value = location.href;
                        t.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
                        document.body.appendChild(t); t.select(); document.execCommand('copy');
                        document.body.removeChild(t);
                        tip('✅ 已复制当前链接');
                    } catch (err) { tip('复制失败'); }
                    return;
                }
                if (act === 'home') {
                    const home = (settings.homeUrl || '').trim();
                    if (!home) { tip('主页地址还没填，去「设置」里填一个'); return; }
                    closeSheet();
                    if (window.Android && window.Android.openUrl) window.Android.openUrl(home);
                    else location.href = home;
                    return;
                }
                if (act === 'settings') {
                    renderSettings();
                    mainView.style.display = 'none';
                    setView.style.display = 'block';
                    return;
                }
            });

            setView.addEventListener('click', function (e) {
                const btn = e.target.closest('button[data-act]');
                if (!btn) return;
                const act = btn.dataset.act;
                if (act === 'back') {
                    saveSettings(settings);
                    renderGrid();
                    setView.style.display = 'none';
                    mainView.style.display = 'block';
                } else if (act === 'sync') {
                    tip('⏳ 正在同步接口…');
                    btn.disabled = true;
                    pullApis(true, function (ok) {
                        btn.disabled = false;
                        if (ok) { saveSettings(settings); tip('✅ 已同步 ' + apiMeta.count + ' 条'); }
                        else { tip('❌ 同步失败（GitHub / jsDelivr 都不通），先用本机接口'); }
                        renderSettings();
                    });
                } else if (act === 'checkver') {
                    tip('⏳ 正在检查更新…');
                    checkVersion(true);
                }
            });

            setView.addEventListener('change', function (e) {
                const t = e.target;
                if (t.name === 'viaPxDef') {
                    const idx = parseInt(t.dataset.idx, 10);
                    interfaces.forEach(function (i, k) { i.isDefault = (k === idx); });
                    settings.defaultInterfaceId = interfaces[idx].id;
                    saveSettings(settings);
                } else if (t.dataset.vis !== undefined) {
                    const idx = parseInt(t.dataset.vis, 10);
                    interfaces[idx].visible = !!t.checked;
                    savePrefs();
                } else if (t.id === 'viaPxFull') {
                    settings.autoFullscreen = !!t.checked;
                    saveSettings(settings);
                } else if (t.id === 'viaPxSim') {
                    settings.simulateAndroid = !!t.checked;
                    saveSettings(settings);
                    if (settings.simulateAndroid && !window.__simulated) {
                        simulateAndroid();
                        window.__simulated = true;
                        tip('已开启，刷新页面后完全生效');
                    } else if (!settings.simulateAndroid) {
                        tip('已关闭，刷新页面后生效');
                    }
                }
            });

            setView.addEventListener('focusout', function (e) {
                if (e.target.id === 'viaPxHome') {
                    const v = (e.target.value || '').trim();
                    settings.homeUrl = v;
                    saveSettings(settings);
                    e.target.value = v;
                    tip('主页地址已保存');
                }
            });

            // ---- 播放时收起，暂停/结束后回来 ----
            let hideTimer = null;
            function softHide() {
                fab.classList.add('hide');
                if (sheet.classList.contains('on')) closeSheet();
            }
            function softShow() {
                if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                fab.classList.remove('hide');
            }
            function requestVideoFullscreen(el) {
                try {
                    if (el.requestFullscreen) return el.requestFullscreen();
                    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
                    if (el.webkitEnterFullscreen) return el.webkitEnterFullscreen();
                    if (el.msRequestFullscreen) return el.msRequestFullscreen();
                } catch (e) {}
                return Promise.reject(new Error('no fullscreen'));
            }
            function onVideoPlay(v) {
                softHide();
                if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                    requestVideoFullscreen(v).catch(function () {
                        requestVideoFullscreen(document.documentElement).catch(function () {});
                    });
                }
            }
            document.addEventListener('play', function (e) {
                if (e.target && e.target.tagName === 'VIDEO') onVideoPlay(e.target);
            }, true);
            document.addEventListener('pause', function (e) {
                if (e.target && e.target.tagName === 'VIDEO') {
                    if (hideTimer) clearTimeout(hideTimer);
                    hideTimer = setTimeout(function () { softShow(); }, 1500);
                }
            }, true);
            document.addEventListener('ended', function (e) {
                if (e.target && e.target.tagName === 'VIDEO') softShow();
            }, true);
            document.addEventListener('webkitbeginfullscreen', softHide);
            document.addEventListener('fullscreenchange', function () {
                if (document.fullscreenElement) softHide(); else softShow();
            });

            // ---- 页面清理掉节点时自动补回 ----
            setInterval(function () {
                if (!document.body) return;
                if (!document.getElementById('viaPxRoot')) {
                    document.body.appendChild(root);
                } else if (!document.getElementById('viaPxFab')) {
                    document.body.appendChild(fab);
                }
            }, 2000);

            renderGrid();
        } catch (e) {
            console.error('viaPx createBtn error:', e);
        }
    }

    // ---- 版本自更新提示 ----
    function isNewerVer(a, b) {
        const pa = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        const pb = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x !== y) return x > y;
        }
        return false;
    }

    function showUpdateBar(meta) {
        if (document.getElementById('viaUpdBar')) return;
        const bar = document.createElement('div');
        bar.id = 'viaUpdBar';
        bar.innerHTML = '<span style="flex:1;">发现新版本 ' + escHtml(meta.version) + '（当前 ' + LOCAL_VER + '）</span>'
            + '<a href="' + escHtml(meta.url || '') + '" style="color:#5ea8ff;text-decoration:none;font-weight:600;padding:4px;">立即更新</a>'
            + '<span data-close="1" style="padding:0 8px;color:#8b93a1;font-size:18px;line-height:1;cursor:pointer;">×</span>';
        bar.addEventListener('click', function (e) {
            if (e.target.getAttribute('data-close')) bar.remove();
        });
        document.body.appendChild(bar);
    }

    function checkVersion(force) {
        if (!document.body) return;
        let last = 0;
        try { last = parseInt(localStorage.getItem(LS_UPD_AT) || '0', 10); } catch (e) {}
        if (!force && last && Date.now() - last < CHECK_GAP) return;
        loadRemoteMulti('version.js', '__VIA_UPD__', 3500, function (m) {
            try { localStorage.setItem(LS_UPD_AT, String(Date.now())); } catch (e) {}
            if (!m || !m.version) {
                if (force && window.__viaPxToast) window.__viaPxToast('更新源不可达，稍后再试');
                return;
            }
            if (!isNewerVer(m.version, LOCAL_VER)) {
                if (force && window.__viaPxToast) window.__viaPxToast('已是最新版 ' + LOCAL_VER);
                return;
            }
            showUpdateBar(m);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            createBtn();
            setTimeout(function () { checkVersion(false); }, 1200);
        });
    } else {
        createBtn();
        setTimeout(function () { checkVersion(false); }, 1200);
    }
    setTimeout(function () { if (document.body && !document.getElementById('viaPxFab')) createBtn(); }, 3000);
})();
