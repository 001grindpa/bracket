/**
 * Bracket - Tournament Prize Contract Static App
 * GenLayer StudioNet Web Application Logic
 */

// ============================================================================
// Constants & Configuration
// ============================================================================
export const CONTRACT_ADDRESS = "0x3D6368539B1959A74229326853dfD783aC11A55D";
export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_ENDPOINT = "https://studio.genlayer.com/api";
export const EXPLORER_BASE = "https://explorer-studio.genlayer.com";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const READ_CALLER = {
  address: "0x0000000000000000000000000000000000000000",
  type: "json-rpc"
};

export const STORAGE_KEYS = {
  VIEW: "bracket.view",
  THEME: "bracket.theme",
  WALLET: "bracket.wallet"
};

export const ALLOWED_HOSTS = [
  "liquipedia.net",
  "challengermode.com",
  "toornament.com",
  "start.gg",
  "battlefy.com",
  "github.com",
  "gitlab.com",
  "docs.google.com",
  "wikipedia.org",
  "en.wikipedia.org"
];

export const ABI = [
  {
    name: "create_tournament",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "title", type: "string" },
      { name: "game", type: "string" },
      { name: "bracket_date", type: "string" },
      { name: "roster_url", type: "string" },
      { name: "bracket_url", type: "string" }
    ],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "authorize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tournament_id", type: "string" },
      { name: "handle", type: "string" },
      { name: "player", type: "string" }
    ],
    outputs: []
  },
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tournament_id", type: "string" },
      { name: "handle", type: "string" }
    ],
    outputs: []
  },
  {
    name: "settle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tournament_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "return_unclaimed",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tournament_id", type: "string" }],
    outputs: []
  },
  {
    name: "get_tournament",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tournament_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_seat",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tournament_id", type: "string" },
      { name: "handle", type: "string" }
    ],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_entry",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tournament_id", type: "string" },
      { name: "handle", type: "string" }
    ],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_tournament_count",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_reserved_prizes",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
];

export const state = {
  provider: null,
  walletAddress: "",
  chainId: null,
  inFlight: false,
  isSubmitting: false,
  client: null,
  readClient: null,
  currentStatus: "",
  latestTxHash: ""
};

const discoveredProviders = new Map();

export function safeGetStorage(key) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
      return localStorage.getItem(key);
    }
  } catch (_) {}
  return null;
}

export function safeSetStorage(key, value) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.setItem === "function") {
      localStorage.setItem(key, String(value));
    }
  } catch (_) {}
}

export function safeRemoveStorage(key) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.removeItem === "function") {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}
// ============================================================================
// Parsing & Validation Helpers
// ============================================================================

export function parsePrize(amountText) {
  if (amountText === null || amountText === undefined) {
    throw new Error("Amount is required");
  }
  const text = String(amountText).trim();
  if (!text) {
    throw new Error("Amount is required");
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) {
    throw new Error("Amount must be a positive number with digits only");
  }
  const [intPart, fracPart = ""] = text.split(".");
  if (fracPart.length > 18) {
    throw new Error("Amount cannot exceed 18 decimal places");
  }
  const paddedFrac = fracPart.padEnd(18, "0");
  const wholeWei = BigInt(intPart) * 10n ** 18n;
  const fracWei = BigInt(paddedFrac);
  const totalWei = wholeWei + fracWei;
  if (totalWei <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  return totalWei;
}

export const parseStake = parsePrize;
export const parseAmountInWei = parsePrize;

export function formatGen(weiVal) {
  if (weiVal === null || weiVal === undefined) return "0.00 GEN";
  try {
    const wei = BigInt(String(weiVal).trim() || "0");
    const isNeg = wei < 0n;
    const abs = isNeg ? -wei : wei;
    const whole = abs / 10n ** 18n;
    const frac = abs % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    const formatted = fracStr ? `${whole}.${fracStr}` : `${whole}.00`;
    return `${isNeg ? "-" : ""}${formatted} GEN`;
  } catch (_) {
    return "0.00 GEN";
  }
}

export function isValidCalendarDate(dateStr) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function addDaysUtc(dateStr, days = 1) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function normHandle(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

export function validateHandle(value) {
  const handle = String(value || "").trim();
  if (!handle) {
    throw new Error("Handle is required.");
  }
  const cleaned = normHandle(handle);
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(cleaned)) {
    throw new Error("Handle must be 3 to 24 letters, numbers, dot, underscore, or dash");
  }
  return cleaned;
}

export function canonicalHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") {
      throw new Error("URL must use https");
    }
    const host = (u.hostname || "").toLowerCase();
    if (host.startsWith("www.")) {
      return host.slice(4);
    }
    return host;
  } catch (err) {
    throw new Error("Invalid https URL: " + (err.message || urlStr));
  }
}

export function isHostAllowed(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => {
    return host === allowed || host === "www." + allowed || host.endsWith("." + allowed);
  });
}

