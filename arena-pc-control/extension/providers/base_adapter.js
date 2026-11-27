/**
 * Arena PC Control — Base Provider Adapter.
 *
 * Every supported AI agent interface inside Arena.ai gets its own adapter.
 * Each adapter handles:
 *   • Agent detection        — Is this page/interface supported?
 *   • Conversation identification — Which conversation/session is active?
 *   • Message observation    — Read assistant messages from the DOM
 *   • Tool-call instruction delivery — Send tool calls to the agent
 *   • Tool execution response delivery — Feed observations back
 *   • Streaming responses    — Detect incomplete vs complete tool blocks
 *   • Error detection        — Detect failed actions and report
 *   • Session management     — Track session boundaries per agent
 *
 * Adapters are registered in background.js and matched against the current
 * page automatically. The extension activates the appropriate adapter.
 */

export class BaseProviderAdapter {
  constructor(options = {}) {
    this.name = options.name || "base";
    this.provider = options.provider || "unknown";
    this.enabled = true;
    this.sessionId = null;
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
  observeNewMessages() {
    throw new Error("observeNewMessages() must be implemented by subclass");
  }

  /* ── 4. Tool-Call Instruction Delivery ─────────────────────────── */
  deliverToolCall(toolName, argumentsObj) {
    throw new Error("deliverToolCall() must be implemented by subclass");
  }

  /* ── 5. Tool Execution Response Delivery ───────────────────────── */
  deliverObservation(toolName, result) {
    throw new Error("deliverObservation() must be implemented by subclass");
  }

  /* ── 6. Streaming Detection ────────────────────────────────────── */
  isStreamingIncomplete(text) {
    return false;
  }

  /* ── 7. Error Detection ────────────────────────────────────────── */
  detectError() {
    return false;
  }

  /* ── 8. Session Management ─────────────────────────────────────── */
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

  getSessionInfo() {
    return {
      name: this.name,
      provider: this.provider,
      sessionId: this.sessionId,
      conversationId: this.conversationId,
      enabled: this.enabled,
    };
  }
}
