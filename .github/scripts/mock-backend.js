#!/usr/bin/env node
/**
 * Mock backend for 42-evaluator integration tests.
 *
 * Implements all API endpoints required by the 7 backend trials:
 *   Trial I   — GET /api/health
 *   Trial II  — GET /api/games  (filtering, sorting, pagination)
 *   Trial III — GET /api/games/:id
 *   Trial IV  — POST /api/launch  (mode validation, disabled-game guard)
 *   Trial V   — Normalised games from 3 provider schemas (alpha/beta/gamma)
 *   Trial VI  — GET /api/wallet/balance, POST /api/bet, /settle, /rollback
 *               (idempotency, concurrency-safe via Node's single-threaded event loop)
 *   Trial VII — POST /api/verify-launch  (HMAC-SHA256)
 *
 * Usage:
 *   LAUNCH_SECRET=my-secret PORT=3000 node mock-backend.js
 */

const http = require('http');
const crypto = require('crypto');
const url = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const LAUNCH_SECRET = process.env.LAUNCH_SECRET || 'default-secret-change-me';

// ── Game seed ────────────────────────────────────────────────────────────────
// 60 games spanning 3 providers, 5 categories — enough for pagination + filter tests.

const PROVIDERS = ['alpha-provider', 'beta-provider', 'gamma-provider'];
const CATEGORIES = ['slots', 'table', 'live', 'crash', 'sport'];
const VOLATILITIES = ['low', 'medium', 'high'];

/** @type {Array<{id:string,name:string,provider:string,category:string,rtp:number,volatility:string,enabled:boolean,thumbnail:string}>} */
const GAMES = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  return {
    id: `game-${String(n).padStart(3, '0')}`,
    name: `Game ${n}`,
    provider: PROVIDERS[i % PROVIDERS.length],
    category: CATEGORIES[i % CATEGORIES.length],
    rtp: parseFloat((85 + (n % 15)).toFixed(1)),
    volatility: VOLATILITIES[i % VOLATILITIES.length],
    enabled: n % 10 !== 0,   // game-010, game-020 … are disabled
    thumbnail: `https://cdn.example.com/games/game-${n}.jpg`,
  };
});

// ── Wallet state ─────────────────────────────────────────────────────────────

let walletBalance = 10000.00;

/**
 * @type {Map<string, {state: 'bet'|'settled'|'rolled_back', betAmount: number, winAmount?: number}>}
 */
const transactions = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** HMAC-SHA256 over "gameId|sessionId|expiresAt". */
function computeSignature(gameId, sessionId, expiresAt) {
  return crypto
    .createHmac('sha256', LAUNCH_SECRET)
    .update(`${gameId}|${sessionId}|${expiresAt}`)
    .digest('hex');
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** @param {import('http').IncomingMessage} req */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
  });
}

function apiError(code, message) {
  return { code, message, details: [] };
}