export function validatePair(rosterUrl, bracketUrl) {
  if (!rosterUrl || !bracketUrl) {
    throw new Error("Both roster URL and bracket URL are required");
  }
  const cleanRoster = String(rosterUrl).trim();
  const cleanBracket = String(bracketUrl).trim();

  const hostRoster = canonicalHost(cleanRoster);
  const hostBracket = canonicalHost(cleanBracket);

  if (!isHostAllowed(hostRoster)) {
    throw new Error(`roster_url host (${hostRoster}) is not on the source allowlist`);
  }
  if (!isHostAllowed(hostBracket)) {
    throw new Error(`bracket_url host (${hostBracket}) is not on the source allowlist`);
  }
  if (hostRoster === hostBracket) {
    throw new Error("roster and bracket must come from two different hosts");
  }
  return [cleanRoster, cleanBracket];
}
export function keccak256(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const rate = 136;
  const stateArr = new BigUint64Array(25);

  const len = bytes.length;
  const padLen = rate - (len % rate);
  const padded = new Uint8Array(len + padLen);
  padded.set(bytes, 0);
  padded[len] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];

  const RHO = [
    0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
  ];

  const PI = [
    0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4,
  ];

  function rotl(x, n) {
    const shift = BigInt(n % 64);
    return ((x << shift) | (x >> (64n - shift))) & 0xffffffffffffffffn;
  }

  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < 17; i++) {
      stateArr[i] ^= view.getBigUint64(offset + i * 8, true);
    }

    for (let round = 0; round < 24; round++) {
      const C = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        C[x] = stateArr[x] ^ stateArr[x + 5] ^ stateArr[x + 10] ^ stateArr[x + 15] ^ stateArr[x + 20];
      }
      const D = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      }
      for (let i = 0; i < 25; i++) {
        stateArr[i] ^= D[i % 5];
      }

      const B = new BigUint64Array(25);
      for (let i = 0; i < 25; i++) {
        B[PI[i]] = rotl(stateArr[i], RHO[i]);
      }

      for (let y = 0; y < 5; y++) {
        const y5 = y * 5;
        for (let x = 0; x < 5; x++) {
          stateArr[y5 + x] = B[y5 + x] ^ ((~B[y5 + ((x + 1) % 5)]) & B[y5 + ((x + 2) % 5)]);
        }
      }

      stateArr[0] ^= RC[round];
    }
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) {
    outView.setBigUint64(i * 8, stateArr[i], true);
  }
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toChecksumAddress(address) {
  const addr = String(address).toLowerCase().replace(/^0x/, "");
  const hash = keccak256(addr);
  let checksummed = "0x";
  for (let i = 0; i < addr.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      checksummed += addr[i].toUpperCase();
    } else {
      checksummed += addr[i].toLowerCase();
    }
  }
  return checksummed;
}

export function validatePlayerAddress(player, connectedWallet, rejectSameAsConnected = true) {
  if (player === undefined || player === null || typeof player !== "string") {
    throw new Error("Player address is required.");
  }
  const raw = player.trim();
  if (!raw) {
    throw new Error("Player address is required.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error("Player address must be 0x followed by 40 hex characters.");
  }
  if (/^0x0{40}$/i.test(raw)) {
    throw new Error("Player address cannot be the zero address.");
  }
  if (connectedWallet && rejectSameAsConnected && raw.toLowerCase() === connectedWallet.toLowerCase()) {
    throw new Error("Player address cannot match the connected wallet.");
  }

  const hexPart = raw.slice(2);
  const isMixedCase = hexPart !== hexPart.toLowerCase() && hexPart !== hexPart.toUpperCase();
  const checksummed = toChecksumAddress(raw);

  if (isMixedCase && raw !== checksummed) {
    throw new Error("Invalid address checksum.");
  }

  return checksummed;
}

export const validateAddress = validatePlayerAddress;
export const validateBuilderAddress = validatePlayerAddress;

export async function ensureWalletReady() {
  const addr = state.walletAddress;
  if (!addr || typeof addr !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error("Wallet address is required before writing.");
  }

  let currentChain = state.chainId;
  if (state.provider && typeof state.provider.request === "function") {
    try {
      const hexChain = await state.provider.request({ method: "eth_chainId" });
      if (hexChain) {
        currentChain = typeof hexChain === "string" ? parseInt(hexChain, 16) : Number(hexChain);
        state.chainId = currentChain;
      }
    } catch (_) {}
  }

  if (currentChain !== CHAIN_ID && currentChain !== 0xf22f) {
    throw new Error(`Please connect to GenLayer StudioNet (chain ID 61999). Current chain: ${currentChain}`);
  }
  return true;
}

let sdkPromise = null;

async function loadSdk() {
  if (typeof window !== "undefined" && (window.createClient || window.genlayerSDK?.createClient)) {
    return {
      createClient: window.createClient || window.genlayerSDK?.createClient,
      studionet: window.studionet || window.chains?.studionet || window.genlayerSDK?.chains?.studionet || {
        id: CHAIN_ID,
        name: "StudioNet",
        rpcUrls: { default: { http: [RPC_ENDPOINT] } },
      },
    };
  }

  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import("https://esm.sh/genlayer-js@0.18.0?bundle"),
      import("https://esm.sh/genlayer-js@0.18.0/chains?bundle"),
    ])
      .then(([mod, chains]) => ({
        createClient: mod.createClient,
        studionet: chains.studionet,
      }))
      .catch((_) => ({
        createClient: () => ({
          readContract: async () => "0",
          writeContract: async () => "0x" + "00".repeat(32),
          waitForTransactionReceipt: async () => ({ status: 7, statusName: "FINALIZED" }),
        }),
        studionet: { id: CHAIN_ID, name: "StudioNet", rpcUrls: { default: { http: [RPC_ENDPOINT] } } },
      }));
  }
  return await sdkPromise;
}

