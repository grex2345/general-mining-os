/**
 * Arena PC Control — Browser-like Extension Harness (test-only).
 *
 * Loads the REAL extension sources into a jsdom "Arena.ai" page with a chrome.*
 * shim that mirrors Chrome MV3 semantics closely enough to catch real
 * integration bugs:
 *
 *   • content scripts are evaluated as CLASSIC scripts in the page realm, so a
 *     top-level `await`/`import` fails exactly like it would in Chrome
 *   • chrome.runtime.onMessage listeners receive (message, sender, sendResponse)
 *     and `return true` keeps the response channel open for async replies
 *   • chrome.tabs.sendMessage() into a tab with no receiver REJECTS
 *   • chrome.runtime.sendMessage() with no receiver REJECTS
 *   • chrome.storage.local get/set are async
 *   • open WebSockets are injectable (the `ws` package supplies a browser-like
 *     WebSocket implementation for the background worker)
 *
 * Test-only. Never shipped inside the extension.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = path.resolve(__dirname, "../../extension");
const DEPS_DIR = path.resolve(__dirname, "../../.testdeps/node_modules");

export function readExtFile(rel) {
  return fs.readFileSync(path.join(EXTENSION_DIR, rel), "utf8");
}

export function readManifest() {
  return JSON.parse(readExtFile("manifest.json"));
}

export async function loadJsdomModule() {
  const mod = await import(path.join(DEPS_DIR, "jsdom/lib/api.js"));
  return mod.JSDOM ? mod : mod.default || mod;
}

export async function loadWsModule() {
  const mod = await import(path.join(DEPS_DIR, "ws/index.js"));
  return mod.default || mod;
}

export function depsAvailable() {
  return fs.existsSync(path.join(DEPS_DIR, "jsdom")) && fs.existsSync(path.join(DEPS_DIR, "ws"));
}

/* ── Arena page simulation ─────────────────────────────────────────── */

export function buildArenaPage(JSDOMmod, { withComposer = true, composer = "textarea" } = {}) {
  const JSDOM = JSDOMmod.JSDOM || JSDOMmod;
  const html = withComposer
    ? `<!doctype html><html><body>
         <h1>My Arena Conversation</h1>
         <main>
           <ol class="flex-col-reverse">
             <li class="justify-end"><div class="prose">hello agent</div></li>
             <li><div class="prose">Hi! Ready when you are.</div></li>
           </ol>
           <form>
             ${composer === "contenteditable"
               ? '<div class="ProseMirror" contenteditable="true" role="textbox" aria-label="Ask anything"></div>'
               : '<textarea placeholder="Ask anything"></textarea>'}
             <button type="button" aria-label="Send message">Send</button>
             <button type="button" aria-label="Stop generating" hidden>Stop</button>
           </form>
         </main>
       </body></html>`
    : `<!doctype html><html><body><h1>Not a chat</h1><div>plain page</div></body></html>`;

  return new JSDOM(html, {
    url: "https://arena.ai/agent/abc123",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
}

/**
 * jsdom has no layout engine, so every element reports offsetParent === null and
 * an empty getClientRects(). Content scripts legitimately use those APIs as a
 * "is this element visible?" test, so the harness emulates layout: connected
 * elements that are not display:none / hidden / aria-hidden report one rect.
 */
export function installLayoutEmulation(window) {
  const ElementProto = window.Element.prototype;
  Object.defineProperty(ElementProto, "offsetParent", {
    configurable: true,
    get() {
      if (!this.isConnected) return null;
      const style = window.getComputedStyle(this);
      if (style.display === "none" || style.visibility === "hidden") return null;
      if (this.hasAttribute && (this.hasAttribute("hidden") || this.getAttribute("aria-hidden") === "true")) {
        return null;
      }
      return this.parentElement;
    },
  });
  ElementProto.getClientRects = function getClientRects() {
    if (!this.isConnected) return [];
    const style = window.getComputedStyle(this);
    if (style.display === "none" || style.visibility === "hidden") return [];
    if (this.hasAttribute && (this.hasAttribute("hidden") || this.getAttribute("aria-hidden") === "true")) {
      return [];
    }
    const rect = { x: 0, y: 0, top: 0, left: 0, width: 100, height: 20, right: 100, bottom: 20 };
    return [rect];
  };
  ElementProto.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
      toJSON() {
        return this;
      },
    };
  };
  // jsdom does not implement form submission; emulate the browser's event.
  const HTMLFormElementProto = window.HTMLFormElement.prototype;
  HTMLFormElementProto.requestSubmit = function requestSubmit(submitter) {
    const evt = new window.Event("submit", { bubbles: true, cancelable: true });
    void submitter;
    this.dispatchEvent(evt);
  };
}

