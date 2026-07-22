const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { extractAppVendorSource, locateVendorRegion } = require('../../scripts/sync-audio-vendor');

const rootDir = path.resolve(__dirname, '..', '..');
const host = process.env.UI_HARNESS_HOST || '127.0.0.1';
const port = Number(process.env.UI_HARNESS_PORT || 4173);
const audioVendorEndpoint = '/__audio-vendor-bundle';

function readSource(filename) {
  return fs.readFileSync(path.join(rootDir, filename), 'utf8');
}

function stripAudioVendorBundle(appSource) {
  const region = locateVendorRegion(appSource);
  return appSource.slice(0, region.markerStart) +
    appSource.slice(region.markerEnd + region.endMarker.length);
}

function normalizeMode(value) {
  return value === 'public' || value === 'internal' || value === 'edit' ? value : '';
}

function normalizeSceneType(value) {
  return String(value || '').toLowerCase() === '2d' ? '2D' : '360';
}

function normalizeStorageMode(value) {
  return String(value || '').toLowerCase() === 'single' ? 'single' : 'folder';
}

function normalizeDelay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10_000, parsed)) : 0;
}

function normalizeOutcome(value, allowed, fallback) {
  const normalized = String(value || '').toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function browserHarnessBootstrap(options) {
  'use strict';

  var sceneType = options.sceneType === '2D' ? '2D' : '360';
  var storageMode = options.storageMode === 'single' ? 'single' : 'folder';
  var requestedMode = options.mode || '';
  var fixtureRootId = 'fixture-root-folder';
  var fixtureImage = makeFixtureImage('2D fixture scene', '#0f766e', '#67e8f9');

  window.__HARNESS_ERRORS__ = [];
  window.__HARNESS_CALLS__ = [];
  window.__HARNESS_BEHAVIOR__ = {};
  window.__HARNESS_IMAGE_REQUESTS__ = [];
  window.__HARNESS_IMAGE_BEHAVIOR__ = {};
  window.__HARNESS_VIEWER_CREATIONS__ = [];
  window.__HARNESS_VIEWER_LOADS__ = [];
  var savedHotspotCounter = 0;
  var uploadedPhotoCounter = 0;
  var uploadedAudioCounter = 0;
  window.addEventListener('error', function (event) {
    window.__HARNESS_ERRORS__.push(String(event.message || event.error || 'window error'));
  });
  window.addEventListener('unhandledrejection', function (event) {
    window.__HARNESS_ERRORS__.push(String(event.reason || 'unhandled rejection'));
  });

  if (options.imageDelay > 0 || options.imageOutcome !== 'loaded') {
    window.Image = function HarnessImage() {
      var instance = this;
      var assignedSrc = '';
      instance.onload = null;
      instance.onerror = null;
      instance.crossOrigin = '';
      Object.defineProperty(instance, 'src', {
        configurable: true,
        enumerable: true,
        get: function () { return assignedSrc; },
        set: function (value) {
          assignedSrc = String(value || '');
          var imageBehavior = window.__HARNESS_IMAGE_BEHAVIOR__;
          if (imageBehavior && Array.isArray(imageBehavior.queue)) {
            imageBehavior = imageBehavior.queue.length ? imageBehavior.queue.shift() : null;
          }
          var imageOutcome = imageBehavior && imageBehavior.outcome ? imageBehavior.outcome : options.imageOutcome;
          var imageDelay = imageBehavior && typeof imageBehavior.delay === 'number'
            ? Math.max(0, imageBehavior.delay)
            : options.imageDelay;
          var request = {
            startedAt: performance.now(),
            crossOriginAtSrc: instance.crossOrigin,
            outcome: imageOutcome
          };
          window.__HARNESS_IMAGE_REQUESTS__.push(request);
          if (imageOutcome === 'timeout') return;
          window.setTimeout(function () {
            request.completedAt = performance.now();
            if (imageOutcome === 'failed' || imageOutcome === 'failed-then-loaded') {
              if (typeof instance.onerror === 'function') instance.onerror(new Event('error'));
              if (imageOutcome === 'failed-then-loaded') {
                window.setTimeout(function () {
                  request.lateCompletedAt = performance.now();
                  if (typeof instance.onload === 'function') instance.onload(new Event('load'));
                }, 80);
              }
              return;
            }
            if (typeof instance.onload === 'function') instance.onload(new Event('load'));
          }, imageDelay);
        }
      });
    };
  }

  function makeFixtureImage(label, startColor, endColor) {
    var svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">',
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
      '<stop offset="0" stop-color="' + startColor + '"/>',
      '<stop offset="1" stop-color="' + endColor + '"/>',
      '</linearGradient></defs>',
      '<rect width="1600" height="900" fill="url(#g)"/>',
      '<circle cx="800" cy="450" r="210" fill="rgba(255,255,255,.18)"/>',
      '<text x="800" y="465" text-anchor="middle" fill="white" font-size="54" font-family="sans-serif">' + label + '</text>',
      '</svg>'
    ].join('');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function fixtureScenes() {
    var firstIs2D = sceneType === '2D';
    return [
      {
        id: firstIs2D ? 'fixture-scene-2d' : 'fixture-scene-360',
        name: firstIs2D ? '校舎案内図.png' : '中庭パノラマ.jpg',
        displayName: firstIs2D ? '校舎案内図' : '中庭パノラマ',
        driveName: firstIs2D ? '校舎案内図.png' : '中庭パノラマ.jpg',
        type: sceneType,
        sceneType: sceneType,
        imageUrl: fixtureImage,
        displayOrder: 1,
        isHome: true,
        isRootScene: true,
        parentFolderId: fixtureRootId
      },
      {
        id: firstIs2D ? 'fixture-scene-360' : 'fixture-scene-2d',
        name: firstIs2D ? '体育館パノラマ.jpg' : '避難経路図.png',
        displayName: firstIs2D ? '体育館パノラマ' : '避難経路図',
        driveName: firstIs2D ? '体育館パノラマ.jpg' : '避難経路図.png',
        type: firstIs2D ? '360' : '2D',
        sceneType: firstIs2D ? '360' : '2D',
        imageUrl: fixtureImage,
        displayOrder: 2,
        isHome: false,
        isRootScene: true,
        parentFolderId: fixtureRootId
      },
      {
        id: 'fixture-subfolder',
        name: '別館',
        type: 'folder'
      }
    ];
  }

  function normalizedHotspotResponse(data, hotspotId) {
    var submitted = data && typeof data === 'object' ? data : {};
    var hotspot = {};
    Object.keys(submitted).forEach(function (key) {
      if (key === '__editToken' || key === 'photoUpload' || key === 'audioUpload') return;
      hotspot[key] = submitted[key];
    });
    var photoId = String(submitted.photoId || '');
    if (submitted.photoUpload) {
      uploadedPhotoCounter += 1;
      photoId = 'fixture-upload-photo-' + uploadedPhotoCounter;
    }
    hotspot.id = String(hotspotId || '');
    if (storageMode === 'single') hotspot.fileId = 'fixture-single-scene';
    hotspot.photoId = photoId;
    var audioId = String(submitted.audioId || '');
    if (submitted.audioUpload) {
      uploadedAudioCounter += 1;
      audioId = 'fixture-upload-audio-' + uploadedAudioCounter;
    }
    hotspot.audioId = audioId;
    return {
      success: true,
      id: hotspot.id,
      photoId: photoId,
      audioId: audioId,
      hotspot: hotspot
    };
  }

  function responseFor(method, args) {
    if (method === 'getConfig') {
      if (storageMode === 'single') {
        return {
          execUrl: 'http://127.0.0.1:4173/',
          fileId: 'fixture-single-scene',
          imageUrl: fixtureImage
        };
      }
      return {
        execUrl: 'http://127.0.0.1:4173/',
        rootFolderId: fixtureRootId,
        images: fixtureScenes()
      };
    }
    if (method === 'loadHotspots') {
      return { hotspots: [], northOffset: 0 };
    }
    if (method === 'navigateToFolder') {
      return { images: fixtureScenes().slice(0, 2) };
    }
    if (method === 'getImageDataUri') {
      return { success: true, imageUrl: fixtureImage };
    }
    if (method === 'getHotspotPhotoDataUri') {
      return {
        success: true,
        dataUri: fixtureImage
      };
    }
    if (method === 'getHotspotAudioData') {
      return {
        success: true,
        dataUri: 'data:audio/mpeg;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABAA==',
        mimeType: 'audio/mpeg',
        sizeBytes: 43
      };
    }
    if (method === 'getImageProperties') {
      return {
        success: true,
        id: 'fixture-scene-360',
        name: 'fixture.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        width: 1600,
        height: 900
      };
    }
    if (method === 'getSceneSettings') {
      return {
        success: true,
        scene: fixtureScenes()[0]
      };
    }
    if (method === 'getHotspotFolderUrlForEdit') {
      return {
        success: true,
        url: 'https://drive.google.com/drive/folders/fixture-hotspot-root-folder'
      };
    }
    if (method === 'saveHotspot') {
      savedHotspotCounter += 1;
      return normalizedHotspotResponse(args && args[0], 'fixture-hotspot-' + savedHotspotCounter);
    }
    if (method === 'updateHotspot') {
      return normalizedHotspotResponse(args && args[0], args && args[1]);
    }
    return { success: true };
  }

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_target, property) {
        if (property === 'withSuccessHandler') {
          return function (handler) { return makeRunner(handler, failureHandler); };
        }
        if (property === 'withFailureHandler') {
          return function (handler) { return makeRunner(successHandler, handler); };
        }
        return function () {
          var method = String(property);
          var args = Array.prototype.slice.call(arguments);
          var call = { method: method, args: args, startedAt: performance.now() };
          window.__HARNESS_CALLS__.push(call);
          var configuredBehavior = window.__HARNESS_BEHAVIOR__[method];
          if (configuredBehavior && Array.isArray(configuredBehavior.queue)) {
            configuredBehavior = configuredBehavior.queue.length ? configuredBehavior.queue.shift() : null;
          }
          var delay = method === 'loadHotspots'
            ? options.hotspotDelay
            : method === 'getImageDataUri'
              ? options.base64Delay
              : 0;
          if (configuredBehavior && typeof configuredBehavior === 'object' && typeof configuredBehavior.delay === 'number') {
            delay = Math.max(0, configuredBehavior.delay);
          }
          window.setTimeout(function () {
            try {
              var behavior = configuredBehavior || window.__HARNESS_BEHAVIOR__[method] || 'success';
              var outcome = typeof behavior === 'object' ? (behavior.outcome || 'success') : behavior;
              call.completedAt = performance.now();
              call.outcome = outcome;
              if (outcome === 'failure') {
                if (typeof failureHandler === 'function') failureHandler(new Error('fixture transport failure'));
                return;
              }
              if (outcome === 'error') {
                if (typeof successHandler === 'function') {
                  successHandler({ success: false, error: 'fixture save failure' });
                }
                return;
              }
              var hasConfiguredResponse = behavior && typeof behavior === 'object' &&
                Object.prototype.hasOwnProperty.call(behavior, 'response');
              if (method === 'getAudioVendorBundle' && !hasConfiguredResponse) {
                window.fetch(options.audioVendorEndpoint, { credentials: 'same-origin' })
                  .then(function (response) {
                    if (!response.ok) throw new Error('fixture audio vendor request failed');
                    return response.json();
                  })
                  .then(function (response) {
                    if (typeof successHandler === 'function') successHandler(response);
                  })
                  .catch(function (error) {
                    if (typeof failureHandler === 'function') failureHandler(error);
                    else window.__HARNESS_ERRORS__.push(String(error && error.message || error));
                  });
                return;
              }
              var response = hasConfiguredResponse ? behavior.response : responseFor(method, args);
              if (typeof successHandler === 'function') successHandler(response);
            } catch (error) {
              if (typeof failureHandler === 'function') failureHandler(error);
              else window.__HARNESS_ERRORS__.push(String(error && error.message || error));
            }
          }, delay);
          return makeRunner(null, null);
        };
      }
    });
  }

  window.google = {
    script: {
      url: {
        getLocation: function (callback) {
          var params = {};
          new URLSearchParams(window.location.search).forEach(function (value, key) {
            params[key] = value;
          });
          window.setTimeout(function () { callback({ parameter: params }); }, 0);
        }
      },
      host: {
        close: function () {}
      }
    }
  };
  Object.defineProperty(window.google.script, 'run', {
    configurable: false,
    enumerable: true,
    get: function () { return makeRunner(null, null); }
  });

  window.pannellum = {
    viewer: function (elementId, initialConfig) {
      initialConfig = initialConfig || {};
      var container = document.getElementById(elementId);
      var handlers = {};
      var loaded = false;
      var sceneConfigs = new Map(Object.entries(initialConfig.scenes || {}));
      var firstScene = initialConfig.firstScene || (initialConfig.default && initialConfig.default.firstScene) || '';
      var currentScene = String(firstScene || initialConfig.scene || '');
      var activeLoadToken = 0;
      var defaultOutcomeAttempt = 0;
      var yaw = 0;
      var pitch = 0;
      var hotspots = new Map();

      // Pannellum 2.5.6のmergeConfigと同様に、scene設定へdefault、
      // scene固有設定、トップレベル設定の順で適用する。
      function resolveSceneConfig(sceneId) {
        var resolved = {};
        if (initialConfig.default && typeof initialConfig.default === 'object') {
          Object.assign(resolved, initialConfig.default);
        }
        if (sceneId && sceneConfigs.has(sceneId)) {
          Object.assign(resolved, sceneConfigs.get(sceneId));
        }
        Object.keys(initialConfig).forEach(function (key) {
          if (key !== 'default' && key !== 'scenes') resolved[key] = initialConfig[key];
        });
        return resolved;
      }

      var initialSceneConfig = currentScene && sceneConfigs.has(currentScene)
        ? resolveSceneConfig(currentScene)
        : initialConfig;
      window.__HARNESS_VIEWER_CREATIONS__.push({
        createdAt: performance.now(),
        hotspotCount: Array.isArray(initialSceneConfig.hotSpots) ? initialSceneConfig.hotSpots.length : 0,
        hotspotLabels: (Array.isArray(initialSceneConfig.hotSpots) ? initialSceneConfig.hotSpots : []).map(function (hotspot) {
          return String(hotspot && hotspot.createTooltipArgs && hotspot.createTooltipArgs.label || '');
        })
      });
      var surface = document.createElement('div');
      surface.className = 'playwright-panorama-surface';
      surface.setAttribute('aria-label', '360度画像の確認用表示');
      surface.tabIndex = 0;
      surface.innerHTML = '<span>360 fixture scene</span>';
      container.innerHTML = '';
      container.appendChild(surface);

      var dragPointerId = null;
      var dragX = 0;
      var dragY = 0;
      surface.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        dragPointerId = event.pointerId;
        dragX = event.clientX;
        dragY = event.clientY;
        if (surface.setPointerCapture) surface.setPointerCapture(event.pointerId);
      });
      surface.addEventListener('pointermove', function (event) {
        if (dragPointerId !== event.pointerId) return;
        yaw += (event.clientX - dragX) * 0.5;
        pitch = Math.max(-90, Math.min(90, pitch - (event.clientY - dragY) * 0.5));
        dragX = event.clientX;
        dragY = event.clientY;
        surface.dataset.dragged = 'true';
        renderHotspots();
      });
      function finishPointerDrag(event) {
        if (dragPointerId !== event.pointerId) return;
        dragPointerId = null;
        if (surface.releasePointerCapture && surface.hasPointerCapture(event.pointerId)) {
          surface.releasePointerCapture(event.pointerId);
        }
      }
      surface.addEventListener('pointerup', finishPointerDrag);
      surface.addEventListener('pointercancel', finishPointerDrag);

      function normalizeRelativeYaw(value) {
        var normalized = Number(value) || 0;
        while (normalized > 180) normalized -= 360;
        while (normalized < -180) normalized += 360;
        return normalized;
      }

      function renderHotspots() {
        var rect = container.getBoundingClientRect();
        hotspots.forEach(function (record) {
          var relativeYaw = normalizeRelativeYaw(Number(record.config.yaw) - yaw);
          var relativePitch = Number(record.config.pitch) - pitch;
          record.element.style.left = ((relativeYaw + 180) / 360 * rect.width) + 'px';
          record.element.style.top = ((90 - relativePitch) / 180 * rect.height) + 'px';
          record.element.style.display = Math.abs(relativeYaw) > 178 || Math.abs(relativePitch) > 90 ? 'none' : '';
        });
      }

      function replaceHarnessHotspots(config) {
        hotspots.forEach(function (record) {
          if (record.element && record.element.parentNode) record.element.remove();
        });
        hotspots.clear();
        (Array.isArray(config && config.hotSpots) ? config.hotSpots : []).forEach(addHarnessHotspot);
      }

      function scheduleViewerLoad(config, sceneId) {
        activeLoadToken += 1;
        var token = activeLoadToken;
        loaded = false;
        var behavior = window.__HARNESS_BEHAVIOR__.pannellum;
        if (behavior && Array.isArray(behavior.queue)) {
          behavior = behavior.queue.length ? behavior.queue.shift() : null;
        }
        var outcome = behavior && typeof behavior === 'object'
          ? (behavior.outcome || options.viewerOutcome)
          : (behavior || options.viewerOutcome);
        if (outcome === 'failed-then-loaded') {
          defaultOutcomeAttempt += 1;
          outcome = defaultOutcomeAttempt === 1 ? 'failed' : 'loaded';
        }
        var delay = behavior && typeof behavior === 'object' && typeof behavior.delay === 'number'
          ? Math.max(0, behavior.delay)
          : options.viewerDelay;
        var loadRecord = {
          startedAt: performance.now(),
          outcome: outcome,
          panorama: String(config && config.panorama || ''),
          hotspotCount: Array.isArray(config && config.hotSpots) ? config.hotSpots.length : 0,
          hotspotLabels: (Array.isArray(config && config.hotSpots) ? config.hotSpots : []).map(function (hotspot) {
            return String(hotspot && hotspot.createTooltipArgs && hotspot.createTooltipArgs.label || '');
          })
        };
        window.__HARNESS_VIEWER_LOADS__.push(loadRecord);
        window.setTimeout(function () {
          loadRecord.completedAt = performance.now();
          if (token !== activeLoadToken) {
            loadRecord.discarded = true;
            return;
          }
          if (outcome === 'failed') {
            loaded = undefined;
            (handlers.error || []).forEach(function (handler) { handler(new Error('fixture viewer failure')); });
            return;
          }
          loaded = true;
          (handlers.load || []).forEach(function (handler) { handler(); });
        }, delay);
      }

      function addHarnessHotspot(config) {
        removeHarnessHotspot(config.id);
        var element = document.createElement('div');
        element.className = String(config.cssClass || '');
        element.dataset.pannellumHotspotId = String(config.id || '');
        element.style.position = 'absolute';
        element.style.zIndex = '20';
        if (typeof config.createTooltipFunc === 'function') {
          config.createTooltipFunc(element, config.createTooltipArgs || {});
        }
        if (typeof config.clickHandlerFunc === 'function') {
          element.addEventListener('click', function (event) {
            config.clickHandlerFunc(event, config.clickHandlerArgs || {});
          });
        }
        container.appendChild(element);
        hotspots.set(String(config.id || ''), { config: config, element: element });
        renderHotspots();
        return api;
      }

      function removeHarnessHotspot(id) {
        var key = String(id || '');
        var record = hotspots.get(key);
        if (record && record.element.parentNode) record.element.remove();
        hotspots.delete(key);
        return api;
      }

      var api = {
        on: function (name, handler) {
          if (!handlers[name]) handlers[name] = [];
          handlers[name].push(handler);
          return api;
        },
        isLoaded: function () { return loaded; },
        destroy: function () {
          activeLoadToken += 1;
          loaded = false;
          hotspots.clear();
          container.innerHTML = '';
        },
        stopAutoRotate: function () {},
        startAutoRotate: function () {},
        startOrientation: function () {},
        stopOrientation: function () {},
        resize: function () { renderHotspots(); },
        getYaw: function () { return yaw; },
        getPitch: function () { return pitch; },
        setYaw: function (value) { yaw = Number(value) || 0; renderHotspots(); },
        setPitch: function (value) { pitch = Number(value) || 0; renderHotspots(); },
        addHotSpot: addHarnessHotspot,
        removeHotSpot: removeHarnessHotspot,
        addScene: function (sceneId, config) {
          if (!initialConfig.scenes || typeof initialConfig.scenes !== 'object') {
            throw new TypeError('Pannellum initialConfig.scenes is required by addScene');
          }
          initialConfig.scenes[String(sceneId || '')] = config || {};
          sceneConfigs.set(String(sceneId || ''), config || {});
          return api;
        },
        loadScene: function (sceneId, nextPitch, nextYaw) {
          if (loaded === false) return api;
          var key = String(sceneId || '');
          var config = resolveSceneConfig(key);
          currentScene = key;
          if (typeof nextYaw === 'number') yaw = nextYaw;
          if (typeof nextPitch === 'number') pitch = nextPitch;
          replaceHarnessHotspots(config);
          renderHotspots();
          scheduleViewerLoad(config, key);
          return api;
        },
        getScene: function () { return currentScene; },
        mouseEventToCoords: function (event) {
          var rect = container.getBoundingClientRect();
          var eventYaw = yaw + ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 360 - 180;
          var eventPitch = pitch + 90 - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 180;
          return [Math.max(-90, Math.min(90, eventPitch)), eventYaw];
        }
      };

      replaceHarnessHotspots(initialSceneConfig);
      scheduleViewerLoad(initialSceneConfig, currentScene);
      return api;
    }
  };

  window.__HARNESS_OPTIONS__ = {
    mode: requestedMode,
    sceneType: sceneType,
    storageMode: storageMode
  };
}