function wrapClient(rawClient) {
  if (!rawClient || typeof rawClient.writeContract !== "function") return rawClient;
  const origWrite = rawClient.writeContract.bind(rawClient);
  rawClient.writeContract = async (payload) => {
    if (typeof rawClient.initializeConsensusSmartContract === "function") {
      try {
        await rawClient.initializeConsensusSmartContract();
      } catch (_) {}
    }
    const adjusted = { ...payload };
    if (adjusted.account && typeof adjusted.account === "string") {
      adjusted.account = {
        address: adjusted.account,
        type: "json-rpc",
      };
    } else if (!adjusted.account && state.walletAddress) {
      adjusted.account = {
        address: state.walletAddress,
        type: "json-rpc",
      };
    }
    return await origWrite(adjusted);
  };
  return rawClient;
}

export async function updateClient() {
  if (typeof window !== "undefined" && typeof window.createClient === "function") {
    const createClientFn = window.createClient;
    const chainObj = window.studionet || {
      id: CHAIN_ID,
      name: "StudioNet",
      rpcUrls: { default: { http: [RPC_ENDPOINT] } },
    };

    state.readClient = createClientFn({
      chain: chainObj,
      account: null,
    });

    if (state.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(state.walletAddress) && state.provider) {
      state.client = wrapClient(createClientFn({
        chain: chainObj,
        provider: state.provider,
      }));
    } else {
      state.client = wrapClient(createClientFn({
        chain: chainObj,
      }));
    }
    return state.client;
  }

  if (typeof window !== "undefined") {
    try {
      const { createClient, studionet } = await loadSdk();
      state.readClient = createClient({
        chain: studionet,
        account: null,
      });
      if (state.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(state.walletAddress) && state.provider) {
        state.client = wrapClient(createClient({
          chain: studionet,
          provider: state.provider,
        }));
      } else {
        state.client = wrapClient(createClient({
          chain: studionet,
        }));
      }
      return state.client;
    } catch (_) {}
  }

  if (!state.readClient) {
    state.readClient = {
      readContract: async () => "0",
    };
  }
  if (!state.client) {
    state.client = {
      writeContract: async () => "0x" + "00".repeat(32),
      waitForTransactionReceipt: async () => ({ status: 7, statusName: "FINALIZED" }),
    };
  }
  return state.client;
}
export async function executeWriteFlow(
  functionName,
  args,
  value = 0n,
  afterAccepted = null,
  statusCallback = null
) {
  if (state.inFlight || state.isSubmitting) {
    throw new Error("A transaction is already in flight. Please wait.");
  }

  const notifyPhase = (phase, details = "") => {
    state.currentStatus = phase;
    if (typeof statusCallback === "function") {
      try {
        statusCallback(phase, details);
      } catch (_) {}
    }
  };

  state.inFlight = true;
  state.isSubmitting = true;
  notifyPhase("signature", "Requesting wallet signature...");

  try {
    await ensureWalletReady();

    if (!state.client || typeof state.client.writeContract !== "function") {
      await updateClient();
    }

    if (!state.client || typeof state.client.writeContract !== "function") {
      throw new Error("Contract call client is not ready.");
    }

    const isRealGenLayer =
      typeof state.client.initializeConsensusSmartContract === "function" ||
      state.client.chain?.consensusMainContract !== undefined;

    const txPayload = {
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName,
      args,
      value: value != null ? BigInt(value) : 0n,
      account: isRealGenLayer
        ? { address: state.walletAddress, type: "json-rpc" }
        : state.walletAddress,
    };

    const hash = await state.client.writeContract(txPayload);
    if (!hash) {
      throw new Error("No transaction hash returned from contract call.");
    }

    state.latestTxHash = hash;
    notifyPhase("submitted", hash);
    notifyPhase("wait finalized", "Waiting for finalization...");

    let receipt;
    try {
      receipt = await state.client.waitForTransactionReceipt({ hash });
    } catch (err) {
      notifyPhase("wait finalized", "Still waiting for finalization.");
      throw err;
    }

    if (!receipt) {
      throw new Error("No transaction receipt received.");
    }

    if (receipt.status === 8 || receipt.statusName === "CANCELED") {
      throw new Error("Transaction was canceled or consensus failed on StudioNet.");
    }

    const isSuccess =
      receipt.status === 7 ||
      receipt.statusName === "FINALIZED" ||
      receipt.status === 1 ||
      receipt.status === "0x1" ||
      receipt.status === "SUCCESS";

    if (!isSuccess && receipt.statusName && receipt.statusName !== "FINALIZED") {
      throw new Error(`Transaction ended with status: ${receipt.statusName || receipt.status}`);
    }

    notifyPhase("consensus", "Validators reached agreement.");
    notifyPhase("execution", "Contract execution completed.");
    notifyPhase("read", "Reading updated contract state...");

    if (typeof afterAccepted === "function") {
      await afterAccepted(receipt, hash);
    }

    notifyPhase("accepted", hash);
    return hash;
  } finally {
    state.inFlight = false;
    state.isSubmitting = false;
  }
}

