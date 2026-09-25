export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function handler(fn) {
  return async (req, res) => {
    if (cors(req, res)) return;
    try {
      await fn(req, res);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      const message = e instanceof ApiError ? e.message : 'Something went wrong';
      if (!(e instanceof ApiError)) console.error('[api] unhandled:', e);
      if (!res.headersSent) res.status(status).json({ error: message });
      else if (!res.writableEnded) res.end();
    }
  };
}

export function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}