function browserHarnessReady(options) {
  'use strict';
  window.addEventListener('load', function () {
    var startedAt = Date.now();
    var timer = window.setInterval(function () {
      var loading = document.getElementById('loading');
      var ready = loading && loading.classList.contains('hidden');
      if (!ready && Date.now() - startedAt < 5000) return;
      window.clearInterval(timer);
      document.body.dataset.harnessReady = ready ? 'true' : 'timeout';
      document.body.dataset.harnessMode = options.mode || 'default';
      document.body.dataset.harnessSceneType = options.sceneType;
    }, 20);
  });
}

function renderPage(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const options = {
    mode: normalizeMode(url.searchParams.get('mode')),
    sceneType: normalizeSceneType(url.searchParams.get('sceneType')),
    storageMode: normalizeStorageMode(url.searchParams.get('storageMode')),
    hotspotDelay: normalizeDelay(url.searchParams.get('hotspotDelay')),
    imageDelay: normalizeDelay(url.searchParams.get('imageDelay')),
    base64Delay: normalizeDelay(url.searchParams.get('base64Delay')),
    viewerDelay: normalizeDelay(url.searchParams.get('viewerDelay')) || 20,
    imageOutcome: normalizeOutcome(url.searchParams.get('imageOutcome'), ['loaded', 'failed', 'failed-then-loaded', 'timeout'], 'loaded'),
    viewerOutcome: normalizeOutcome(url.searchParams.get('viewerOutcome'), ['loaded', 'failed', 'failed-then-loaded'], 'loaded'),
    audioVendorEndpoint
  };
  const editToken = options.mode === 'edit' ? 'playwright-edit-token' : '';

  let html = readSource('index.html');
  html = html.replace(
    /\s*<link[^>]+pannellum@2\.5\.6[^>]*>\s*/,
    '\n'
  );
  html = html.replace(
    /\s*<script[^>]+pannellum@2\.5\.6[^>]*><\/script>\s*/,
    '\n'
  );
  html = html.replace('<?!= include("styles") ?>', readSource('styles.html'));
  html = html.replace(/<\?!=\s*initialMode\s*\?>/g, options.mode);
  html = html.replace(
    /window\.__EDIT_TOKEN__\s*=\s*<\?!=\s*JSON\.stringify\(editToken\s*\|\|\s*''\)\s*\?>;/,
    `window.__EDIT_TOKEN__ = ${JSON.stringify(editToken)};`
  );

  const bootstrap = [
    '<style>',
    '.playwright-panorama-surface { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; color:#fff; font:700 28px sans-serif; background:linear-gradient(135deg,#0f172a,#2563eb 48%,#22d3ee); cursor:grab; user-select:none; }',
    '.playwright-panorama-surface::before { content:""; position:absolute; width:46vmin; height:46vmin; border:2px solid rgba(255,255,255,.28); border-radius:50%; box-shadow:0 0 0 12vmin rgba(255,255,255,.05); }',
    '.playwright-panorama-surface span { position:relative; text-shadow:0 2px 8px rgba(0,0,0,.45); }',
    '</style>',
    `<script>(${browserHarnessBootstrap.toString()})(${JSON.stringify(options)});</script>`,
    stripAudioVendorBundle(readSource('app.html')),
    `<script>(${browserHarnessReady.toString()})(${JSON.stringify(options)});</script>`
  ].join('\n');
  html = html.replace('<?!= include("app") ?>', bootstrap);
  return html;
}

