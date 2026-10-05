'use strict';
// Executes the actual inline application, not a second implementation of its state machine.
// These deterministic DOM/storage/worker doubles exercise logic; browser QA is still required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
function loadHtml(filename) {
  let html = fs.readFileSync(filename, 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  if (payload) html = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
  return html;
}
function createApp(filename, options = {}) {
  const html = loadHtml(filename), frames = new Map(), timers = new Map(), storage = new Map(options.storage || []);
  const downloads = [], revoked = [], blobs = new Map(), workers = [];
  let frameId = 0, timerId = 0, now = 0, context;
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn, opts = {}) { const list = this.listeners.get(type) || []; list.push({ fn, once: opts.once }); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.fn !== fn)); }
    dispatch(type, extra = {}) {
      const event = { type, target: this, currentTarget: this, key: '', button: 0, pointerId: 1, isPrimary: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const item of [...(this.listeners.get(type) || [])]) { item.fn(event); if (item.once) this.removeEventListener(type, item.fn); }
      if (this['on' + type]) this['on' + type](event);
      // Keyboard events reach capture/bubble listeners on document/window even after focus moves.
      if (this instanceof Element && ['input', 'change', 'click'].includes(type) && this.parentElement) this.parentElement.dispatch(type, event);
      return event;
    }
  }
  class Element extends Target {
    constructor(tag = 'div') {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.value = ''; this._text = ''; this.disabled = false; this.hidden = false; this.open = false; this.isConnected = true;
      const classes = new Set();
      this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle(x, value) { const has = value === undefined ? !classes.has(x) : value; if (has) classes.add(x); else classes.delete(x); return has; } };
      Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); } });
      this.style = { setProperty(key, value) { this[key] = value; } };
    }
    get textContent() { return this._text + this.children.map(el => el.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children.forEach(el => { el.isConnected = false; if (el === document.activeElement || el.contains(document.activeElement)) document.activeElement = document.body; }); this.children = []; }
    set innerHTML(value) { this.textContent = ''; this._html = value; parseHtml(String(value), this); }
    get innerHTML() { return this._html || this.textContent; }
    append(...children) { children.forEach(el => { el.parentElement = this; el.isConnected = true; this.children.push(el); }); }
    remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(el => el !== this); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key === 'class') this.className = value; else if (key === 'id') this.id = value; else if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value; else if (key === 'value') this.value = value; else if (['hidden', 'disabled', 'open'].includes(key)) this[key] = true; }
    getAttribute(key) { return key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null : this.attrs[key] ?? null; }
    hasAttribute(key) { return this.getAttribute(key) !== null; }
    get type() { return this.attrs.type || (this.tagName === 'INPUT' ? 'text' : ''); }
    removeAttribute(key) { delete this.attrs[key]; }
    contains(el) { return this.children.some(child => child === el || child.contains(el)); }
    replaceChildren(...children) { this.textContent = ''; this.append(...children); }
    focus() { if (this.disabled) return; if (document.activeElement === this) return; const previous = document.activeElement; document.activeElement = this; if (previous) previous.dispatch('blur'); this.dispatch('focus'); }
    click() { if (this.disabled) return; if (this.tagName === 'A' && this.download) downloads.push({ name: this.download, blob: blobs.get(this.href), href: this.href }); this.dispatch('click'); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
    setPointerCapture(id) { this.capture = id; }
    releasePointerCapture(id) { if (this.capture === id) { this.capture = null; this.dispatch('lostpointercapture', { pointerId: id }); } }
    getBoundingClientRect() { return { left: 0, top: 0, right: 600, bottom: 600, height: 60 }; }
    select() {} setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const attr = selector.match(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/);
      if (attr && !(attr[1] === 'open' ? this.open : attr[2] === undefined ? this.getAttribute(attr[1]) !== null : this.getAttribute(attr[1]) === attr[2])) return false;
      selector = selector.replace(/\[[^\]]+\]/g, '');
      const id = selector.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      const classes = [...selector.matchAll(/\.([\w-]+)/g)]; if (classes.some(match => !this.classList.contains(match[1]))) return false;
      const tag = selector.match(/^[a-z][\w-]*/i); return !tag || this.tagName === tag[0].toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(el => [...(el.matches(selector) ? [el] : []), ...el.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  }
  const document = new Target(); document.documentElement = new Element('html'); document.activeElement = null; document.hidden = false; document.visibilityState = 'visible'; document.hasFocus = () => true;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => document.querySelector('#' + id);
  document.execCommand = () => true;
  function decode(value) { return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  function parseHtml(markup, root) {
    const stack = [root], voids = new Set(['meta', 'link', 'input', 'img', 'br', 'hr', 'path', 'circle', 'rect']);
    for (const match of markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>|([^<]+)/gi)) {
      if (match[4]) { stack.at(-1)._text += decode(match[4]); continue; }
      const [, closing, rawTag, attrs] = match, tag = rawTag.toLowerCase(); if (tag === 'html') continue;
      if (closing) { if (voids.has(tag)) continue; const index = stack.map(el => el.tagName.toLowerCase()).lastIndexOf(tag); if (index > 0) stack.length = index; continue; }
      const element = new Element(tag);
      for (const a of attrs.matchAll(/([^\s=\/]+)(?:="([^"]*)"|'([^']*)'|=([^\s>]+))?/g)) element.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ''));
      stack.at(-1).append(element); if (!voids.has(tag) && !attrs.endsWith('/')) stack.push(element);
    }
    for (const select of root.querySelectorAll('select')) { const choices = select.querySelectorAll('option'); select.value = (choices.find(option => option.getAttribute('selected') !== null) || choices[0])?.value || ''; }
    for (const textarea of root.querySelectorAll('textarea')) textarea.value = textarea.textContent;
  }
  parseHtml(html, document.documentElement);
  document.body = document.querySelector('body'); document.head = document.querySelector('head');
  const window = new Target(); window.matchMedia = () => ({ matches: false }); window.scrollTo = () => {}; window.scrollY = 0;
  const setTimeout = fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout = id => timers.delete(id);
  const globals = { console, Blob, TextDecoder, TextEncoder, Uint8Array, HTMLElement: Element, document, window, navigator: { language: options.language || 'en', clipboard: { async writeText(text) { globals.clipboard = text; } } }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, crypto: require('node:crypto').webcrypto,
    performance: { now: () => now }, requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); }, setTimeout, clearTimeout,
    Worker: class { constructor() { workers.push(this); } postMessage(message) { this.message = message; } terminate() { this.terminated = true; } },
    URL: class TestURL extends URL { static createObjectURL(blob) { const url = 'blob:test-' + (blobs.size + 1); blobs.set(url, blob); return url; } static revokeObjectURL(url) { revoked.push(url); } }, atob: value => Buffer.from(value, 'base64').toString('binary'),
  };
  Object.assign(window, { setTimeout, clearTimeout, requestAnimationFrame: globals.requestAnimationFrame, cancelAnimationFrame: globals.cancelAnimationFrame });
  let source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).find(script => script.includes('const translations ='));
  if (!source) throw Error('Application script not found in ' + filename);
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.config.json'), 'utf8'));
  source = source.replace('__APP_CONFIG_JSON__', JSON.stringify(config)).replace('__BUILD_MANIFEST_JSON__', '{}').replace('__EMBEDDED_ASSET_BUNDLE_JSON__', '{}');
  // Test-only lexical access; the shipped app exposes no test API or mutable application state.
  source = source.replace(/\}\)\(\);\s*$/, 'globalThis.testRun = code => eval(code);\n})();');
  context = vm.createContext(globals); vm.runInContext(source, context, { filename });
  const app = { html, document, window, storage, frames, timers, downloads, revoked, globals, workers, run: code => context.testRun(code), el: id => document.getElementById(id),
    complete(worker = workers.at(-1)) { const messages = []; const workerContext = vm.createContext({ self: { postMessage: message => messages.push(message) }, URL, console, performance }); vm.runInContext('(' + app.run('generatorWorkerMain.toString()') + ')()', workerContext); workerContext.self.onmessage({ data: worker.message }); for (const message of messages) worker.onmessage?.({ data: message }); return messages; },
    frame(time) { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); },
    flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    input(el, value) { el.value = value; el.dispatch('input'); },
    async settle() { for (let index = 0; index < 8; index++) await Promise.resolve(); },
  };
  app.frame(0); return app;
}
module.exports = { createApp, loadHtml };