/** jsdom lacks DataTransfer; provide the minimum the adapters use. */
export function installPolyfills(window) {
  if (typeof window.DataTransfer === "undefined") {
    window.eval(`
      (function () {
        class FakeFileList {
          constructor(files) { this._files = files; }
          get length() { return this._files.length; }
          item(i) { return this._files[i] || null; }
          [Symbol.iterator]() { return this._files[Symbol.iterator](); }
        }
        class DataTransfer {
          constructor() { this._files = []; this.items = { add: (f) => this._files.push(f) }; }
          get files() { return new FakeFileList(this._files); }
        }
        window.DataTransfer = DataTransfer;
      })();
    `);
  }
}

/* ── chrome.* shim ─────────────────────────────────────────────────── */

export function createBus() {
  return {
    runtimeListeners: [], // background worker listeners
    tabListeners: new Map(), // tabId -> content-script listeners
    tabs: [], // open tab ids
    storage: new Map(),
    removedTabListeners: [],
  };
}

export function chromeForContentScript(bus, tabId) {
  const listeners = [];
  bus.tabListeners.set(tabId, listeners);
  return {
    runtime: {
      id: "apc-test-extension-id",
      lastError: undefined,
      onMessage: { addListener: (fn) => listeners.push(fn) },
      sendMessage(message, callback) {
        deliverToBackground(bus, message, { tab: { id: tabId } })
          .then((resp) => callback && callback(resp))
          .catch(() => callback && callback(undefined));
      },
      getURL: (p) => `chrome-extension://apc-test-extension-id/${p}`,
    },
  };
}

export function chromeForBackground(bus, { WebSocketImpl }) {
  return {
    runtime: {
      id: "apc-test-extension-id",
      lastError: undefined,
      onMessage: { addListener: (fn) => bus.runtimeListeners.push(fn) },
      onInstalled: { addListener: (fn) => (bus.onInstalled = fn) },
      onStartup: { addListener: (fn) => (bus.onStartup = fn) },
      getURL: (p) => `chrome-extension://apc-test-extension-id/${p}`,
      sendMessage() {
        return Promise.reject(new Error("No receiver for runtime.sendMessage in tests"));
      },
    },
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (bus.storage.has(k)) out[k] = bus.storage.get(k);
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) bus.storage.set(k, v);
          return undefined;
        },
      },
    },
    tabs: {
      query(_q, cb) {
        const tabs = bus.tabs.map((id) => ({ id }));
        if (cb) cb(tabs);
        return Promise.resolve(tabs);
      },
      sendMessage(tabId, message) {
        return new Promise((resolve, reject) => {
          const list = bus.tabListeners.get(tabId);
          if (!list || list.length === 0) {
            reject(new Error("Could not establish connection. Receiving end does not exist."));
            return;
          }
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error("The message port closed before a response was received."));
            }
          }, 8000);
          for (const fn of list) {
            try {
              fn(message, {}, (resp) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(resp);
              });
            } catch (err) {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
              }
              return;
            }
          }
        });
      },
      onRemoved: { addListener: (fn) => bus.removedTabListeners.push(fn) },
    },
    WebSocket: WebSocketImpl,
  };
}

/** MV3-accurate runtime.sendMessage delivery to background listeners. */
export function deliverToBackground(bus, message, sender) {
  return new Promise((resolve, reject) => {
    if (bus.runtimeListeners.length === 0) {
      reject(new Error("Could not establish connection. Receiving end does not exist."));
      return;
    }
    let settled = false;
    const sendResponse = (resp) => {
      if (settled) return;
      settled = true;
      resolve(resp);
    };
    for (const fn of bus.runtimeListeners) {
      try {
        fn(message, sender || {}, sendResponse);
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
        return;
      }
    }
  });
}

