/**
 * Typed API client for SkinSentry Web Frontend.
 *
 * Rules:
 * - Access token stored in memory ONLY (never in localStorage).
 * - Automatic refresh token rotation via httpOnly cookie.
 * - Standardized clinical error objects.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code: string = "api_error", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiClient<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const headers = new Headers(options.headers || {});

  if (!options.skipAuth && inMemoryAccessToken) {
    headers.set("Authorization", `Bearer ${inMemoryAccessToken}`);
  }

  // Do not set Content-Type if body is FormData (browser sets boundary)
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // sends and receives httpOnly refresh cookie
  });

  // Handle 401 Unauthorized -> attempt silent refresh
  if (response.status === 401 && !options.skipAuth && !endpoint.includes("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      const retryResponse = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });
      if (!retryResponse.ok) {
        return handleError(retryResponse);
      }
      return retryResponse.json() as Promise<T>;
    }
  }

  if (!response.ok) {
    return handleError(response);
  }

  // Handle empty or void responses (e.g. 204)
  const contentType = response.headers.get("Content-Type");
  if (contentType && contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const resp = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }
    }
  } catch {
    // refresh failed
  }
  setAccessToken(null);
  return null;
}

async function handleError(response: Response): Promise<never> {
  let errBody: { error?: string; message?: string; details?: unknown } = {};
  try {
    errBody = await response.json();
  } catch {
    // Non-JSON response
  }

  const message = errBody.message || response.statusText || "Request failed";
  const code = errBody.error || `http_${response.status}`;
  throw new ApiError(response.status, message, code, errBody.details);
}
