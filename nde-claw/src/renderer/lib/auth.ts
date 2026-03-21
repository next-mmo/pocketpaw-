const REFRESH_MARGIN_S = 5 * 60;
const TOKEN_VALID_BUFFER_S = 30;

export type OAuthTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  scopes: string[];
};

let refreshPromise: Promise<OAuthTokens> | null = null;
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

function isMissingIpcHandler(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('No handler registered')
  );
}

export async function readTokens(): Promise<OAuthTokens | null> {
  if (!window.desktop?.pocketpaw.readOAuthTokens) {
    return null;
  }

  try {
    return await window.desktop.pocketpaw.readOAuthTokens();
  } catch (error) {
    if (isMissingIpcHandler(error)) {
      return null;
    }

    throw error;
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await window.desktop?.pocketpaw.clearOAuthTokens?.();
  } catch (error) {
    if (!isMissingIpcHandler(error)) {
      throw error;
    }
  }
}

export async function startOAuthFlow(): Promise<OAuthTokens> {
  if (!window.desktop?.pocketpaw.startOAuthFlow) {
    throw new Error('OAuth sign-in is unavailable in this environment.');
  }

  try {
    return await window.desktop.pocketpaw.startOAuthFlow();
  } catch (error) {
    if (isMissingIpcHandler(error)) {
      throw new Error('Restart Electron so the updated desktop auth handlers are loaded.');
    }

    throw error;
  }
}

export async function refreshAccessToken(tokens: OAuthTokens): Promise<OAuthTokens> {
  if (refreshPromise) {
    return refreshPromise;
  }

  if (!tokens.refresh_token) {
    throw new Error('No refresh token available.');
  }

  refreshPromise = (async () => {
    if (!window.desktop?.pocketpaw.refreshOAuthTokens) {
      throw new Error('Token refresh is unavailable in this environment.');
    }

    try {
      return await window.desktop.pocketpaw.refreshOAuthTokens();
    } catch (error) {
      if (isMissingIpcHandler(error)) {
        throw new Error('Stored token refresh is unavailable until Electron restarts.');
      }

      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function getValidTokens(): Promise<OAuthTokens | null> {
  const tokens = await readTokens();

  if (!tokens) {
    return null;
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > nowS + TOKEN_VALID_BUFFER_S) {
    return tokens;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  try {
    return await refreshAccessToken(tokens);
  } catch {
    return null;
  }
}

export function scheduleTokenRefresh(
  tokens: OAuthTokens,
  onRefreshed: (newTokens: OAuthTokens) => void | Promise<void>,
  onFailed: (error: Error) => void | Promise<void>,
): void {
  cancelScheduledRefresh();

  const nowS = Math.floor(Date.now() / 1000);
  const delayS = Math.max(tokens.expires_at - nowS - REFRESH_MARGIN_S, 10);

  scheduledTimer = setTimeout(async () => {
    try {
      const newTokens = await refreshAccessToken(tokens);
      await onRefreshed(newTokens);
      scheduleTokenRefresh(newTokens, onRefreshed, onFailed);
    } catch (error) {
      await onFailed(error instanceof Error ? error : new Error(String(error)));
    }
  }, delayS * 1000);
}

export function cancelScheduledRefresh(): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}
