import test from "node:test";
import assert from "node:assert/strict";

// The adapters are UMD files (classic content scripts cannot use ES modules),
// so they surface their classes through the CommonJS default export in Node.
import baseProviders from "../extension/providers/base_adapter.js";
import directProviders from "../extension/providers/arena_direct.js";

const { BaseProviderAdapter } = baseProviders;
const { ArenaDirectAdapter } = directProviders;

test("BaseProviderAdapter can be instantiated and has required methods", () => {
  const adapter = new BaseProviderAdapter({ name: "test", provider: "test_provider" });
  assert.equal(adapter.name, "test");
  assert.equal(adapter.provider, "test_provider");
  assert.equal(adapter.enabled, true);
  assert.equal(adapter.sessionId, null);

  // Required methods exist
  assert.equal(typeof adapter.detect, "function");
  assert.equal(typeof adapter.identifyConversation, "function");
  assert.equal(typeof adapter.observeNewMessages, "function");
  assert.equal(typeof adapter.deliverToolCall, "function");
  assert.equal(typeof adapter.deliverObservation, "function");
  assert.equal(typeof adapter.isStreamingIncomplete, "function");
  assert.equal(typeof adapter.detectError, "function");
  assert.equal(typeof adapter.startSession, "function");
  assert.equal(typeof adapter.endSession, "function");
  assert.equal(typeof adapter.getSessionInfo, "function");
});

test("BaseProviderAdapter session management", () => {
  const adapter = new BaseProviderAdapter({ name: "sess_test", provider: "prov" });
  const sid = adapter.startSession();
  assert.equal(typeof sid, "string");
  assert.equal(sid.length > 0, true);
  assert.equal(adapter.sessionId, sid);

  const info = adapter.getSessionInfo();
  assert.equal(info.sessionId, sid);
  assert.equal(info.name, "sess_test");
  assert.equal(info.provider, "prov");
  assert.equal(info.enabled, true);

  adapter.endSession();
  assert.equal(adapter.sessionId, null);
});

test("ArenaDirectAdapter has required structure", () => {
  const adapter = new ArenaDirectAdapter();
  assert.equal(adapter.name, "arena_direct");
  assert.equal(adapter.provider, "arena");
  assert.equal(typeof adapter.detect, "function");
  assert.equal(typeof adapter.identifyConversation, "function");
  assert.equal(typeof adapter.observeNewMessages, "function");
  assert.equal(typeof adapter.deliverToolCall, "function");
  assert.equal(typeof adapter.deliverObservation, "function");
  assert.equal(typeof adapter.isStreamingIncomplete, "function");
});

test("ArenaDirectAdapter streaming detection", () => {
  const adapter = new ArenaDirectAdapter();

  // Complete block -> not incomplete
  assert.equal(
    adapter.isStreamingIncomplete("@@@ARENA_PC@@@ {\"tool\": \"fs_list\"} @@@END_ARENA_PC@@@"),
    false
  );

  // Open block without close -> incomplete
  assert.equal(
    adapter.isStreamingIncomplete("@@@ARENA_PC@@@ {\"tool\": \"fs_list\"}"),
    true
  );

  // No block -> false
  assert.equal(adapter.isStreamingIncomplete("Hello, how are you?"), false);
});

test("ArenaDirectAdapter detectError returns boolean", () => {
  const adapter = new ArenaDirectAdapter();
  // Without DOM, detectError should return false (no error elements found)
  assert.equal(typeof adapter.detectError(), "boolean");
});

test("BaseProviderAdapter abstract methods throw, optional ones degrade safely", () => {
  const adapter = new BaseProviderAdapter({ name: "base", provider: "base" });
  // Truly abstract: a subclass MUST provide these.
  assert.throws(() => adapter.detect());
  assert.throws(() => adapter.identifyConversation());
  assert.throws(() => adapter.sendPrompt("t"));
  assert.throws(() => adapter.deliverObservation("t", {}));
  // Safe defaults: the content script polls these on every tick, so an
  // unimplemented base must NOT throw (it would break the whole polling loop).
  assert.deepEqual(adapter.observeNewMessages(), []);
  assert.equal(adapter.isStreamingIncomplete(), false);
  assert.equal(adapter.detectError(), false);
});

test("ArenaDirectAdapter bridge session ID get/set", () => {
  const adapter = new ArenaDirectAdapter();
  assert.equal(adapter.getBridgeSessionId(), null);

  adapter.setBridgeSessionId("sess_12345");
  assert.equal(adapter.getBridgeSessionId(), "sess_12345");

  // getSessionInfo should prefer bridgeSessionId
  const info = adapter.getSessionInfo();
  assert.equal(info.sessionId, "sess_12345");
  assert.equal(info.bridgeSessionId, "sess_12345");

  // Clear it
  adapter.setBridgeSessionId(null);
  assert.equal(adapter.getBridgeSessionId(), null);
  // Should fall back to local sessionId
  const info2 = adapter.getSessionInfo();
  assert.notEqual(info2.sessionId, null);
  assert.equal(info2.bridgeSessionId, null);
});
