/**
 * Arena PC Control — Arena Direct Mode Provider Adapter.
 *
 * Supports the Arena.ai Direct-mode chat interface:
 *   • conversation list   : ol.flex-col-reverse (newest-first) containing .prose
 *   • composer            : form textarea (React-controlled)
 *   • send / stop buttons : aria-label "Send…" / "Stop…" (localized variants too)
 *   • A/B battles         : role=region[aria-roledescription=carousel] slides;
 *                           candidate A (first slide) is always committed.
 *
 * Distribution format: UMD (same pattern as protocol.js) so this file works as
 * a Node.js ES import for tests AND as a classic content script in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./base_adapter.js"));
  } else {
    root.ArenaPCProviders = Object.assign(root.ArenaPCProviders || {}, factory(root.ArenaPCProviders || {}));
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (providers) {
  "use strict";

  const BaseProviderAdapter = providers.BaseProviderAdapter;

  const SEND_RETRY_DELAYS_MS = [0, 400, 900, 1600, 2400];

  function hasDom() {
    return typeof document !== "undefined" && !!document;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fnv(text) {
    let h = 0x811c9dc5;
    const src = String(text || "");
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16) + ":" + src.length;
  }

  class ArenaDirectAdapter extends BaseProviderAdapter {
    constructor(options = {}) {
      super({ ...options, name: "arena_direct", provider: "arena" });
      this._battleAt = 0;
    }

    /* ── 1. Agent Detection ────────────────────────────────────────── */
    /** Any composer the page offers: textarea first, then a rich-text editor. */
    getComposer() {
      return this.getTextarea() || this.getProseMirror();
    }

    detect() {
      if (!hasDom()) return false;
      // Requiring a <textarea> made the adapter reject Arena builds that use a
      // contenteditable editor — the extension then silently did nothing.
      return Boolean(
        this.getComposer() &&
          (this.getSendButton() || document.querySelector("form"))
      );
    }

    /* ── 2. Conversation Identification ────────────────────────────── */
    identifyConversation() {
      if (!hasDom()) return null;
      const loc = typeof window !== "undefined" ? window.location : null;
      this.conversationId =
        (loc && loc.pathname + loc.search) || `arena_conv_${Date.now()}`;
      const h1 = document.querySelector("h1");
      return {
        conversationId: this.conversationId,
        title: (h1 && h1.textContent) || (typeof document !== "undefined" && document.title) ||
          "Arena Conversation",
        url: (loc && loc.href) || "",
      };
    }

    /* ── DOM helpers (public so content scripts can share them) ────── */
    getConversationList() {
      if (!hasDom()) return null;
      return (
        document.querySelector("ol.flex-col-reverse") ||
        [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose")) ||
        null
      );
    }

    getTextarea() {
      if (!hasDom()) return null;
      const direct = document.querySelector("form textarea");
      if (direct) return direct;
      const all = [...document.querySelectorAll("textarea")];
      return all.find((t) => t.offsetParent !== null) || all[0] || null;
    }

    getComposerForm() {
      if (!hasDom()) return null;
      const ta = this.getTextarea();
      if (ta && ta.closest("form")) return ta.closest("form");
      return document.querySelector("form");
    }

    getSendButton() {
      if (!hasDom()) return null;
      const form = this.getComposerForm();
      const scope = form || document;
      const candidates = [
        ...scope.querySelectorAll('button[aria-label*="Send" i]'),
        ...scope.querySelectorAll('button[data-testid*="send" i]'),
        ...scope.querySelectorAll("form button[type='submit']"),
        ...scope.querySelectorAll('button[type="submit"]'),
      ];
      for (const b of candidates) {
        if (b.offsetParent === null && b.getClientRects().length === 0) continue;
        if (b.disabled || b.getAttribute("aria-disabled") === "true") continue;
        return b;
      }
      return null;
    }

    isGenerating() {
      if (!hasDom()) return false;
      // Never touch the send button while the composer is disabled (streaming).
      const ta = this.getTextarea();
      if (ta && (ta.disabled || ta.readOnly)) return true;
      // A "Stop" control only counts while it is actually visible: Arena keeps
      // hidden stop buttons in the DOM between turns.
      const candidates = document.querySelectorAll(
        'button[aria-label*="Stop" i], button[data-testid*="stop" i], button[aria-label*="Arrêt" i]'
      );
      for (const b of candidates) {
        if (b.offsetParent === null && b.getClientRects().length === 0) continue;
        if (b.hasAttribute("hidden") || b.getAttribute("aria-hidden") === "true") continue;
        return true;
      }
      return false;
    }

    _proseOf(item) {
      if (!item) return null;
      const slide = item.querySelector('[aria-roledescription="slide"]');
      return (slide || item).querySelector(".prose");
    }

    _isCarouselItem(item) {
      return !!item && !!item.querySelector('[role="region"][aria-roledescription="carousel"]');
    }

    /* ── 3. Message Observation ────────────────────────────────────── */
    collectTurns() {
      if (!hasDom()) return [];
      const ol = this.getConversationList();
      if (!ol) return [];
      const items = [...ol.children].reverse(); // DOM is newest-first
      const turns = [];
      for (const item of items) {
        if (!item) continue;
        if (item.classList && item.classList.contains("justify-end")) continue; // user turn
        const prose = this._proseOf(item);
        if (!prose) continue;
        const text = prose.innerText || prose.textContent || "";
        if (!text.trim()) continue;
        turns.push({ key: `t${turns.length}:${fnv(text)}`, text });
      }
      return turns;
    }

    observeNewMessages() {
      const turns = this.collectTurns();
      const fresh = turns.slice(this.lastProcessedMessageIndex).map((t) => t.text);
      this.lastProcessedMessageIndex = turns.length;
      return fresh;
    }

    /* ── 3b. A/B comparison carousel support ───────────────────────── */
    resolveBattle() {
      if (!hasDom()) return false;
      const now = Date.now();
      if (this._battleAt && now - this._battleAt < 6000) return false;
      this._battleAt = now;
      const buttons = [...document.querySelectorAll("button")];
      for (const b of buttons) {
        if (b.offsetParent === null) continue;
        if (b.disabled || b.getAttribute("aria-disabled") === "true") continue;
        const label = (b.textContent || b.getAttribute("aria-label") || "").trim();
        if (/^(continuer avec a|continue with a)$/i.test(label)) {
          try {
            b.click();
          } catch {
            /* ignore */
          }
          return true;
        }
      }
      return false;
    }

    /* ── 4/5. Prompt delivery ──────────────────────────────────────── */
    setNativeValue(textarea, value) {
      const proto = Object.getPrototypeOf(textarea);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(textarea, value);
      else textarea.value = value;
    }

    async stageImages(images) {
      if (!hasDom() || !Array.isArray(images) || images.length === 0) return false;
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      try {
        const dt = new DataTransfer();
        images.forEach((img, i) => {
          const bin = atob(img.data);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          const mime = img.mimeType || "image/jpeg";
          const ext = mime.includes("png") ? "png" : "jpg";
          dt.items.add(new File([bytes], `pc_capture_${Date.now()}_${i}.${ext}`, { type: mime }));
        });
        if (dt.files.length > 0) {
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(350);
          return true;
        }
      } catch {
        /* ignore malformed image frame */
      }
      return false;
    }

    getProseMirror() {
      if (!hasDom()) return null;
      const scope = this.getComposerForm() || document;
      return (
        scope.querySelector('[contenteditable="true"][role="textbox"]') ||
        scope.querySelector('.ProseMirror[contenteditable="true"]') ||
        scope.querySelector('div[contenteditable="true"]')
      );
    }

    /** Readable text of a rich-text composer (some builds omit innerText). */
    editorText(editor) {
      if (!editor) return "";
      if (typeof editor.innerText === "string") return editor.innerText;
      return editor.textContent || "";
    }

    /** Write into a contenteditable editor the way the browser would. */
    async setEditableText(editor, value) {
      if (!editor || !hasDom()) return false;
      editor.focus();
      // `execCommand` is deprecated on paper but is still the only API that
      // updates an editor's internal model (ProseMirror/Lexical) reliably.
      try {
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (typeof document.execCommand === "function") {
          document.execCommand("insertText", false, value);
        }
      } catch (err) {
        void err;
      }
      if (this.editorText(editor).trim() !== String(value).trim()) {
        editor.textContent = value;
      }
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, cancelable: true, data: value })
      );
      await sleep(120);
      return true;
    }

    /**
     * Put text in the composer and press send. Arena disables the send button
     * while a reply streams, so this retries and *verifies* that the composer
     * actually cleared before reporting success.
     *
     * Some builds of Arena render the composer as a contenteditable editor
     * instead of a <textarea>; both are supported so a UI change cannot silently
     * break delivery.
     */
    async sendPrompt(text, options = {}) {
      if (!hasDom() || !text) return false;
      const Protocol =
        (typeof globalThis !== "undefined" && globalThis.ArenaPCProtocol) || null;
      const payload = Protocol ? Protocol.truncateForSend(text) : String(text);
      const images = Array.isArray(options.images) ? options.images : [];

      for (const delay of SEND_RETRY_DELAYS_MS) {
        if (delay) await sleep(delay);
        if (this.isGenerating()) continue;

        if (images.length) await this.stageImages(images);

        let textarea = this.getTextarea();
        if (!textarea) {
          const editor = this.getProseMirror();
          if (!editor) return false;
          await this.setEditableText(editor, payload);
          const editorBtn = this.getSendButton();
          if (!editorBtn) continue;
          editorBtn.click();
          await sleep(200);
          // Success = the composer really emptied (same rule as the textarea path).
          if (!this.editorText(editor).trim()) return true;
          continue;
        }

        this.setNativeValue(textarea, payload);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(120);

        const btn = this.getSendButton();
        if (!btn) continue;
        btn.click();
        await sleep(150);

        if (!textarea.value || !textarea.value.trim()) return true;
      }

      // Last resort: submit the form directly.
      const form = this.getComposerForm();
      const textarea = this.getTextarea();
      if (!form || !textarea || this.isGenerating()) return false;
      this.setNativeValue(textarea, payload);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      await sleep(200);
      return !textarea.value || !textarea.value.trim();
    }

    async deliverToolCall(toolName, argumentsObj) {
      return this.sendPrompt(this.buildToolCallBlock(toolName, argumentsObj));
    }

    buildToolCallBlock(toolName, argumentsObj) {
      const payload = JSON.stringify({ tool: toolName, arguments: argumentsObj });
      return "```json\n@@@ARENA_PC@@@\n" + payload + "\n@@@END_ARENA_PC@@@\n```";
    }

    async deliverObservation(toolName, result) {
      const Protocol =
        (typeof globalThis !== "undefined" && globalThis.ArenaPCProtocol) || null;
      const text = Protocol
        ? Protocol.formatToolObservation(toolName, result)
        : `[OBSERVATION — ${toolName} — ${result && result.ok ? "SUCCESS" : "ERROR"}]\n` +
          String((result && result.text) || "");
      return this.sendPrompt(text, {
        images: (result && Array.isArray(result.images) && result.images) || [],
      });
    }

    /* ── 7. Error Detection ────────────────────────────────────────── */
    detectError() {
      if (!hasDom()) return false;
      return Boolean(
        document.querySelector('[role="alert"], .error, [data-error]')
      );
    }

    /* ── 8. Session Info ───────────────────────────────────────────── */
    getSessionInfo() {
      const localId = this.sessionId || `apc-${Date.now()}`;
      return {
        name: this.name,
        provider: this.provider,
        sessionId: this.bridgeSessionId || localId,
        bridgeSessionId: this.bridgeSessionId,
        enabled: this.enabled,
      };
    }
  }

  return { ArenaDirectAdapter };
});
