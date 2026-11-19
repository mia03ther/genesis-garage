import test from "node:test";
import assert from "node:assert/strict";
import {
  CREWS,
  Practice,
  power,
  validateAction,
  sceneView,
  cellFor,
  nextContribution,
} from "./domain.js";
import {
  CommunityGateway,
  encodeAction,
  publicBatchRpc,
  words,
} from "./gateway.js";

const encodedWords = (values) =>
  "0x" +
  values
    .map((value) => BigInt(value).toString(16).padStart(64, "0"))
    .join("");

function communityReadResponse(params) {
  const selector = params[0].data.slice(0, 10);
  if (selector === "0x7cd3229a") return encodedWords(Array(243).fill(0));
  if (selector === "0x7cc96380") return encodedWords([7]);
  if (selector === "0x6c4470fb") return encodedWords([3]);
  if (selector === "0x200d2ed2") return encodedWords(Array(87).fill(0));
  if (selector === "0xe0ba8cea") return encodedWords([1, 123, 100]);
  if (selector === "0x3e5beab9") return encodedWords([9]);
  throw Error(`Unexpected selector ${selector}`);
}
test("three roles restore the island; removing the source changes the actual goal", () => {
  const w = new Practice();
  for (const [actor, cell, kind] of [
    ["A", 41, 2],
    ["B", 49, 3],
    ["C", 39, 4],
    ["B", 50, 3],
    ["C", 31, 7],
  ])
    w.apply(actor, { type: "build", cell, kind, rotation: 0 });
  assert.equal(w.snapshot().restored, true);
  assert.deepEqual(w.balances, { A: 7, B: 6, C: 3 });
  w.apply("A", { type: "remove", cell: 41 });
  assert.equal(w.snapshot().restored, false);
  assert.equal(w.balances.A, 12);
  assert.deepEqual(Practice.restore(w.export()).snapshot(), w.snapshot());
});
test("invalid, occupied and foreign-owned actions are atomic", () => {
  const w = new Practice();
  w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 0 });
  const before = w.export();
  for (const a of [
    { type: "build", cell: 41, kind: 3, rotation: 0 },
    { type: "remove", cell: 41 },
    { type: "build", cell: 0, kind: 3, rotation: 0 },
    { type: "build", cell: 4, kind: 3, rotation: 0 },
    { type: "build", cell: 40, kind: 3, rotation: 0 },
  ]) {
    assert.throws(() => w.apply("B", a));
    assert.equal(w.export(), before);
  }
  assert.throws(() => w.apply("D", { type: "remove", cell: 41 }));
});
test("refunds do not duplicate allowance and zero supply routes cannot power disconnected modules", () => {
  const w = new Practice();
  for (let i = 0; i < 100; i++) {
    w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 0 });
    w.apply("A", { type: "remove", cell: 41 });
  }
  assert.equal(w.balances.A, 12);
  const kinds = Array(81).fill(0);
  kinds[40] = 8;
  kinds[42] = 2;
  assert.equal(power(kinds, 1).supply, 1);
  assert.equal(power(kinds, 1).active.has(42), false);
});
test("scene adapter and ABI encoding preserve cell identity and validate sizes", () => {
  const w = new Practice();
  w.apply("A", { type: "build", cell: 41, kind: 2, rotation: 3 });
  const view = sceneView(w.snapshot());
  assert.equal(view.modules.find((m) => m.kind === "generator").rotation, 3);
  assert.ok(view.network().active.has("1,0"));
  assert.equal(cellFor(1, 0), 41);
  assert.equal(
    encodeAction({ type: "build", cell: 41, kind: 2, rotation: 3 }),
    "0x50548d40" +
      [41, 2, 3].map((n) => n.toString(16).padStart(64, "0")).join(""),
  );
  assert.throws(() =>
    encodeAction({ type: "build", cell: -1, kind: 1, rotation: 0 }),
  );
  assert.throws(() => words("0x00", 1));
  assert.deepEqual(words("0x" + "0".repeat(63) + "1", 1), [1n]);
});
test("malformed practice imports cannot change balances or inject snapshots", () => {
  assert.throws(() =>
    Practice.restore(
      '{"format":"genesis.community.practice","version":2,"actions":[]}',
    ),
  );
  const w = new Practice();
  const body = JSON.parse(w.export());
  body.balance = 999;
  assert.throws(() => Practice.restore(JSON.stringify(body)));
  assert.throws(() => Practice.restore("x".repeat(40001)));
  assert.throws(() =>
    validateAction(w, "A", 0, {
      type: "build",
      cell: 41,
      kind: 1,
      rotation: 0,
    }),
  );
});

