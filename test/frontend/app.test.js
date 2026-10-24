import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

const app = await import("../../static/app.js");
const {
  CONTRACT_ADDRESS,
  CHAIN_ID,
  ABI,
  state,
  parsePrize,
  parseStake,
  validatePair,
  validatePlayerAddress,
  ensureWalletReady,
  executeWriteFlow,
  updateClient,
  readTournament,
  readSeat,
  readEntry,
  readTournamentCount,
  readReservedPrizes,
  fetchDeskStats,
  createTournament,
  authorizePlayer,
  registerHandle,
  settleTournament,
  returnUnclaimedPrize,
} = app;

if (!state) {
  throw new Error("static/app.js must export state");
}

describe("Game Play Tournament Prize App", () => {
  beforeEach(() => {
    state.provider = null;
    state.walletAddress = "";
    state.chainId = null;
    state.inFlight = false;
    state.isSubmitting = false;
    state.client = null;
    state.readClient = null;
  });

  it("exports required constants and state", () => {
    assert.equal(CONTRACT_ADDRESS, "0x3D6368539B1959A74229326853dfD783aC11A55D");
    assert.equal(CHAIN_ID, 61999);
    assert.ok(Array.isArray(ABI));
    assert.ok(ABI.some((item) => item.name === "create_tournament"));
    assert.ok(ABI.some((item) => item.name === "authorize"));
    assert.ok(ABI.some((item) => item.name === "register"));
    assert.ok(ABI.some((item) => item.name === "settle"));
    assert.ok(ABI.some((item) => item.name === "return_unclaimed"));
    assert.ok(ABI.some((item) => item.name === "get_tournament"));
    assert.ok(ABI.some((item) => item.name === "get_seat"));
    assert.ok(ABI.some((item) => item.name === "get_entry"));
    assert.ok(ABI.some((item) => item.name === "get_tournament_count"));
    assert.ok(ABI.some((item) => item.name === "get_reserved_prizes"));
  });

  it("parses prize with bigint only and rejects zero or >18 decimals", () => {
    assert.equal(typeof parsePrize, "function");
    assert.equal(parsePrize("0.05"), 50000000000000000n);
    assert.equal(parsePrize("1"), 1000000000000000000n);
    assert.equal(parsePrize("0.000000000000000001"), 1n);
    assert.throws(() => parsePrize("0"), /greater than zero/);
    assert.throws(() => parsePrize("0.0"), /greater than zero/);
    assert.throws(() => parsePrize("1.0000000000000000001"), /18/);
    assert.throws(() => parsePrize("abc"), /number|digits/);
    assert.equal(parseStake("1"), 1000000000000000000n);
  });

  it("rejects a same-host pair and non-allowlisted hosts", () => {
    assert.equal(typeof validatePair, "function");
    assert.throws(
      () => validatePair("https://liquipedia.net/a", "https://liquipedia.net/b"),
      /different hosts/
    );
    assert.throws(
      () => validatePair("https://invalid-host-xyz.com", "https://start.gg"),
      /allowlist/
    );
    const pair = validatePair(
      "https://liquipedia.net/rocketleague/Main_Page",
      "https://start.gg/tournament"
    );
    assert.equal(pair.length, 2);
    assert.equal(pair[0], "https://liquipedia.net/rocketleague/Main_Page");
    assert.equal(pair[1], "https://start.gg/tournament");
  });

  it("validates player addresses, rejects zero address and matching connected wallet", () => {
    assert.equal(typeof validatePlayerAddress, "function");
    const valid = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    assert.doesNotThrow(() => validatePlayerAddress(valid, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));
    assert.throws(() => validatePlayerAddress("0x0000000000000000000000000000000000000000"), /zero address/);
    assert.throws(() => validatePlayerAddress("not-an-address"), /0x followed by 40 hex/);
    assert.throws(() => validatePlayerAddress(valid, valid), /cannot match the connected wallet/);
  });

  it("refuses a write on the wrong chain or missing address", async () => {
    await assert.rejects(
      () => ensureWalletReady(),
      /Wallet address is required before writing/
    );

    state.walletAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    state.provider = { request: async () => "0x1" };
    state.chainId = 1;
    await assert.rejects(
      () => ensureWalletReady(),
      /61999|StudioNet|chain/
    );
  });

  it("runs executeWriteFlow against mock client returning hash and FINALIZED receipt", async () => {
    state.walletAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    state.chainId = 61999;
    state.provider = { request: async () => "0xf22f" };
    const hash = "0x" + "ab".repeat(32);

    let writeCalled = false;
    let afterAcceptedCalled = false;
    const recordedPhases = [];

    state.client = {
      writeContract: async (payload) => {
        writeCalled = true;
        assert.equal(payload.address, CONTRACT_ADDRESS);
        assert.equal(payload.functionName, "create_tournament");
        assert.equal(payload.account, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
        assert.equal(payload.value, 1000000000000000000n);
        return hash;
      },
      waitForTransactionReceipt: async ({ hash: txHash }) => {
        assert.equal(txHash, hash);
        return { status: 7, statusName: "FINALIZED" };
      },
    };

    const out = await executeWriteFlow(
      "create_tournament",
      [
        "City Cup",
        "Rocket League",
        "2026-12-31",
        "https://liquipedia.net/rocketleague/Main_Page",
        "https://start.gg/",
      ],
      1000000000000000000n,
      async (receipt, txHash) => {
        afterAcceptedCalled = true;
        assert.equal(receipt.statusName, "FINALIZED");
        assert.equal(txHash, hash);
      },
      (phase) => recordedPhases.push(phase)
    );

    assert.equal(out, hash);
    assert.equal(writeCalled, true);
    assert.equal(afterAcceptedCalled, true);
    assert.equal(state.inFlight, false);
    assert.deepEqual(recordedPhases, [
      "signature",
      "submitted",
      "wait finalized",
      "consensus",
      "execution",
      "read",
      "accepted",
    ]);
  });

  it("uses the neutral read caller with zero address and no from property", async () => {
    const readPayloads = [];
    let readClientOptions;
    globalThis.window = {
      createClient: (options) => {
        if (options.account === null) {
          readClientOptions = options;
        }
        return {
          readContract: async (payload) => {
            readPayloads.push(payload);
            if (payload.functionName === "get_tournament") {
              return JSON.stringify({
                organizer: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
                title: "City Cup",
                game: "Rocket League",
                bracket_date: "2026-12-31",
                claim_after: "2027-01-01",
                roster_url: "https://liquipedia.net/rocketleague/Main_Page",
                bracket_url: "https://start.gg/",
                prize: "1000000000000000000",
                status: "OPEN",
                winner_handle: "",
                winner: "0x0000000000000000000000000000000000000000",
                funds_disposition: "RESERVED",
              });
            }
            if (payload.functionName === "get_tournament_count") {
              return "1";
            }
            if (payload.functionName === "get_reserved_prizes") {
              return "1000000000000000000";
            }
            if (payload.functionName === "get_seat") {
              return JSON.stringify({
                player: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                handle: "ace",
              });
            }
            if (payload.functionName === "get_entry") {
              return JSON.stringify({
                player: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                handle: "ace",
              });
            }
            throw new Error(`Unexpected read method: ${payload.functionName}`);
          },
        };
      },
    };

    try {
      await updateClient();
      const details = await readTournament("1");
      assert.equal(details.title, "City Cup");
      assert.equal(details.status, "OPEN");
      assert.equal(details.funds_disposition, "RESERVED");
      assert.ok(readClientOptions);

      const stats = await fetchDeskStats();
      assert.equal(stats.tournamentCount, "1");
      assert.equal(stats.reservedPrizes, "1000000000000000000");

      const seat = await readSeat("1", "ace");
      assert.equal(seat.handle, "ace");

      const entry = await readEntry("1", "ace");
      assert.equal(entry.handle, "ace");

      assert.ok(readPayloads.length >= 4);
      assert.ok(
        readPayloads.every(
          (payload) =>
            payload.account?.address === "0x0000000000000000000000000000000000000000" &&
            !("from" in payload)
        )
      );
    } finally {
      delete globalThis.window;
    }
  });
});

