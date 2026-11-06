const TOKEN_KEY = "tf_session_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Session storage may be unavailable in restricted embedded contexts. */
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

/** Fetch wrapper that keeps the operator session alive even when third-party cookies are blocked. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
  if (response.status === 401 && token) {
    clearAuthToken();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("tf:unauthorized"));
  }
  return response;
}