// ── Router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const path = parsed.pathname || '/';
  const query = parsed.query;
  const method = req.method || 'GET';

  // CORS — needed when a frontend on a different port calls us
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Trial I — Health ──────────────────────────────────────────────────────
  if (path === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, { status: 'ok' });
  }

  // ── Trial II — Games list ─────────────────────────────────────────────────
  if (path === '/api/games' && method === 'GET') {
    let games = [...GAMES];

    // Filter
    if (query.search) {
      const q = String(query.search).toLowerCase();
      games = games.filter(
        (g) => g.name.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q),
      );
    }
    if (query.category) games = games.filter((g) => g.category === query.category);
    if (query.provider) games = games.filter((g) => g.provider === query.provider);
    if (query.enabled !== undefined) {
      const enabled = query.enabled === 'true';
      games = games.filter((g) => g.enabled === enabled);
    }

    // Sort
    const sortField = String(query.sort || 'name');
    const sortDir = query.order === 'desc' ? -1 : 1;
    games.sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    // Pagination
    const page = Math.max(1, parseInt(String(query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10)));
    const total = games.length;
    const start = (page - 1) * limit;
    const items = games.slice(start, start + limit);

    return sendJSON(res, 200, {
      games: items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  }

  // ── Trial III — Game detail ───────────────────────────────────────────────
  const gameDetailMatch = /^\/api\/games\/([^/?#]+)$/.exec(path);
  if (gameDetailMatch && method === 'GET') {
    const game = GAMES.find((g) => g.id === gameDetailMatch[1]);
    if (!game) return sendJSON(res, 404, apiError('GAME_NOT_FOUND', 'Game not found'));
    return sendJSON(res, 200, game);
  }

  // ── Trial IV + VII — Launch ───────────────────────────────────────────────
  if (path === '/api/launch' && method === 'POST') {
    const body = await readBody(req);
    const { gameId, mode = 'demo', playerId = 'player-1' } = body;

    if (!gameId) return sendJSON(res, 400, apiError('MISSING_GAME_ID', 'gameId is required'));

    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return sendJSON(res, 404, apiError('GAME_NOT_FOUND', 'Game not found'));

    if (!game.enabled && mode === 'real') {
      return sendJSON(res, 403, apiError('GAME_DISABLED', 'This game is disabled'));
    }
    if (mode !== 'demo' && mode !== 'real') {
      return sendJSON(res, 400, apiError('INVALID_MODE', "mode must be 'demo' or 'real'"));
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const signature = computeSignature(gameId, sessionId, expiresAt);
    const launchUrl = `https://games.example.com/play?game=${gameId}&session=${sessionId}&expires=${expiresAt}&sig=${signature}`;

    return sendJSON(res, 200, {
      launchUrl,
      sessionId,
      gameId,
      mode,
      playerId,
      expiresAt,
    });
  }

  // ── Trial VII — Verify launch ─────────────────────────────────────────────
  if (path === '/api/verify-launch' && method === 'POST') {
    const body = await readBody(req);
    const { gameId, sessionId, expiresAt, signature } = body;

    if (!gameId || !sessionId || !expiresAt || !signature) {
      return sendJSON(res, 400, apiError('MISSING_FIELDS', 'gameId, sessionId, expiresAt, signature required'));
    }

    const expected = computeSignature(gameId, sessionId, expiresAt);
    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(String(signature), 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // buffer length mismatch → invalid
    }

    if (!valid) return sendJSON(res, 401, apiError('INVALID_SIGNATURE', 'Signature verification failed'));

    const now = Math.floor(Date.now() / 1000);
    if (Number(expiresAt) < now) {
      return sendJSON(res, 401, apiError('SESSION_EXPIRED', 'Session has expired'));
    }

    return sendJSON(res, 200, { valid: true, gameId, sessionId });
  }

  // ── Trial VI — Wallet balance ─────────────────────────────────────────────
  if (path === '/api/wallet/balance' && method === 'GET') {
    return sendJSON(res, 200, { balance: walletBalance, currency: 'USD' });
  }

  // ── Trial VI — Bet ────────────────────────────────────────────────────────
  if (path === '/api/bet' && method === 'POST') {
    const body = await readBody(req);
    const { transactionId, amount, gameId } = body;

    if (!transactionId) return sendJSON(res, 400, apiError('MISSING_TRANSACTION_ID', 'transactionId is required'));
    if (typeof amount !== 'number' || amount <= 0) return sendJSON(res, 400, apiError('INVALID_AMOUNT', 'amount must be a positive number'));

    // Idempotency: same transactionId → return same result
    if (transactions.has(transactionId)) {
      const tx = transactions.get(transactionId);
      return sendJSON(res, 200, { transactionId, balance: walletBalance, amount: tx.betAmount });
    }

    if (amount > walletBalance) {
      return sendJSON(res, 402, apiError('INSUFFICIENT_FUNDS', 'Insufficient wallet balance'));
    }

    walletBalance = parseFloat((walletBalance - amount).toFixed(2));
    transactions.set(transactionId, { state: 'bet', betAmount: amount });

    return sendJSON(res, 200, { transactionId, balance: walletBalance, amount, gameId });
  }

  // ── Trial VI — Settle ─────────────────────────────────────────────────────
  if (path === '/api/settle' && method === 'POST') {
    const body = await readBody(req);
    const { transactionId, amount: winAmount = 0 } = body;

    if (!transactionId) return sendJSON(res, 400, apiError('MISSING_TRANSACTION_ID', 'transactionId is required'));

    const tx = transactions.get(transactionId);
    if (!tx) return sendJSON(res, 404, apiError('TRANSACTION_NOT_FOUND', 'Transaction not found'));

    // Idempotency
    if (tx.state === 'settled') {
      return sendJSON(res, 200, { transactionId, balance: walletBalance, amount: tx.winAmount ?? 0 });
    }
    if (tx.state !== 'bet') {
      return sendJSON(res, 409, apiError('INVALID_STATE', `Cannot settle transaction in state '${tx.state}'`));
    }

    const win = typeof winAmount === 'number' ? winAmount : 0;
    walletBalance = parseFloat((walletBalance + win).toFixed(2));
    transactions.set(transactionId, { ...tx, state: 'settled', winAmount: win });

    return sendJSON(res, 200, { transactionId, balance: walletBalance, amount: win });
  }

  // ── Trial VI — Rollback ───────────────────────────────────────────────────
  if (path === '/api/rollback' && method === 'POST') {
    const body = await readBody(req);
    const { transactionId } = body;

    if (!transactionId) return sendJSON(res, 400, apiError('MISSING_TRANSACTION_ID', 'transactionId is required'));

    const tx = transactions.get(transactionId);
    if (!tx) return sendJSON(res, 404, apiError('TRANSACTION_NOT_FOUND', 'Transaction not found'));

    // Idempotency
    if (tx.state === 'rolled_back') {
      return sendJSON(res, 200, { transactionId, balance: walletBalance });
    }
    if (tx.state !== 'bet') {
      return sendJSON(res, 409, apiError('INVALID_STATE', `Cannot rollback transaction in state '${tx.state}'`));
    }

    walletBalance = parseFloat((walletBalance + tx.betAmount).toFixed(2));
    transactions.set(transactionId, { ...tx, state: 'rolled_back' });

    return sendJSON(res, 200, { transactionId, balance: walletBalance });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  return sendJSON(res, 404, apiError('NOT_FOUND', `Route not found: ${method} ${path}`));
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Mock backend listening on http://localhost:${PORT}\n`);
});

server.on('error', (err) => {
  process.stderr.write(`Server error: ${err.message}\n`);
  process.exit(1);
});