/* ── Boot helpers ──────────────────────────────────────────────────── */

export function createBackgroundContext(bus, WebSocketImpl) {
  // Track timers so a test can tear the "service worker" down cleanly.
  const timers = new Set();
  const trackTimeout = (fn, ms, ...rest) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms, ...rest);
    timers.add(id);
    return id;
  };
  const trackInterval = (fn, ms, ...rest) => {
    const id = setInterval(fn, ms, ...rest);
    timers.add(id);
    return id;
  };
  const untrack = (id) => {
    timers.delete(id);
    clearTimeout(id);
    clearInterval(id);
  };

  const ctx = {
    chrome: chromeForBackground(bus, { WebSocketImpl }),
    WebSocket: WebSocketImpl,
    console,
    setTimeout: trackTimeout,
    clearTimeout: untrack,
    setInterval: trackInterval,
    clearInterval: untrack,
    queueMicrotask,
    JSON,
    Promise,
    Map,
    Set,
    Date,
    Math,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Error,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readExtFile("background.js"), ctx, { filename: "background.js" });
  ctx.__shutdown = () => {
    for (const id of [...timers]) untrack(id);
    timers.clear();
  };
  return ctx;
}

/** Inject a manifest content script's files into the page as classic scripts. */
export function injectContentScripts(window, files) {
  for (const rel of files) {
    window.eval(readExtFile(rel));
  }
}

/**
 * Boot N independent Arena tabs sharing ONE background service worker, which is
 * exactly how Chrome behaves (one worker, many tabs).
 */
export async function bootExtensionTabs(count = 2) {
  const JSDOMmod = await loadJsdomModule();
  const WebSocketImpl = await loadWsModule();

  const bus = createBus();
  // Pair the worker with the bridge the Python driver started.
  bus.storage.set("bridgePort", Number(process.env.APC_TEST_BRIDGE_PORT || 0));
  bus.storage.set("authToken", String(process.env.APC_TEST_BRIDGE_TOKEN || "").trim());
  const pages = [];
  for (let i = 0; i < count; i++) {
    const tabId = i + 1;
    const page = buildArenaPage(JSDOMmod);
    const window = page.window;
    installPolyfills(window);
    installLayoutEmulation(window);
    window.alert = (msg) => {
      window.__alerts = window.__alerts || [];
      window.__alerts.push(String(msg));
    };
    window.chrome = chromeForContentScript(bus, tabId);
    bus.tabs.push(tabId);

    const sent = [];
    const form = window.document.querySelector("form");
    const sendBtn = form.querySelector('button[aria-label*="Send" i]');
    sendBtn.addEventListener("click", () => {
      const ta = form.querySelector("textarea");
      sent.push(ta.value);
      ta.value = ""; // Arena clears the composer after accepting the message
    });
    pages.push({ tabId, window, sent, form });
  }

  const bg = createBackgroundContext(bus, WebSocketImpl);

  const manifest = readManifest();
  for (const page of pages) {
    injectContentScripts(page.window, manifest.content_scripts[0].js);
    if (page.window.__arenaPC) page.window.__arenaPC.boot();
  }

  return { bus, bg, pages };
}

/** Append an assistant turn to the simulated Arena conversation. */
export function appendAssistantTurn(window, text) {
  const ol = window.document.querySelector("ol.flex-col-reverse");
  const li = window.document.createElement("li");
  const prose = window.document.createElement("div");
  prose.className = "prose";
  prose.textContent = text;
  li.appendChild(prose);
  ol.insertBefore(li, ol.firstChild); // newest first
  return li;
}

export function appendUserTurn(window, text) {
  const ol = window.document.querySelector("ol.flex-col-reverse");
  const li = window.document.createElement("li");
  li.className = "justify-end";
  const prose = window.document.createElement("div");
  prose.className = "prose";
  prose.textContent = text;
  li.appendChild(prose);
  ol.insertBefore(li, ol.firstChild);
  return li;
}

export function waitFor(predicate, { timeout = 15000, interval = 25, label = "condition" } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      let value;
      try {
        // Predicates may be async (e.g. "await a bridge round trip").
        value = await predicate();
      } catch (err) {
        reject(err);
        return;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, interval);
    };
    void tick();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