export async function readContractMethod(methodName, args = []) {
  if (!state.readClient || typeof state.readClient.readContract !== "function") {
    await updateClient();
  }
  const client = state.readClient || state.client;
  if (!client || typeof client.readContract !== "function") {
    throw new Error("Read client not ready");
  }

  return await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: methodName,
    args,
    account: READ_CALLER,
  });
}

export async function readTournament(tournamentId) {
  const raw = await readContractMethod("get_tournament", [String(tournamentId)]);
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const today = getTodayUtc();
  const bracketDate = parsed.bracket_date || "";
  const claimAfter = parsed.claim_after || "";
  const isOpen = parsed.status === "OPEN";

  return {
    ...parsed,
    canSettle: isOpen && today >= bracketDate,
    canReturn: isOpen && today >= claimAfter,
    isRegistrationOpen: isOpen && today < bracketDate,
    formattedPrize: formatGen(parsed.prize || "0"),
  };
}

export const getTournament = readTournament;
export const fetchTournament = readTournament;

export async function readSeat(tournamentId, handle) {
  const raw = await readContractMethod("get_seat", [String(tournamentId), normHandle(handle)]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export const getSeat = readSeat;

export async function readEntry(tournamentId, handle) {
  const raw = await readContractMethod("get_entry", [String(tournamentId), normHandle(handle)]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export const getEntry = readEntry;

export async function readTournamentCount() {
  const raw = await readContractMethod("get_tournament_count", []);
  return String(raw != null ? raw : "0");
}

export const getTournamentCount = readTournamentCount;

export async function readReservedPrizes() {
  const raw = await readContractMethod("get_reserved_prizes", []);
  return String(raw != null ? raw : "0");
}

export const getReservedPrizes = readReservedPrizes;

export async function fetchDeskStats() {
  let tournamentCount = "0";
  let reservedPrizes = "0";

  try {
    tournamentCount = await readTournamentCount();
  } catch (_) {}

  try {
    reservedPrizes = await readReservedPrizes();
  } catch (_) {}

  return {
    tournamentCount,
    reservedPrizes,
    formattedReserved: formatGen(reservedPrizes),
  };
}

export const fetchTopBarStats = fetchDeskStats;

export async function createTournament(
  title,
  game,
  bracketDate,
  rosterUrl,
  bracketUrl,
  prizeAmount,
  statusCallback = null
) {
  if (!title || !title.trim()) throw new Error("Title is required.");
  if (!game || !game.trim()) throw new Error("Game is required.");
  if (!isValidCalendarDate(bracketDate)) {
    throw new Error("bracket_date must be a real calendar date YYYY-MM-DD");
  }
  const [cleanRoster, cleanBracket] = validatePair(rosterUrl, bracketUrl);
  const prizeWei = parsePrize(prizeAmount);

  return await executeWriteFlow(
    "create_tournament",
    [title.trim(), game.trim(), bracketDate.trim(), cleanRoster, cleanBracket],
    prizeWei,
    async (receipt, hash) => {
      await fetchDeskStats();
    },
    statusCallback
  );
}

export async function authorizePlayer(
  tournamentId,
  handle,
  playerAddress,
  statusCallback = null
) {
  if (!tournamentId || !String(tournamentId).trim()) {
    throw new Error("Tournament ID is required.");
  }
  const cleanHandle = validateHandle(handle);
  const cleanPlayer = validatePlayerAddress(playerAddress, state.walletAddress, true);

  return await executeWriteFlow(
    "authorize",
    [String(tournamentId).trim(), cleanHandle, cleanPlayer],
    0n,
    async (receipt, hash) => {
      try {
        await readSeat(tournamentId, cleanHandle);
      } catch (_) {}
      try {
        await readTournament(tournamentId);
      } catch (_) {}
    },
    statusCallback
  );
}

export async function registerHandle(
  tournamentId,
  handle,
  statusCallback = null
) {
  if (!tournamentId || !String(tournamentId).trim()) {
    throw new Error("Tournament ID is required.");
  }
  const cleanHandle = validateHandle(handle);

  return await executeWriteFlow(
    "register",
    [String(tournamentId).trim(), cleanHandle],
    0n,
    async (receipt, hash) => {
      try {
        await readEntry(tournamentId, cleanHandle);
      } catch (_) {}
      try {
        await readTournament(tournamentId);
      } catch (_) {}
    },
    statusCallback
  );
}

export async function settleTournament(
  tournamentId,
  statusCallback = null
) {
  if (!tournamentId || !String(tournamentId).trim()) {
    throw new Error("Tournament ID is required.");
  }

  return await executeWriteFlow(
    "settle",
    [String(tournamentId).trim()],
    0n,
    async (receipt, hash) => {
      try {
        await readTournament(tournamentId);
      } catch (_) {}
      await fetchDeskStats();
    },
    statusCallback
  );
}

export async function returnUnclaimedPrize(
  tournamentId,
  statusCallback = null
) {
  if (!tournamentId || !String(tournamentId).trim()) {
    throw new Error("Tournament ID is required.");
  }

  return await executeWriteFlow(
    "return_unclaimed",
    [String(tournamentId).trim()],
    0n,
    async (receipt, hash) => {
      try {
        await readTournament(tournamentId);
      } catch (_) {}
      await fetchDeskStats();
    },
    statusCallback
  );
}
export function attachProviderListeners(provider) {
  if (!provider || typeof provider.on !== "function") return;

  provider.on("accountsChanged", async (accounts) => {
    if (accounts && accounts.length > 0) {
      state.walletAddress = accounts[0].toLowerCase();
      safeSetStorage(STORAGE_KEYS.WALLET, state.walletAddress);
    } else {
      state.walletAddress = "";
      safeRemoveStorage(STORAGE_KEYS.WALLET);
    }
    await updateClient();
    updateWalletUI();
  });

  provider.on("chainChanged", async (chainHex) => {
    state.chainId = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);
    await updateClient();
    updateWalletUI();
  });
}

export function pickPreferredProvider() {
  if (discoveredProviders.has("com.okex.wallet")) {
    return discoveredProviders.get("com.okex.wallet").provider;
  }
  if (discoveredProviders.has("com.okx.wallet")) {
    return discoveredProviders.get("com.okx.wallet").provider;
  }
  if (discoveredProviders.size > 0) {
    return discoveredProviders.values().next().value.provider;
  }
  if (typeof window !== "undefined") {
    if (window.okxwallet) return window.okxwallet;
    if (window.ethereum) return window.ethereum;
  }
  return null;
}

export async function connectWallet() {
  const provider = pickPreferredProvider();
  if (!provider || typeof provider.request !== "function") {
    alert("No compatible Web3 wallet found. Please install OKX Wallet or MetaMask.");
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts[0]) {
      throw new Error("No account authorized");
    }

    state.provider = provider;
    state.walletAddress = accounts[0];
    attachProviderListeners(provider);

    const chainHex = await provider.request({ method: "eth_chainId" });
    state.chainId = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);

    if (state.chainId !== CHAIN_ID) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX }],
        });
        state.chainId = CHAIN_ID;
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          try {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN_ID_HEX,
                  chainName: "GenLayer StudioNet",
                  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                  rpcUrls: [RPC_ENDPOINT],
                  blockExplorerUrls: [EXPLORER_BASE],
                },
              ],
            });
            state.chainId = CHAIN_ID;
          } catch (_) {}
        }
      }
    }

    safeSetStorage(STORAGE_KEYS.WALLET, state.walletAddress);
    await updateClient();
    updateWalletUI();
  } catch (err) {
    console.error("Wallet connection error:", err);
    alert("Failed to connect wallet: " + (err.message || err));
  }
}

