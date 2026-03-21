import type { UseAuthResult } from '@/hooks/useAuth';

type AuthOverlayProps = {
  auth: UseAuthResult;
};

export function AuthOverlay({ auth }: AuthOverlayProps) {
  if (auth.isAuthenticated) {
    return null;
  }

  const copy = getCopy(auth.authState, auth.authError);
  const steps = [
    {
      label: 'Backend',
      value: 'Wake local services',
      status:
        auth.authState === 'checking_backend'
          ? 'active'
          : auth.authState === 'authenticating' || auth.authState === 'authenticated'
            ? 'done'
            : 'idle',
    },
    {
      label: 'Approval',
      value: 'Browser PKCE sign-in',
      status:
        auth.authState === 'authenticating'
          ? 'active'
          : auth.authState === 'authenticated'
            ? 'done'
            : 'idle',
    },
    {
      label: 'Realtime',
      value: auth.wsState === 'connected' ? 'WebSocket linked' : 'Secure session cookie',
      status:
        auth.authState === 'authenticated'
          ? 'done'
          : auth.authState === 'error'
            ? 'idle'
            : 'pending',
    },
  ] as const;

  return (
    <div aria-live="polite" className="desktop-auth-overlay" role="dialog">
      <div aria-hidden="true" className="desktop-auth-atmosphere" />

      <section className="desktop-auth-panel">
        <header className="desktop-auth-header">
          <span className="desktop-auth-chip">PocketPaw Desktop</span>
          <span className="desktop-auth-chip desktop-auth-chip-muted">{copy.badge}</span>
        </header>

        <div className="desktop-auth-hero">
          <div aria-hidden="true" className="desktop-auth-orb">
            <div className="desktop-auth-orb-core">PP</div>
          </div>

          <div className="desktop-auth-copy">
            <p className="desktop-auth-kicker">Secure local sign-in</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
        </div>

        <div className="desktop-auth-status-row">
          <div className="desktop-auth-spinner-shell" aria-hidden="true">
            <div className="desktop-auth-spinner" />
          </div>
          <div>
            <p className="desktop-auth-status-label">{copy.statusLabel}</p>
            <p className="desktop-auth-status-note">{copy.statusNote}</p>
          </div>
        </div>

        <div className="desktop-auth-step-grid">
          {steps.map((step) => (
            <article
              className={`desktop-auth-step desktop-auth-step-${step.status}`}
              key={step.label}
            >
              <p>{step.label}</p>
              <strong>{step.value}</strong>
            </article>
          ))}
        </div>

        {auth.isError ? <p className="desktop-auth-error">{auth.authError}</p> : null}

        <footer className="desktop-auth-actions">
          {auth.isError ? (
            <button className="desktop-auth-primary" onClick={() => void auth.retry()} type="button">
              Try Again
            </button>
          ) : (
            <button className="desktop-auth-secondary" disabled type="button">
              {copy.buttonLabel}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function getCopy(authState: UseAuthResult['authState'], authError: string | null) {
  switch (authState) {
    case 'checking_backend':
      return {
        badge: 'Preparing',
        title: 'Waking the local PocketPaw services.',
        description:
          'The desktop app is verifying the local backend before it opens a secure browser sign-in.',
        statusLabel: 'Checking backend readiness',
        statusNote: 'This stays local to your machine.',
        buttonLabel: 'Preparing',
      };
    case 'authenticating':
      return {
        badge: 'Browser Approval',
        title: 'Approve access in your browser.',
        description:
          'The flow mirrors the existing desktop client: loopback PKCE, local token storage, then a session cookie for realtime traffic.',
        statusLabel: 'Waiting for OAuth approval',
        statusNote: 'Return here after granting access.',
        buttonLabel: 'Waiting for Approval',
      };
    case 'error':
      return {
        badge: 'Needs Attention',
        title: 'PocketPaw could not finish signing in.',
        description:
          authError ??
          'The secure session did not come up. Retry the flow to relaunch the browser and refresh the desktop session.',
        statusLabel: 'Authentication failed',
        statusNote: 'Retry relaunches the browser approval step.',
        buttonLabel: 'Try Again',
      };
    default:
      return {
        badge: 'Connecting',
        title: 'Connecting PocketPaw.',
        description: 'Initializing the desktop session.',
        statusLabel: 'Connecting',
        statusNote: 'This should only take a moment.',
        buttonLabel: 'Connecting',
      };
  }
}
