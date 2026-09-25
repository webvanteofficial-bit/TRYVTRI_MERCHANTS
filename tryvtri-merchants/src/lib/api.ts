export interface Product {
  id: number;
  merchant_id: number;
  name: string;
  url: string;
  sku: string;
  image: string;
  qr_generated: boolean;
  qr_count: number;
  created_at: string;
}

export interface QrRecord {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string;
  url: string;
  created_at: string;
  product_exists?: boolean;
  qr_generated?: boolean;
}

export interface PerProduct {
  id: number;
  name: string;
  sku: string;
  qr_count: number;
}

export interface Stats {
  products: number;
  qr_generated: number;
  qr_records: number;
  recent_records: QrRecord[];
  recent_products: Product[];
  per_product: PerProduct[];
  merchant: { id: number; name: string; email: string };
}

export interface LookupResult {
  url: string;
  store: string;
  name: string;
  sku: string;
  sku_found: boolean;
  image: string;
  description: string;
  price: string;
  currency: string;
  platform: string;
}

export interface QrResponse {
  png: string;
  mime: string;
  width: number;
  height: number;
  filename: string;
  record_id: number;
  created_at: string;
  qr_count: number;
  product: Product;
}

const KEY = 'tryvtri_token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = 'Bearer ' + t;

  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — could not reach the server', 0);
  }

  if (res.status === 401 && !window.location.pathname.startsWith('/auth')) {
    setToken(null);
    window.location.href = '/auth';
    throw new ApiError('Session expired. Please login again.', 401);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data && data.error) || 'Something went wrong', res.status);
  }
  return data as T;
}

export const lookupProduct = (url: string) =>
  api<LookupResult>('/lookup', { method: 'POST', body: { url } });

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBase64(b64: string, filename: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function qrDataUrl(b64: string) {
  return 'data:image/png;base64,' + b64;
}