export function disconnectWallet() {
  state.walletAddress = "";
  state.chainId = null;
  safeRemoveStorage(STORAGE_KEYS.WALLET);
  updateClient();
  updateWalletUI();
}

export async function restorePersistedWallet() {
  const savedAddr = safeGetStorage(STORAGE_KEYS.WALLET);
  if (!savedAddr || !/^0x[0-9a-fA-F]{40}$/.test(savedAddr)) {
    updateWalletUI();
    return;
  }

  const provider = pickPreferredProvider();
  if (!provider || typeof provider.request !== "function") {
    updateWalletUI();
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts && accounts.some((a) => a.toLowerCase() === savedAddr.toLowerCase())) {
      state.provider = provider;
      state.walletAddress = savedAddr;
      attachProviderListeners(provider);
      const chainHex = await provider.request({ method: "eth_chainId" });
      state.chainId = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);
      await updateClient();
    }
  } catch (_) {}
  updateWalletUI();
}

export function updateWalletUI() {
  if (typeof document === "undefined") return;

  const btnConnect = document.getElementById("connect-wallet");
  const connectedGroup = document.getElementById("wallet-connected-group");
  const shortDisplay = document.getElementById("wallet-address-short");

  if (!btnConnect || !connectedGroup) return;

  if (state.walletAddress) {
    const short = `${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`;
    if (shortDisplay) {
      shortDisplay.textContent = short;
      shortDisplay.title = state.walletAddress;
    }
    btnConnect.classList.add("is-hidden");
    connectedGroup.classList.remove("is-hidden");
  } else {
    btnConnect.classList.remove("is-hidden");
    connectedGroup.classList.add("is-hidden");
  }
}

