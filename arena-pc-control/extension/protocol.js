/**
 * Arena PC Control — Pure Protocol Parser & Prompt Formatter.
 * Zero DOM dependencies so it runs identically in Chrome MV3 and Node.js unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ArenaPCProtocol = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const OPEN_TAG = "@@@ARENA_PC@@@";
  const CLOSE_TAG = "@@@END_ARENA_PC@@@";
  const BOOTSTRAP_TAG = "[ARENA-PC-SESSION-INIT]";

  const OPEN_RE = /@@@\s*ARENA_PC\s*@@@/i;
  const CLOSE_RE = /@@@\s*END_ARENA_PC\s*@@@/i;

  function stripFenceNoise(raw) {
    return String(raw || "")
      .trim()
      .replace(/^```(?:json|javascript|js|txt)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/^copy\s+/i, "")
      .trim();
  }

  /**
   * Returns true if an assistant message has started emitting an action block
   * that has not closed yet (streaming still in progress).
   */
  function isStreamingIncomplete(text) {
    const src = String(text || "");
    const openMatch = OPEN_RE.exec(src);
    if (!openMatch) return false;
    const afterOpen = src.slice(openMatch.index + openMatch[0].length);
    return !CLOSE_RE.test(afterOpen);
  }

  /**
   * Parses an assistant turn into one of:
   *  - { kind: "final_answer" }
   *  - { kind: "tool_call", tool: string, arguments: object }
   *  - { kind: "multi_error", count: number }
   *  - { kind: "parse_error", reason: string }
   */
  function extractAction(text) {
    const src = String(text || "");
    if (!OPEN_RE.test(src)) {
      if (CLOSE_RE.test(src)) {
        return {
          kind: "parse_error",
          reason: `Found closing ${CLOSE_TAG} without opening ${OPEN_TAG}.`,
        };
      }
      return { kind: "final_answer" };
    }

    if (isStreamingIncomplete(src)) {
      return {
        kind: "parse_error",
        reason: `Action block opened with ${OPEN_TAG} was cut off before ${CLOSE_TAG}.`,
      };
    }

    const blocks = [];
    let cursor = 0;
    while (cursor < src.length) {
      const rest = src.slice(cursor);
      const om = OPEN_RE.exec(rest);
      if (!om) break;
      const bodyStart = cursor + om.index + om[0].length;
      const afterBody = src.slice(bodyStart);
      const cm = CLOSE_RE.exec(afterBody);
      if (!cm) {
        return {
          kind: "parse_error",
          reason: `Second action block was not closed with ${CLOSE_TAG}.`,
        };
      }
      blocks.push(afterBody.slice(0, cm.index));
      cursor = bodyStart + cm.index + cm[0].length;
    }

    if (blocks.length > 1) {
      return {
        kind: "multi_error",
        count: blocks.length,
      };
    }

    const cleaned = stripFenceNoise(blocks[0]);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      return {
        kind: "parse_error",
        reason: `Invalid JSON inside ${OPEN_TAG}: ${err.message}`,
      };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        kind: "parse_error",
        reason: "Action payload must be a JSON object: {\"tool\": \"...\", \"arguments\": {...}}.",
      };
    }

    const toolName = parsed.tool || parsed.command;
    if (typeof toolName !== "string" || !toolName.trim()) {
      return {
        kind: "parse_error",
        reason: "Missing string key \"tool\" in action JSON.",
      };
    }

    const args = parsed.arguments || parsed.params || {};
    if (typeof args !== "object" || Array.isArray(args) || args === null) {
      return {
        kind: "parse_error",
        reason: "\"arguments\" must be a JSON object.",
      };
    }

    return {
      kind: "tool_call",
      tool: toolName.trim(),
      arguments: args,
    };
  }

  function buildCorrectionPrompt(parseOutcome) {
    if (parseOutcome.kind === "multi_error") {
      return (
        `[SYSTEM FEEDBACK] You emitted ${parseOutcome.count} tool blocks in one message. ` +
        `Emit AT MOST ONE action block per turn, wait for its observation, then decide the next step.`
      );
    }
    return (
      `[SYSTEM FEEDBACK] Tool call could not be parsed (${parseOutcome.reason}). ` +
      `Rewrite it as a single valid fenced block:\n` +
      "```json\n" +
      `${OPEN_TAG}\n{"tool": "tool_name", "arguments": {}}\n${CLOSE_TAG}\n` +
      "```"
    );
  }

  function formatToolObservation(toolName, result) {
    const status = result && result.ok ? "SUCCESS" : "ERROR";
    const body = (result && result.text) ? String(result.text) : JSON.stringify(result || {});
    const imgNote =
      result && Array.isArray(result.images) && result.images.length > 0
        ? `\n[Attached ${result.images.length} screenshot image(s) for visual inspection]`
        : "";
    return `[OBSERVATION — ${toolName} — ${status}]\n${body.slice(0, 12000)}${imgNote}`;
  }

  function buildBootstrapPrompt(tools, customNotes) {
    const toolLines = (tools || []).map((t) => {
      const req = (t.inputSchema && t.inputSchema.required) || [];
      const props = Object.keys((t.inputSchema && t.inputSchema.properties) || {});
      const sig = props.map((p) => (req.includes(p) ? `${p}*` : p)).join(", ");
      return `- ${t.name}(${sig}): ${t.description || ""}`;
    });

    const extra = customNotes && String(customNotes).trim()
      ? `\n\nUSER NOTES:\n${String(customNotes).trim()}`
      : "";

    return (
      `${BOOTSTRAP_TAG}\n` +
      `You are connected to the user's local Windows PC through Arena PC Control (Local Secure MCP Bridge).\n` +
      `To invoke a tool, write AT MOST ONE fenced block in your reply using this exact envelope:\n` +
      "```json\n" +
      `${OPEN_TAG}\n{"tool": "system_info", "arguments": {}}\n${CLOSE_TAG}\n` +
      "```\n\n" +
      `OPERATING PRINCIPLES:\n` +
      `1. Observe -> Plan -> Execute ONE step -> Verify result. Never assume an action succeeded before reading its [OBSERVATION].\n` +
      `2. Prefer structured tools first: fs_* for files, Playwright browser_* / web_fetch_readable for web pages, ui_inspect_window for Windows apps, and screen_capture + input_mouse/input_keyboard only when UI controls need visual inspection.\n` +
      `3. Respect security boundaries: destructive actions, package installs, and outside-workspace writes trigger a user approval dialog. Never attempt privilege elevation or sensitive credential access.\n` +
      `4. Use memory_recall / memory_save to maintain verified project context across sessions.\n` +
      `5. When the user's task is complete, answer normally WITHOUT ${OPEN_TAG}.\n\n` +
      `AVAILABLE MCP TOOLS (${toolLines.length}):\n` +
      toolLines.join("\n") +
      extra +
      `\n\nConfirm readiness in one brief sentence and wait for the user's instruction.`
    );
  }

  return {
    OPEN_TAG,
    CLOSE_TAG,
    BOOTSTRAP_TAG,
    extractAction,
    isStreamingIncomplete,
    buildCorrectionPrompt,
    formatToolObservation,
    buildBootstrapPrompt,
  };
});
