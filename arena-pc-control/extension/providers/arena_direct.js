/**
 * Arena PC Control — Arena Direct Mode Provider Adapter.
 *
 * Supports Arena.ai Direct mode chat interface (ol.flex-col-reverse, .prose,
 * textarea native setter, Send/Stop aria-label detection).
 * This is the primary adapter for normal Arena.ai chat conversations.
 */

import { BaseProviderAdapter } from "./base_adapter.js";

// Protocol is referenced lazily (inside methods) because window.ArenaPCProtocol
// is only available in the browser content-script context, not in Node.js tests.

class ArenaDirectAdapter extends BaseProviderAdapter {
  constructor(options = {}) {
    super({ ...options, name: "arena_direct", provider: "arena" });
  }

  /* ── 1. Agent Detection ────────────────────────────────────────── */
  detect() {
    if (typeof window === "undefined") return false;
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    const textarea = document.querySelector("form textarea");
    const sendBtn =
      document.querySelector('form button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]');
    return Boolean(ol && textarea && sendBtn);
  }

  /* ── 2. Conversation Identification ────────────────────────────── */
  identifyConversation() {
    if (typeof window === "undefined") return null;
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    if (!ol) return null;
    const title =
      document.querySelector("h1")?.textContent ||
      document.title ||
      "Arena Conversation";
    return {
      conversationId: `arena_conv_${Date.now()}`,
      title,
      url: window.location.href,
    };
  }

  /* ── 3. Message Observation ────────────────────────────────────── */
  observeNewMessages() {
    if (typeof window === "undefined") return [];
    const ol =
      document.querySelector("ol.flex-col-reverse") ||
      [...document.querySelectorAll("ol")].find((el) => el.querySelector(".prose"));
    if (!ol) return [];

    const items = [...ol.children].reverse();
    const assistantProse = [];
    for (const item of items) {
      if (item.classList.contains("justify-end")) continue; // User turn
      const prose = item.querySelector(".prose");
      if (prose) {
        assistantProse.push(prose.innerText || prose.textContent || "");
      }
    }

    // Return only new messages since last observation
    const newMessages = assistantProse.slice(this.lastProcessedMessageIndex);
    if (assistantProse.length > this.lastProcessedMessageIndex) {
      this.lastProcessedMessageIndex = assistantProse.length;
    }
    return newMessages;
  }

  /* ── 4. Tool-Call Instruction Delivery ─────────────────────────── */
  async deliverToolCall(toolName, argumentsObj) {
    if (typeof window === "undefined") return false;
    const textarea = document.querySelector("form textarea");
    if (!textarea) return false;

    const Protocol = window.ArenaPCProtocol;
    const payload = JSON.stringify({ tool: toolName, arguments: argumentsObj });
    const block = `\n@@@ARENA_PC@@@\n${payload}\n@@@END_ARENA_PC@@@\n`;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    nativeSetter.call(textarea, textarea.value + block);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const sendBtn =
      document.querySelector('form button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }
    return false;
  }

  /* ── 5. Tool Execution Response Delivery ───────────────────────── */
  async deliverObservation(toolName, result) {
    if (typeof window === "undefined") return false;
    const textarea = document.querySelector("form textarea");
    if (!textarea) return false;

    const Protocol = window.ArenaPCProtocol;
    const status = result && result.ok ? "SUCCESS" : "ERROR";
    const body = (result && result.text) ? String(result.text) : JSON.stringify(result || {});
    const imgNote =
      result && Array.isArray(result.images) && result.images.length > 0
        ? `\n[Attached ${result.images.length} screenshot image(s)]`
        : "";
    const observation = `[OBSERVATION — ${toolName} — ${status}]\n${body.slice(0, 12000)}${imgNote}`;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    nativeSetter.call(textarea, textarea.value + "\n" + observation);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const sendBtn =
      document.querySelector('form button[aria-label*="Send" i]') ||
      document.querySelector('form button[type="submit"]');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }
    return false;
  }

  /* ── 6. Streaming Detection ────────────────────────────────────── */
  isStreamingIncomplete(text) {
    // Fast-path pure check (works without DOM/browser):
    const OPEN_RE = /@@@\s*ARENA_PC\s*@@@/i;
    const CLOSE_RE = /@@@\s*END_ARENA_PC\s*@@@/i;
    const src = String(text || "");
    const openMatch = OPEN_RE.exec(src);
    if (!openMatch) return false;
    const afterOpen = src.slice(openMatch.index + openMatch[0].length);
    if (!CLOSE_RE.test(afterOpen)) return true;

    // If browser Protocol is available, prefer its implementation
    if (typeof window !== "undefined") {
      const Protocol = window.ArenaPCProtocol;
      if (Protocol && Protocol.isStreamingIncomplete) {
        return Protocol.isStreamingIncomplete(text);
      }
    }
    return false;
  }

  /* ── 7. Error Detection ────────────────────────────────────────── */
  detectError() {
    if (typeof window === "undefined") return false;
    // Detect Stop button (generation interrupted) or error messages
    const stopBtn = document.querySelector('button[aria-label*="Stop" i]');
    const errorMsg = document.querySelector('[role="alert"], .error, [data-error]');
    return Boolean(stopBtn || errorMsg);
  }
}

export { ArenaDirectAdapter };