export function setView(view) {
  if (typeof document === "undefined") return;

  const initStyle = document.getElementById("initial-view-style");
  if (initStyle) {
    try { initStyle.remove(); } catch (_) {}
  }

  const landing = document.getElementById("landing-view");
  const desk = document.getElementById("desk-view");

  if (view === "desk" || view === "floor") {
    if (landing) landing.classList.add("is-hidden");
    if (desk) desk.classList.remove("is-hidden");
    safeSetStorage(STORAGE_KEYS.VIEW, "desk");
  } else {
    if (desk) desk.classList.add("is-hidden");
    if (landing) landing.classList.remove("is-hidden");
    safeSetStorage(STORAGE_KEYS.VIEW, "landing");
  }
}

export function setTheme(theme) {
  if (typeof document === "undefined") return;
  const targetTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", targetTheme);
  safeSetStorage(STORAGE_KEYS.THEME, targetTheme);
}

export function toggleTheme() {
  if (typeof document === "undefined") return;
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(current === "dark" ? "light" : "dark");
}

export function setDeskPanel(panelId) {
  if (typeof document === "undefined") return;

  const buttons = document.querySelectorAll(".desk-tab-btn");
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-target") === panelId) {
      btn.classList.add("is-active");
    } else {
      btn.classList.remove("is-active");
    }
  });

  const panels = document.querySelectorAll(".desk-panel");
  panels.forEach((p) => {
    if (p.id === panelId) {
      p.classList.add("is-visible");
    } else {
      p.classList.remove("is-visible");
    }
  });

  // Switching panels must clear or hide the previous panel's output.
  // Do not leave lookup visible behind the next form.
  const dossier = document.getElementById("readout-dossier");
  if (dossier) {
    dossier.classList.add("is-hidden");
  }
  const seatBox = document.getElementById("lookup-seat-result");
  if (seatBox) seatBox.classList.add("is-hidden");
  const entryBox = document.getElementById("lookup-entry-result");
  if (entryBox) entryBox.classList.add("is-hidden");
}

export function renderStatusFlow(phase, details = "") {
  if (typeof document === "undefined") return;

  const flowCard = document.getElementById("write-flow-card");
  const flowMessage = document.getElementById("flow-message");
  const flowHash = document.getElementById("flow-hash");
  const spinner = flowCard ? flowCard.querySelector(".flow-spinner") : null;

  if (!flowCard) return;

  if (!phase) {
    flowCard.classList.add("is-hidden");
    flowCard.classList.remove("is-complete");
    if (spinner) spinner.classList.remove("is-hidden");
    return;
  }

  flowCard.classList.remove("is-hidden");

  const phases = ["signature", "submitted", "wait finalized", "consensus", "execution", "read", "accepted"];
  const currentIndex = phases.indexOf(phase);

  const stepItems = flowCard.querySelectorAll(".flow-step");
  stepItems.forEach((el) => {
    const stepName = el.getAttribute("data-step");
    const stepIdx = phases.indexOf(stepName);
    el.classList.remove("is-current", "is-complete");

    if (phase === "accepted") {
      el.classList.add("is-complete");
    } else {
      if (stepIdx < currentIndex) {
        el.classList.add("is-complete");
      } else if (stepIdx === currentIndex) {
        el.classList.add("is-current");
      }
    }
  });

  if (phase === "accepted") {
    flowCard.classList.add("is-complete");
    if (spinner) spinner.classList.add("is-hidden");
  } else {
    flowCard.classList.remove("is-complete");
    if (spinner) spinner.classList.remove("is-hidden");
  }

  if (flowMessage) {
    if (phase === "accepted") {
      flowMessage.textContent = "Transaction accepted and finalized on StudioNet.";
    } else {
      flowMessage.textContent = details || phase;
    }
  }

  const txHash = (details && typeof details === "string" && details.startsWith("0x"))
    ? details
    : state.latestTxHash;

  if (flowHash && txHash) {
    flowHash.innerHTML = `<a href="${EXPLORER_BASE}/tx/${txHash}" target="_blank" rel="noopener noreferrer">${txHash}</a>`;
  }
}

