/**
 * Arena PC Control — Base Provider Adapter.
 *
 * Every supported AI agent interface inside Arena.ai gets its own adapter.
 * Each adapter handles:
 *   • Agent detection            — Is this page/interface supported?
 *   • Conversation identification — Which conversation/session is active?
 *   • Message observation        — Read assistant turns from the DOM
 *   • Prompt delivery            — Send tool calls / observations to the agent
 *   • Streaming detection        — Detect incomplete vs complete tool blocks
 *   • Error detection            — Detect failed actions and report
 *   • Session management         — Track session boundaries per agent
 *
 * Distribution format: UMD (same pattern as protocol.js). Manifest-V3 content
 * scripts are *classic* scripts — they cannot use ES `import`/`export` — so the
 * adapters register themselves on `globalThis.ArenaPCProviders` in the browser
 * and export the same classes through `module.exports` for Node.js unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ArenaPCProviders = Object.assign(root.ArenaPCProviders || {}, factory());
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class BaseProviderAdapter {
    constructor(options = {}) {
      this.name = options.name || "base";
      this.provider = options.provider || "unknown";
      this.enabled = true;
      this.sessionId = null;
      this.bridgeSessionId = null;
      this.conversationId = null;
      this.lastProcessedMessageIndex = 0;
      this.consecutiveErrors = 0;
      this.maxConsecutiveErrors = 4;
    }

    /* ── 1. Agent Detection ────────────────────────────────────────── */
    detect() {
      throw new Error("detect() must be implemented by subclass");
    }

    /* ── 2. Conversation Identification ────────────────────────────── */
    identifyConversation() {
      throw new Error("identifyConversation() must be implemented by subclass");
    }

    /* ── 3. Message Observation ────────────────────────────────────── */
    /**
     * Returns every assistant turn currently rendered, oldest first, as
     * `{ key, text }`. `key` is stable for a given turn's content so the caller
     * can deduplicate turns across polling cycles.
     */
    collectTurns() {
      throw new Error("collectTurns() must be implemented by subclass");
    }

    /** Contract helper: only the not-yet-seen assistant messages (as text). */
    observeNewMessages() {
      return [];
    }

    /* ── 4. Prompt delivery ────────────────────────────────────────── */
    /** Deliver arbitrary text (bootstrap prompt, correction, observation). */
    sendPrompt(_text, _options = {}) {
      throw new Error("sendPrompt() must be implemented by subclass");
    }

    /** Deliver a tool-call instruction block to the agent. */
    deliverToolCall(toolName, argumentsObj) {
      const payload = JSON.stringify({ tool: toolName, arguments: argumentsObj });
      const block =
        "```json\n@@@ARENA_PC@@@\n" + payload + "\n@@@END_ARENA_PC@@@\n```";
      return this.sendPrompt(block);
    }

    /** Feed a tool result (observation) back to the agent. */
    deliverObservation(toolName, result) {
      const Protocol =
        (typeof globalThis !== "undefined" && globalThis.ArenaPCProtocol) || null;
      const text = Protocol
        ? Protocol.formatToolObservation(toolName, result)
        : `[OBSERVATION — ${toolName} — ${result && result.ok ? "SUCCESS" : "ERROR"}]\n` +
          String((result && result.text) || "");
      const images =
        result && Array.isArray(result.images) ? result.images : [];
      return this.sendPrompt(text, { images });
    }

    /* ── 6. Streaming Detection ────────────────────────────────────── */
    isStreamingIncomplete(text) {
      const OPEN_RE = /@@@\s*ARENA_PC\s*@@@/i;
      const CLOSE_RE = /@@@\s*END_ARENA_PC\s*@@@/i;
      const src = String(text || "");
      const openMatch = OPEN_RE.exec(src);
      if (!openMatch) return false;
      return !CLOSE_RE.test(src.slice(openMatch.index + openMatch[0].length));
    }

    /* ── 7. Error Detection ────────────────────────────────────────── */
    detectError() {
      return false;
    }

    /* ── 8. A/B battle resolution (optional) ───────────────────────── */
    resolveBattle() {
      return false;
    }

    /* ── 9. Session Management ─────────────────────────────────────── */
    startSession() {
      this.sessionId = `apc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.conversationId = null;
      this.lastProcessedMessageIndex = 0;
      this.consecutiveErrors = 0;
      return this.sessionId;
    }

    endSession() {
      this.sessionId = null;
      this.conversationId = null;
    }

    setBridgeSessionId(sessionId) {
      this.bridgeSessionId = sessionId || null;
    }

    getBridgeSessionId() {
      return this.bridgeSessionId;
    }

    getSessionInfo() {
      const localId = this.sessionId || `apc-${Date.now()}`;
      return {
        name: this.name,
        provider: this.provider,
        sessionId: this.bridgeSessionId || localId,
        bridgeSessionId: this.bridgeSessionId,
        conversationId: this.conversationId,
        enabled: this.enabled,
      };
    }
  }

  return { BaseProviderAdapter };
});