test("crowd crews produce deterministic one-tap contributions", () => {
  const world = new Practice();
  const expected = [
    ["A", "power", 2],
    ["B", "habitat", 3],
    ["C", "lifeline", 4],
    ["B", "habitat", 3],
    ["C", "lifeline", 7],
  ];
  for (const [actor, crew, kind] of expected) {
    const action = nextContribution(world.snapshot(), crew);
    assert.equal(action.kind, kind);
    world.apply(actor, action);
  }
  assert.equal(world.snapshot().restored, true);
  assert.equal(CREWS.every((crew) => nextContribution(world.snapshot(), crew.id) === null), true);
});

test("community reads batch six calls at one snapshot block", async () => {
  const requests = [],
    batches = [],
    request = async (method, params) => {
      requests.push({ method, params });
      if (method === "eth_blockNumber") return "0xabc";
      throw Error(`Unexpected individual ${method}`);
    },
    batch = async (calls) => {
      batches.push(calls);
      return calls.map(({ params }) => communityReadResponse(params));
    },
    gateway = new CommunityGateway(
      request,
      "0x1111111111111111111111111111111111111111",
      "0x279f",
      "0".repeat(64),
      batch,
    ),
    snapshot = await gateway.read(
      "0x2222222222222222222222222222222222222222",
    );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "eth_blockNumber");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 6);
  assert.equal(batches[0].every(({ method }) => method === "eth_call"), true);
  assert.equal(batches[0].every(({ params }) => params[1] === "0xabc"), true);
  assert.equal(snapshot.block, "0xabc");
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.participants, 3);
  assert.equal(snapshot.balance, 9);
  assert.equal(snapshot.phase, 1);
});

test(
  "community reads preserve the original path when batch is unavailable",
  async () => {
    const requests = [],
      request = async (method, params) => {
        requests.push({ method, params });
        if (method === "eth_blockNumber") return "0xdef";
        if (method === "eth_call") return communityReadResponse(params);
        throw Error(`Unexpected method ${method}`);
      },
      gateway = new CommunityGateway(
        request,
        "0x1111111111111111111111111111111111111111",
        "0x279f",
        "0".repeat(64),
        async () => {
          throw Error("Batch unsupported");
        },
      ),
      snapshot = await gateway.read(
        "0x2222222222222222222222222222222222222222",
      ),
      calls = requests.filter(({ method }) => method === "eth_call");

    assert.equal(requests.length, 7);
    assert.equal(calls.length, 6);
    assert.equal(calls.every(({ params }) => params[1] === "0xdef"), true);
    assert.equal(snapshot.revision, 7);
    assert.equal(snapshot.balance, 9);
  },
);

test("public batch RPC matches responses by id and rejects omissions", async () => {
  const originalFetch = globalThis.fetch,
    calls = [
      { method: "first", params: [1] },
      { method: "second", params: [2] },
    ];
  try {
    globalThis.fetch = async (_url, options) => {
      const requests = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return [
            { jsonrpc: "2.0", id: requests[1].id, result: "second-result" },
            { jsonrpc: "2.0", id: requests[0].id, result: "first-result" },
          ];
        },
      };
    };
    assert.deepEqual(await publicBatchRpc(calls), [
      "first-result",
      "second-result",
    ]);

    globalThis.fetch = async () => ({
      ok: true,
      async json() {
        return [{ jsonrpc: "2.0", id: 1, result: "only-result" }];
      },
    });
    await assert.rejects(publicBatchRpc(calls), /omitted a call/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