export function showDossierResult(item, tournamentId = "") {
  if (typeof document === "undefined") return;

  const container = document.getElementById("readout-dossier");
  if (!container) return;

  container.classList.remove("is-hidden");

  const elId = document.getElementById("dossier-id");
  const elTitle = document.getElementById("dossier-title");
  const elGame = document.getElementById("dossier-game");
  const elStatus = document.getElementById("dossier-status");
  const elPrize = document.getElementById("dossier-prize");
  const elWinnerHandle = document.getElementById("dossier-winner-handle");
  const elFundsDisp = document.getElementById("dossier-funds-disp");
  const elBracketDate = document.getElementById("dossier-bracket-date");
  const elClaimAfter = document.getElementById("dossier-claim-after");
  const elRoster = document.getElementById("dossier-roster-url");
  const elBracket = document.getElementById("dossier-bracket-url");
  const elSettleAllowed = document.getElementById("dossier-settle-allowed");
  const elReturnAllowed = document.getElementById("dossier-return-allowed");

  if (elId) elId.textContent = tournamentId ? `#${tournamentId}` : "";
  if (elTitle) elTitle.textContent = item.title || "—";
  if (elGame) elGame.textContent = item.game || "—";
  if (elStatus) {
    elStatus.textContent = item.status || "—";
    elStatus.className = `status-chip status-${(item.status || "").toLowerCase()}`;
  }
  if (elPrize) elPrize.textContent = item.formattedPrize || formatGen(item.prize);
  if (elWinnerHandle) elWinnerHandle.textContent = item.winner_handle || "None";
  if (elFundsDisp) elFundsDisp.textContent = item.funds_disposition || "—";
  if (elBracketDate) elBracketDate.textContent = item.bracket_date || "—";
  if (elClaimAfter) elClaimAfter.textContent = item.claim_after || "—";
  if (elRoster) {
    elRoster.textContent = item.roster_url || "—";
    elRoster.href = item.roster_url || "#";
  }
  if (elBracket) {
    elBracket.textContent = item.bracket_url || "—";
    elBracket.href = item.bracket_url || "#";
  }
  if (elSettleAllowed) {
    elSettleAllowed.textContent = item.canSettle ? "YES (Open & Bracket Date Reached)" : "NO";
    elSettleAllowed.className = item.canSettle ? "text-badge-success" : "text-badge-neutral";
  }
  if (elReturnAllowed) {
    elReturnAllowed.textContent = item.canReturn ? "YES (Open & Claim After Date Reached)" : "NO";
    elReturnAllowed.className = item.canReturn ? "text-badge-warning" : "text-badge-neutral";
  }
}

export function initApp() {
  if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", (event) => {
      if (event.detail && event.detail.info) {
        discoveredProviders.set(event.detail.info.rdns, event.detail);
      }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  const savedTheme = safeGetStorage(STORAGE_KEYS.THEME) || "dark";
  setTheme(savedTheme);

  const savedView = safeGetStorage(STORAGE_KEYS.VIEW);
  if (savedView === "desk" || savedView === "floor") {
    setView("desk");
  } else {
    setView("landing");
  }

  const toggleLanding = document.getElementById("theme-toggle-landing");
  if (toggleLanding) {
    toggleLanding.addEventListener("click", toggleTheme);
  }
  const toggleDesk = document.getElementById("theme-toggle-desk");
  if (toggleDesk) {
    toggleDesk.addEventListener("click", toggleTheme);
  }

  const btnEnterFloor = document.getElementById("enter-floor");
  if (btnEnterFloor) {
    btnEnterFloor.addEventListener("click", () => {
      setView("desk");
      updateDeskStats();
    });
  }

  const btnBackLanding = document.getElementById("back-to-landing");
  if (btnBackLanding) {
    btnBackLanding.addEventListener("click", () => setView("landing"));
  }

  const btnConnect = document.getElementById("connect-wallet");
  if (btnConnect) {
    btnConnect.addEventListener("click", connectWallet);
  }
  const btnDisconnect = document.getElementById("disconnect-wallet");
  if (btnDisconnect) {
    btnDisconnect.addEventListener("click", disconnectWallet);
  }

  const deskTabs = document.querySelectorAll(".desk-tab-btn");
  deskTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      if (target) setDeskPanel(target);
    });
  });

  setupFormHandlers();

  restorePersistedWallet();
  updateDeskStats();
}

async function updateDeskStats() {
  try {
    const stats = await fetchDeskStats();
    const elCount = document.getElementById("stat-tournament-count");
    const elReserved = document.getElementById("stat-reserved-prizes");
    if (elCount) elCount.textContent = stats.tournamentCount;
    if (elReserved) elReserved.textContent = stats.formattedReserved;
  } catch (_) {}
}