function createHarnessServer() {
  return http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('ok');
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }
    if (new URL(request.url || '/', `http://${host}:${port}`).pathname === audioVendorEndpoint) {
      try {
        const source = extractAppVendorSource(readSource('app.html'));
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        response.end(JSON.stringify({ version: '1.50.8', source }));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error && error.stack || String(error));
      }
      return;
    }
    try {
      const html = renderPage(request.url || '/');
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error && error.stack || String(error));
    }
  });
}

function closeHarnessServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
}

function startHarnessServer(options = {}) {
  const listenHost = options.host || host;
  const listenPort = Number(options.port || port);
  const server = createHarnessServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => {
      server.removeListener('error', reject);
      resolve({
        server,
        url: `http://${listenHost}:${listenPort}`,
        close: () => closeHarnessServer(server)
      });
    });
  });
}

if (require.main === module) {
  let runningServer = null;
  startHarnessServer().then((running) => {
    runningServer = running;
    process.stdout.write(`Responsive UI harness: ${running.url}\n`);
  }).catch((error) => {
    process.stderr.write(`${error && error.stack || error}\n`);
    process.exit(1);
  });

  function shutdown() {
    if (!runningServer) {
      process.exit(0);
      return;
    }
    runningServer.close().then(() => process.exit(0));
    const forcedExit = setTimeout(() => process.exit(0), 1000);
    forcedExit.unref();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  renderPage,
  startHarnessServer
};
