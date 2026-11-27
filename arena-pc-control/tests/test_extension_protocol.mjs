import test from "node:test";
import assert from "node:assert/strict";
import Protocol from "../extension/protocol.js";

test("detects streaming incomplete blocks accurately", () => {
  assert.equal(Protocol.isStreamingIncomplete("Hello world"), false);
  assert.equal(
    Protocol.isStreamingIncomplete('```json\n@@@ARENA_PC@@@\n{"tool": "fs_list"'),
    true
  );
  assert.equal(
    Protocol.isStreamingIncomplete(
      '```json\n@@@ARENA_PC@@@\n{"tool": "fs_list", "arguments": {"path": "~"}}\n@@@END_ARENA_PC@@@\n```'
    ),
    false
  );
});

test("extracts valid tool calls even with markdown fences or copy button noise", () => {
  const reply = [
    "Let me check your Desktop folder first.",
    "```json",
    "@@@ARENA_PC@@@",
    'Copy {"tool": "fs_list", "arguments": {"path": "~/Desktop"}}',
    "@@@END_ARENA_PC@@@",
    "```",
  ].join("\n");

  const parsed = Protocol.extractAction(reply);
  assert.equal(parsed.kind, "tool_call");
  assert.equal(parsed.tool, "fs_list");
  assert.deepEqual(parsed.arguments, { path: "~/Desktop" });
});

test("classifies normal answers without tags as final_answer", () => {
  const parsed = Protocol.extractAction("I have organized all 12 PDF files into ~/Documents/PDFs.");
  assert.equal(parsed.kind, "final_answer");
});

test("rejects multiple tool blocks in a single reply and builds correction prompt", () => {
  const reply = [
    '@@@ARENA_PC@@@ {"tool": "system_info", "arguments": {}} @@@END_ARENA_PC@@@',
    '@@@ARENA_PC@@@ {"tool": "fs_list", "arguments": {"path": "."}} @@@END_ARENA_PC@@@',
  ].join("\n");

  const parsed = Protocol.extractAction(reply);
  assert.equal(parsed.kind, "multi_error");
  assert.equal(parsed.count, 2);
  assert.match(Protocol.buildCorrectionPrompt(parsed), /AT MOST ONE action block/);
});

test("catches malformed JSON and produces actionable self-correction prompt", () => {
  const reply = '@@@ARENA_PC@@@\n{"tool": "fs_read", bad_json}\n@@@END_ARENA_PC@@@';
  const parsed = Protocol.extractAction(reply);
  assert.equal(parsed.kind, "parse_error");
  assert.match(Protocol.buildCorrectionPrompt(parsed), /could not be parsed/);
});