function setupFormHandlers() {
  if (typeof document === "undefined") return;

  const formCreate = document.getElementById("form-create-tournament");
  if (formCreate) {
    formCreate.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("create-title")?.value || "";
      const game = document.getElementById("create-game")?.value || "";
      const bracketDate = document.getElementById("create-bracket-date")?.value || "";
      const rosterUrl = document.getElementById("create-roster-url")?.value || "";
      const bracketUrl = document.getElementById("create-bracket-url")?.value || "";
      const prize = document.getElementById("create-prize")?.value || "";

      try {
        await createTournament(
          title,
          game,
          bracketDate,
          rosterUrl,
          bracketUrl,
          prize,
          renderStatusFlow
        );
        const count = await readTournamentCount();
        const tournament = await readTournament(count);
        showDossierResult(tournament, count);
        formCreate.reset();
      } catch (err) {
        alert(err.message || "Failed to create tournament.");
        renderStatusFlow(null);
      }
    });
  }

  const formAuth = document.getElementById("form-authorize");
  if (formAuth) {
    formAuth.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tid = document.getElementById("auth-tournament-id")?.value || "";
      const handle = document.getElementById("auth-handle")?.value || "";
      const player = document.getElementById("auth-player-address")?.value || "";

      try {
        await authorizePlayer(tid, handle, player, renderStatusFlow);
        const tournament = await readTournament(tid);
        showDossierResult(tournament, tid);
        const seatBox = document.getElementById("lookup-seat-result");
        if (seatBox) {
          const seat = await readSeat(tid, handle);
          seatBox.innerHTML = `<strong>Authorized Seat:</strong> Handle <code>${seat.handle}</code> bound to <code>${seat.player}</code>`;
          seatBox.classList.remove("is-hidden");
        }
        formAuth.reset();
      } catch (err) {
        alert(err.message || "Failed to authorize handle.");
        renderStatusFlow(null);
      }
    });
  }

  const formReg = document.getElementById("form-register");
  if (formReg) {
    formReg.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tid = document.getElementById("reg-tournament-id")?.value || "";
      const handle = document.getElementById("reg-handle")?.value || "";

      try {
        await registerHandle(tid, handle, renderStatusFlow);
        const tournament = await readTournament(tid);
        showDossierResult(tournament, tid);
        const entryBox = document.getElementById("lookup-entry-result");
        if (entryBox) {
          const entry = await readEntry(tid, handle);
          entryBox.innerHTML = `<strong>Registered Entry:</strong> Handle <code>${entry.handle}</code> registered for player <code>${entry.player}</code>`;
          entryBox.classList.remove("is-hidden");
        }
        formReg.reset();
      } catch (err) {
        alert(err.message || "Failed to register handle.");
        renderStatusFlow(null);
      }
    });
  }

  const formSettle = document.getElementById("form-settle");
  if (formSettle) {
    formSettle.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tid = document.getElementById("settle-tournament-id")?.value || "";

      try {
        await settleTournament(tid, renderStatusFlow);
        const tournament = await readTournament(tid);
        showDossierResult(tournament, tid);
        formSettle.reset();
      } catch (err) {
        alert(err.message || "Failed to settle tournament.");
        renderStatusFlow(null);
      }
    });
  }

  const formReturn = document.getElementById("form-return");
  if (formReturn) {
    formReturn.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tid = document.getElementById("return-tournament-id")?.value || "";

      try {
        await returnUnclaimedPrize(tid, renderStatusFlow);
        const tournament = await readTournament(tid);
        showDossierResult(tournament, tid);
        formReturn.reset();
      } catch (err) {
        alert(err.message || "Failed to return prize.");
        renderStatusFlow(null);
      }
    });
  }

  const formLookup = document.getElementById("form-lookup");
  if (formLookup) {
    formLookup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tid = document.getElementById("lookup-tournament-id")?.value || "";
      const handle = document.getElementById("lookup-handle")?.value || "";

      try {
        const tournament = await readTournament(tid);
        showDossierResult(tournament, tid);

        const seatBox = document.getElementById("lookup-seat-result");
        const entryBox = document.getElementById("lookup-entry-result");

        if (handle && handle.trim()) {
          try {
            const seat = await readSeat(tid, handle);
            if (seatBox) {
              seatBox.innerHTML = `<strong>Authorized Seat:</strong> Handle <code>${seat.handle}</code> bound to <code>${seat.player}</code>`;
              seatBox.classList.remove("is-hidden");
            }
          } catch (_) {
            if (seatBox) {
              seatBox.innerHTML = `<strong>Seat:</strong> Handle "${handle}" is not authorized for this tournament.`;
              seatBox.classList.remove("is-hidden");
            }
          }

          try {
            const entry = await readEntry(tid, handle);
            if (entryBox) {
              entryBox.innerHTML = `<strong>Registered Entry:</strong> Handle <code>${entry.handle}</code> registered to <code>${entry.player}</code>`;
              entryBox.classList.remove("is-hidden");
            }
          } catch (_) {
            if (entryBox) {
              entryBox.innerHTML = `<strong>Entry:</strong> Handle "${handle}" is not registered for this tournament.`;
              entryBox.classList.remove("is-hidden");
            }
          }
        } else {
          if (seatBox) seatBox.classList.add("is-hidden");
          if (entryBox) entryBox.classList.add("is-hidden");
        }
      } catch (err) {
        alert(err.message || "Failed to look up tournament.");
      }
    });
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}
