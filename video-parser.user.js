// ==UserScript==
// @name         视频解析（聚合TV版）
// @namespace    https://viayoo.com/86wod5
// @version      7.0.0
// @description  Via通用 · 聚合TV悬浮导航 · 接口云端自动同步（跟随拾光映画接口源）
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
    const LOCAL_VER = '7.0.0';
    const CLOUD_BASE = 'https://tianxinshanbian.github.io/via-scripts';
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

    function pullApis(force, done) {
        var now = Date.now();
        var last = 0;
        try { last = parseInt(localStorage.getItem(LS_APIS_AT) || '0', 10); } catch (e) {}
        if (!force && last && now - last < PULL_GAP) { if (done) done(false); return; }
        loadRemoteScript(APIS_JS_URL + '?t=' + now, '__VIA_APIS__', 4500, function (payload) {
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
                    defaultInterfaceId: parsed.defaultInterfaceId || 'jx1',
                    autoFullscreen: parsed.autoFullscreen !== undefined ? parsed.autoFullscreen : false
                };
            }
        } catch (e) {}
        return {
            simulateAndroid: deviceType === 'ios',
            defaultInterfaceId: 'jx1',
            autoFullscreen: false
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

    function createBtn() {
        if (document.getElementById("floatBtn")) return;
        
        const parserDomains = [
            'nnxv.cn',
            'xmflv.com',
            '202617.xyz',
            '789jiexi.icu',
            'bfq.txnp.cn',
            'jx.xmflv.com',
            'jx.2s0.cn',
            'jx.dmflv.cc',
            'video.isyour.love',
            'vip.xilibo.com',
            'jx.77flv.cc',
            'jx.flvcd.com',
            'jx.qqwtt.com',
            'jx.wmxz.wang',
            'jx.mgtv.com',
            'jx.youku.com',
            'jx.iqiyi.com',
            'jx.mgtv.com',
            'jx.sohu.com',
            'jx.pptv.com',
            'jx.kugou.com',
            'jx.kuwo.cn',
            'jx.xiami.com',
            'jx.netease.com',
            'jx.music.163.com',
            'jx.y.qq.com',
            'jx.v.qq.com',
            'jx.iqiyi.com',
            'jx.youku.com',
            'jx.le.com',
            'jx.mgtv.com',
            'jx.sohu.com',
            'jx.pptv.com'
        ];
        
        const currentHost = window.location.hostname.toLowerCase();
        for (const domain of parserDomains) {
            if (currentHost.includes(domain)) {
                return;
            }
        }
        
        try {
            if (!document.head) {
                console.error('document.head not found');
                return;
            }

        const style = document.createElement('style');
        style.textContent = `
#homeBtn {
  position: fixed !important;
  right: 20px !important;
  bottom: 170px !important;
  width: 60px !important;
  height: 60px !important;
  background: #2E7CF6 !important;
  border-radius: 50% !important;
  color: #fff !important;
  text-align: center !important;
  line-height: 60px !important;
  font-size: 28px !important;
  z-index: 9999999999 !important;
  box-shadow: 0 0 20px #2E7CF666 !important;
  cursor: pointer !important;
  user-select: none !important;
  border: none !important;
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
  touch-action: none !important;
}
#floatBtn {
  position: fixed !important;
  right: 20px !important;
  bottom: 100px !important;
  width: 60px !important;
  height: 60px !important;
  background: #ff4400 !important;
  border-radius: 50% !important;
  color: #fff !important;
  text-align: center !important;
  line-height: 60px !important;
  font-size: 28px !important;
  z-index: 9999999999 !important;
  box-shadow: 0 0 20px #ff440066 !important;
  cursor: pointer !important;
  user-select: none !important;
  border: none !important;
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
  touch-action: none !important;
}
#toast {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  background: rgba(0,0,0,0.8); color: #fff;
  padding: 10px 20px; border-radius: 6px;
  z-index: 999999999; display: none;
}
#pop {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  background: #fff; padding: 20px 25px; border-radius: 14px;
  box-shadow: 0 0 30px rgba(0,0,0,0.4);
  z-index: 999999999; text-align: center;
  display: none; min-width: 220px;
}
#pop button {
  margin: 6px; padding: 10px 16px;
  border: none; border-radius: 6px;
  font-size: 15px; cursor: pointer;
}
.btn1 { background: #007bff; color: #fff; }
.btnClose { background: #dc3545; color: #fff; }
.btnSetting { background: #6c757d; color: #fff; }
.btnSave { background: #28a745; color: #fff; }
.btnBack { background: #17a2b8; color: #fff; }
.defaultBadge {
  font-size: 12px;
  background: #ffc107;
  color: #333;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
#settingsView {
  display: none;
  max-height: 400px;
  overflow-y: auto;
  text-align: left;
}
.settingItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.settingItem:last-child { border-bottom: none; }
.settingLeft { display: flex; align-items: center; }
.settingRight { display: flex; align-items: center; gap: 8px; }
.settingName { font-size: 14px; }
input[type="radio"], input[type="checkbox"] { transform: scale(1.3); }
video {
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
}
iframe {
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
}
`;
        document.head.appendChild(style);

        const btn = document.createElement('div');
        btn.id = "floatBtn";
        btn.innerText = "⚡";
        btn.style.position = "fixed";
        btn.style.right = "20px";
        btn.style.bottom = "100px";
        btn.style.width = "60px";
        btn.style.height = "60px";
        btn.style.background = "#ff4400";
        btn.style.borderRadius = "50%";
        btn.style.color = "#fff";
        btn.style.textAlign = "center";
        btn.style.lineHeight = "60px";
        btn.style.fontSize = "28px";
        btn.style.zIndex = "9999999999";
        btn.style.boxShadow = "0 0 20px #ff440066";
        btn.style.cursor = "pointer";
        btn.style.userSelect = "none";
        btn.style.border = "none";
        btn.style.display = "block";
        btn.style.opacity = "1";
        btn.style.visibility = "visible";
        btn.style.touchAction = "none";
        btn.style.pointerEvents = "auto";
        document.body.appendChild(btn);

        function makeDraggable(el) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;
            el.addEventListener('touchstart', function(e) {
                isDragging = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                initialLeft = el.offsetLeft;
                initialTop = el.offsetTop;
                el.style.transition = 'none';
            });
            window.addEventListener('touchmove', function(e) {
                if (!isDragging) return;
                const touch = e.touches[0];
                const moveX = touch.clientX - startX;
                const moveY = touch.clientY - startY;
                el.style.left = initialLeft + moveX + 'px';
                el.style.top = initialTop + moveY + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                e.preventDefault();
            });
            window.addEventListener('touchend', function() {
                isDragging = false;
            });
        }
        makeDraggable(btn);

        // ===== 主页按钮：任意页面悬浮，点击回聚合TV 主页 =====
        const homeBtn = document.createElement('div');
        homeBtn.id = "homeBtn";
        homeBtn.innerText = "🏠";
        homeBtn.style.position = "fixed";
        homeBtn.style.right = "20px";
        homeBtn.style.bottom = "170px";
        homeBtn.style.width = "60px";
        homeBtn.style.height = "60px";
        homeBtn.style.background = "#2E7CF6";
        homeBtn.style.borderRadius = "50%";
        homeBtn.style.color = "#fff";
        homeBtn.style.textAlign = "center";
        homeBtn.style.lineHeight = "60px";
        homeBtn.style.fontSize = "28px";
        homeBtn.style.zIndex = "9999999999";
        homeBtn.style.boxShadow = "0 0 20px #2E7CF666";
        homeBtn.style.cursor = "pointer";
        homeBtn.style.userSelect = "none";
        homeBtn.style.border = "none";
        homeBtn.style.display = "block";
        homeBtn.style.opacity = "1";
        homeBtn.style.visibility = "visible";
        homeBtn.style.touchAction = "none";
        homeBtn.style.pointerEvents = "auto";
        document.body.appendChild(homeBtn);
        makeDraggable(homeBtn);
        homeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (window.Android && window.Android.openUrl) {
                window.Android.openUrl(HOME_URL);
            } else {
                location.href = HOME_URL;
            }
        });

        const toast = document.createElement('div');
        toast.id = "toast";
        document.body.appendChild(toast);

        function tip(msg) {
            toast.innerText = msg;
            toast.style.display = "block";
            setTimeout(() => toast.style.display = "none", 2000);
        }

        function copy() {
            try {
                const t = document.createElement('textarea');
                t.value = location.href;
                t.style.position = "fixed";
                t.style.opacity = "0";
                document.body.appendChild(t);
                t.select();
                document.execCommand('copy');
                document.body.removeChild(t);
                tip("✅ 已复制当前链接");
            } catch (e) {}
        }

        const pop = document.createElement('div');
        pop.id = "pop";
        
        function apiStatusText() {
            const t = apiMeta.updated_at ? apiMeta.updated_at.replace(/^\d{4}-/, '') : '';
            return '接口 ' + (apiMeta.count || interfaces.length) + ' 条 · ' + apiMeta.origin + (t ? ' · ' + t : '');
        }

        function renderMainView() {
            const visibleInterfaces = interfaces.filter(i => i.visible !== false);
            
            let buttonsHtml = '';
            if (visibleInterfaces.length === 0) {
                buttonsHtml = '<p style="color:#999;">没有可用的接口</p>';
            } else if (visibleInterfaces.length === 1) {
                const badge = visibleInterfaces[0].isDefault ? '<span class="defaultBadge">默认</span>' : '';
                buttonsHtml = `<button class="btn1" data-action="use-interface" data-url="${visibleInterfaces[0].url}">${visibleInterfaces[0].name}${badge}</button>`;
            } else {
                visibleInterfaces.forEach((iface, index) => {
                    const badge = iface.isDefault ? '<span class="defaultBadge">默认</span>' : '';
                    buttonsHtml += `<button class="btn1" data-action="use-interface" data-url="${iface.url}">${iface.name}${badge}</button>`;
                });
            }
            
            pop.innerHTML = `
<div id="mainView">
<p>视频解析</p>
<div style="font-size:11px;color:#888;margin:2px 0 8px;">${apiStatusText()}<button data-action="sync-apis" style="margin-left:6px;padding:2px 8px;border:1px solid #2E7CF6;background:#fff;color:#2E7CF6;border-radius:10px;font-size:11px;cursor:pointer;">刷新</button></div>
<div id="interfaceList">${buttonsHtml}</div>
<button class="btnSetting" data-action="settings">⚙️ 设置</button>
<button class="btnClose" data-action="close">关闭</button>
</div>
<div id="settingsView">
<p style="text-align:center;margin-bottom:10px;font-weight:bold;">接口设置</p>
</div>
`;
        }
        
        function renderSettingsView() {
            const settingsView = pop.querySelector('#settingsView');
            const mainView = pop.querySelector('#mainView');
            
            mainView.style.display = 'none';
            settingsView.style.display = 'block';
            
            let html = `
<p style="font-size:11px;color:#888;text-align:center;margin-bottom:6px;">${apiStatusText()}<button data-action="sync-apis" style="margin-left:6px;padding:2px 8px;border:1px solid #2E7CF6;background:#fff;color:#2E7CF6;border-radius:10px;font-size:11px;cursor:pointer;">立即同步</button></p>
<p style="font-size:14px;font-weight:bold;margin-bottom:10px;">设置默认接口</p>
`;
            interfaces.forEach((iface, index) => {
                html += `
<div class="settingItem">
<div class="settingLeft">
<input type="radio" name="default" ${iface.isDefault ? 'checked' : ''} data-index="${index}" data-id="${iface.id}">
<span class="settingName">${iface.name}</span>
</div>
<div class="settingRight">
<label><input type="checkbox" ${iface.visible !== false ? 'checked' : ''} data-index="${index}"> 显示</label>
</div>
</div>
`;
            });
            
            html += `
<div class="settingItem">
<div class="settingLeft">
<span class="settingName">自动全屏</span>
</div>
<div class="settingRight">
<label><input type="checkbox" id="autoFullscreenCheck" ${settings.autoFullscreen ? 'checked' : ''}> 开启</label>
</div>
</div>
<div class="settingItem">
<div class="settingLeft">
<span class="settingName">模拟安卓手机</span>
</div>
<div class="settingRight">
<label><input type="checkbox" id="simulateCheck" ${settings.simulateAndroid ? 'checked' : ''}> 开启</label>
</div>
</div>
<div style="margin-top:15px;text-align:center;">
<button class="btnSave" data-action="save">保存设置</button>
<button class="btnBack" data-action="back">返回</button>
<button class="btnClose" data-action="close">关闭</button>
</div>
`;
            
            settingsView.innerHTML = html;
            
            settingsView.querySelectorAll('input[name="default"]').forEach(radio => {
                radio.onchange = () => {
                    interfaces.forEach(i => i.isDefault = false);
                    interfaces[parseInt(radio.dataset.index)].isDefault = true;
                    settings.defaultInterfaceId = radio.dataset.id;
                };
            });
            
            settingsView.querySelectorAll('input[type="checkbox"]:not(#autoFullscreenCheck):not(#simulateCheck)').forEach(checkbox => {
                checkbox.onchange = () => {
                    interfaces[parseInt(checkbox.dataset.index)].visible = checkbox.checked;
                };
            });
            
            settingsView.querySelector('#autoFullscreenCheck').onchange = (e) => {
                settings.autoFullscreen = e.target.checked;
            };
            
            settingsView.querySelector('#simulateCheck').onchange = (e) => {
                settings.simulateAndroid = e.target.checked;
            };
        }

        function isNewerVer(a, b) {
            const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
            const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
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
            bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1f2329;color:#fff;font-size:13px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 -2px 10px rgba(0,0,0,.35);';
            bar.innerHTML = '<span style="flex:1;">发现新版本 ' + meta.version + '（当前 ' + LOCAL_VER + '）</span>' +
                '<a href="' + (meta.url || '') + '" style="color:#5ea8ff;text-decoration:none;font-weight:600;">立即更新</a>' +
                '<span data-close="1" style="padding:0 6px;color:#aaa;font-size:18px;line-height:1;cursor:pointer;">×</span>';
            bar.addEventListener('click', function (e) {
                if (e.target.getAttribute('data-close')) bar.remove();
            });
            document.body.appendChild(bar);
        }

        function checkVersion() {
            let last = 0;
            try { last = parseInt(localStorage.getItem(LS_UPD_AT) || '0', 10); } catch (e) {}
            if (last && Date.now() - last < CHECK_GAP) return;
            loadRemoteScript(VERSION_JS_URL + '?t=' + Date.now(), '__VIA_UPD__', 4000, function (m) {
                try { localStorage.setItem(LS_UPD_AT, String(Date.now())); } catch (e) {}
                if (!m || !m.version) return;
                if (!isNewerVer(m.version, LOCAL_VER)) return;
                showUpdateBar(m);
            });
        }

        renderMainView();
        document.body.appendChild(pop);
        checkVersion();

        pop.addEventListener('click', (e) => {
            const target = e.target.closest('button, a[data-action]');
            if (!target) return;
            
            const action = target.dataset.action;
            
            if (action === 'close') {
                pop.style.display = 'none';
            } else if (action === 'settings') {
                renderSettingsView();
            } else if (action === 'sync-apis') {
                if (e.preventDefault) e.preventDefault();
                tip("⏳ 正在同步接口…");
                pullApis(true, function (ok) {
                    if (ok) { savePrefs(); tip("✅ 已同步 " + apiMeta.count + " 条"); }
                    else { tip("❌ 同步失败，沿用本机接口"); }
                    const sv = pop.querySelector('#settingsView');
                    if (sv && sv.style.display === 'block') renderSettingsView(); else renderMainView();
                });
            } else if (action === 'use-interface') {
                const url = target.dataset.url;
                if (url) {
                    pop.style.display = 'none';
                    copy();
                    location.href = url + encodeURIComponent(location.href);
                }
            } else if (action === 'save') {
                const visibleCount = interfaces.filter(i => i.visible !== false).length;
                const defaultCount = interfaces.filter(i => i.isDefault).length;
                
                if (visibleCount === 0) {
                    tip("❌ 请至少启用一个接口");
                    return;
                }
                if (defaultCount === 0) {
                    tip("❌ 请设置一个默认接口");
                    return;
                }
                
                saveSettings(settings);
                savePrefs();
                
                if (settings.simulateAndroid && !window.__simulated) {
                    simulateAndroid();
                    window.__simulated = true;
                }
                
                tip("✅ 设置已保存");
                renderMainView();
            } else if (action === 'back') {
                renderMainView();
            }
        });

        function hideScriptBtn() {
            btn.style.display = 'none';
            homeBtn.style.display = 'none';
            pop.style.display = 'none';
        }

        function requestVideoFullscreen(element) {
            if (element.requestFullscreen) {
                return element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                return element.webkitRequestFullscreen();
            } else if (element.mozRequestFullScreen) {
                return element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                return element.msRequestFullscreen();
            } else if (element.webkitEnterFullscreen) {
                return element.webkitEnterFullscreen();
            }
            return Promise.reject(new Error('Fullscreen API not supported'));
        }

        function observeVideoPlay() {
            function checkVideos() {
                document.querySelectorAll('video').forEach(video => {
                    try {
                        if (!video.paused && video.readyState >= 2) {
                            hideScriptBtn();
                            if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                requestVideoFullscreen(video).catch(() => {
                                    requestVideoFullscreen(document.documentElement).catch(() => {});
                                });
                            }
                        }
                    } catch (e) {}
                });
                
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc) {
                            iframeDoc.querySelectorAll('video').forEach(video => {
                                try {
                                    if (!video.paused && video.readyState >= 2) {
                                        hideScriptBtn();
                                        if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                            requestVideoFullscreen(video).catch(() => {
                                                requestVideoFullscreen(iframe).catch(() => {
                                                    requestVideoFullscreen(document.documentElement).catch(() => {});
                                                });
                                            });
                                        }
                                    }
                                } catch (e) {}
                            });
                        }
                    } catch (e) {}
                });
            }

            checkVideos();

            document.addEventListener('play', (e) => {
                if (e.target.tagName === 'VIDEO') {
                    hideScriptBtn();
                    if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                        requestVideoFullscreen(e.target).catch(() => {
                            requestVideoFullscreen(document.documentElement).catch(() => {});
                        });
                    }
                }
            }, true);

            document.addEventListener('webkitbeginfullscreen', () => {
                hideScriptBtn();
            });
            document.addEventListener('mozfullscreenchange', () => {
                if (document.fullscreenElement) {
                    hideScriptBtn();
                }
            });
            document.addEventListener('fullscreenchange', () => {
                if (document.fullscreenElement) {
                    hideScriptBtn();
                }
            });

            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'VIDEO') {
                            node.addEventListener('play', () => {
                                hideScriptBtn();
                                if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                    requestVideoFullscreen(node).catch(() => {
                                        requestVideoFullscreen(document.documentElement).catch(() => {});
                                    });
                                }
                            });
                        } else if (node.tagName === 'IFRAME') {
                            node.addEventListener('load', () => {
                                try {
                                    const iframeDoc = node.contentDocument || node.contentWindow?.document;
                                    if (iframeDoc) {
                                        iframeDoc.querySelectorAll('video').forEach(v => {
                                            v.addEventListener('play', () => {
                                                hideScriptBtn();
                                                if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                                    requestVideoFullscreen(v).catch(() => {
                                                        requestVideoFullscreen(node).catch(() => {
                                                            requestVideoFullscreen(document.documentElement).catch(() => {});
                                                        });
                                                    });
                                                }
                                            });
                                        });
                                        iframeDoc.addEventListener('play', (e) => {
                                            if (e.target.tagName === 'VIDEO') {
                                                hideScriptBtn();
                                                if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                                    requestVideoFullscreen(e.target).catch(() => {
                                                        requestVideoFullscreen(document.documentElement).catch(() => {});
                                                    });
                                                }
                                            }
                                        }, true);
                                    }
                                } catch (e) {}
                            });
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('video').forEach(v => {
                                v.addEventListener('play', () => {
                                    hideScriptBtn();
                                    if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                        requestVideoFullscreen(v).catch(() => {
                                            requestVideoFullscreen(document.documentElement).catch(() => {});
                                        });
                                    }
                                });
                            });
                        }
                    });
                });
                checkVideos();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setInterval(() => {
                checkVideos();
            }, 1000);

            setInterval(() => {
                try {
                    const players = document.querySelectorAll('.video, .player, .media, [class*="video"], [class*="player"], [class*="media"]');
                    players.forEach(player => {
                        const video = player.querySelector('video');
                        if (video && !video.paused && video.readyState >= 2) {
                            hideScriptBtn();
                            if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                requestVideoFullscreen(video).catch(() => {
                                    requestVideoFullscreen(document.documentElement).catch(() => {});
                                });
                            }
                        }
                    });
                    
                    const playingElements = document.querySelectorAll('[style*="animation-play-state"], [class*="playing"], [class*="active"]');
                    playingElements.forEach(el => {
                        const video = el.querySelector('video');
                        if (video && !video.paused) {
                            hideScriptBtn();
                            if (settings.autoFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) {
                                requestVideoFullscreen(video).catch(() => {
                                    requestVideoFullscreen(document.documentElement).catch(() => {});
                                });
                            }
                        }
                    });
                } catch (e) {}
            }, 2000);
        }

        observeVideoPlay();

        function getDefaultInterfaceUrl() {
            const defIface = interfaces.find(i => i.id === settings.defaultInterfaceId);
            return defIface ? defIface.url : interfaces[0].url;
        }

        let lastClickTime = 0;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastClickTime < 300) {
                hideScriptBtn();
                copy();
                location.href = getDefaultInterfaceUrl() + encodeURIComponent(location.href);
            } else {
                pop.style.display = "block";
            }
            lastClickTime = now;
        });

        setInterval(() => {
                if (!document.getElementById("floatBtn") && document.body) document.body.appendChild(btn);
                if (!document.getElementById("homeBtn") && document.body) document.body.appendChild(homeBtn);
                if (!document.getElementById("pop") && document.body) document.body.appendChild(pop);
            }, 300);
        } catch (e) {
            console.error('CreateBtn error:', e);
        }
    }
})();