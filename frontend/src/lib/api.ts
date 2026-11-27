import type { AuthUser } from '@/types/iems';

let memoryToken: string | null = null;
let memoryUser: AuthUser | null = null;
let welcomePending = false;

export const authStorage = {
  getToken(): string | null {
    return memoryToken;
  },
  getUser(): AuthUser | null {
    return memoryUser;
  },
  setSession(token: string, user: AuthUser, showWelcome = false) {
    memoryToken = token;
    memoryUser = user;
    if (showWelcome) welcomePending = true;
  },
  updateUser(user: AuthUser) {
    memoryUser = user;
  },
  consumeWelcome(): boolean {
    const show = welcomePending;
    welcomePending = false;
    return show;
  },
  clear() {
    memoryToken = null;
    memoryUser = null;
    welcomePending = false;
  },
};

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorizedCallback: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorizedCallback = fn;
}

/** Readable fallback message when the server replied without a JSON `error` field. */
function describeHttpFailure(status: number): string {
  switch (status) {
    case 413:
      return 'حجم البيانات المرسلة كبير جدًا على الخادم (413). قلّل حجم الملف أو قسّمه.';
    case 502:
    case 503:
      return `الخادم غير متاح مؤقتًا (${status}). حاول مرة أخرى بعد قليل.`;
    case 504:
      return 'انتهت مهلة تنفيذ العملية على الخادم (504). جرّب تقليل حجم البيانات أو أعد المحاولة.';
    case 500:
      return 'حدث خطأ داخل الخادم (500). راجع سجلات الخادم (Vercel Logs).';
    case 404:
      return 'المسار المطلوب غير موجود (404).';
    default:
      return `حدث خطأ غير متوقع (رمز الخطأ ${status}).`;
  }
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers,
  });
  if (res.status === 401) {
    if (!path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/me')) {
      authStorage.clear();
      onUnauthorizedCallback?.();
    } else if (path.startsWith('/api/auth/me')) {
      authStorage.clear();
    }
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(String(data.error || describeHttpFailure(res.status)), res.status, data);
  }
  return data as T;
}

export function apiUploadWithProgress<T = unknown>(
  path: string,
  bodyStr: string,
  onUploadProgress?: (fraction: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = authStorage.getToken();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'text';

    if (xhr.upload && onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          onUploadProgress(e.loaded / e.total);
        }
      };
      xhr.upload.onload = () => onUploadProgress(1);
    }

    xhr.onerror = () => reject(new Error('تعذّر الاتصال بالخادم.'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الطلب.'));
    xhr.onload = () => {
      if (xhr.status === 401) {
        authStorage.clear();
        onUnauthorizedCallback?.();
        reject(new Error('انتهت الجلسة'));
        return;
      }
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        // ignore parse errors
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(String(data.error || describeHttpFailure(xhr.status))));
        return;
      }
      resolve(data as T);
    };
    xhr.send(bodyStr);
  });
}

export async function fetchAuthenticatedBlobUrl(path: string): Promise<string | null> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    credentials: 'include',
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
