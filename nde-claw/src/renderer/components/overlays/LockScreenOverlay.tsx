import { useEffect, useId, useRef, useState } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useSystemStore } from '@/stores/systemStore';
import { useUserProfileStore } from '@/stores/userProfileStore';

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function LockScreenOverlay() {
  const passwordFieldId = useId();
  const unlockTimerRef = useRef<number | null>(null);
  const pointerOriginRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isLocked = useSystemStore((state) => state.isLocked);
  const platform = useSystemStore((state) => state.platform);
  const version = useSystemStore((state) => state.version);
  const unlock = useSystemStore((state) => state.unlock);
  const wallpaperImage = usePreferencesStore((state) => state.wallpaper.image);
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion);
  const userName = useUserProfileStore((state) => state.name) || 'User';
  const userInitials = useUserProfileStore((state) => state.initials) || '?';
  const [password, setPassword] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLocked) {
      setPassword('');
      setIsUnlocking(false);
      return;
    }

    setNow(new Date());

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1_000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [isLocked]);

  if (!isLocked) {
    return null;
  }

  const handleUnlock = () => {
    if (isUnlocking) {
      return;
    }

    if (reducedMotion) {
      setPassword('');
      unlock();
      return;
    }

    setIsUnlocking(true);

    unlockTimerRef.current = window.setTimeout(() => {
      setPassword('');
      setIsUnlocking(false);
      unlock();
    }, 420);
  };

  const hostLabel =
    platform === 'darwin' ? 'Mac ready to unlock' : platform ? `${platform} host` : 'Desktop ready';
  const buildLabel = version ? `Version ${version}` : 'Preview session';

  return (
    <div
      aria-describedby="lock-screen-hint"
      aria-label="Lock Screen"
      aria-modal="true"
      className={`lock-screen-overlay ${isUnlocking ? 'is-unlocking' : ''}`}
      onPointerCancel={() => {
        pointerOriginRef.current = null;
      }}
      onPointerDown={(event) => {
        pointerOriginRef.current = event.clientY;
      }}
      onPointerUp={(event) => {
        const pointerOrigin = pointerOriginRef.current;
        pointerOriginRef.current = null;

        if (pointerOrigin !== null && pointerOrigin - event.clientY > 110) {
          handleUnlock();
          return;
        }

        inputRef.current?.focus();
      }}
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="lock-screen-wallpaper"
        style={{ backgroundImage: `url(${wallpaperImage})` }}
      />
      <div aria-hidden="true" className="lock-screen-atmosphere" />
      <div aria-hidden="true" className="lock-screen-frost" />

      <div className="lock-screen-panel">
        <header className="lock-screen-header">
          <span className="lock-screen-chip">
            <span aria-hidden="true" className="lock-screen-live-dot" />
            Liquid Glass
          </span>
          <span className="lock-screen-chip">{buildLabel}</span>
        </header>

        <section className="lock-screen-hero">
          <p className="lock-screen-kicker">Locked</p>
          <p className="lock-screen-time">{timeFormatter.format(now)}</p>
          <p className="lock-screen-date">{dateFormatter.format(now)}</p>
        </section>

        <form
          className="lock-screen-auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            handleUnlock();
          }}
        >
          <div aria-hidden="true" className="lock-screen-avatar">
            {userInitials}
          </div>

          <div className="lock-screen-auth-copy">
            <h2>{userName}</h2>
            <p>{hostLabel}</p>
          </div>

          <label className="sr-only" htmlFor={passwordFieldId}>
            Password
          </label>

          <div className="lock-screen-auth-row">
            <input
              autoComplete="current-password"
              className="lock-screen-password"
              id={passwordFieldId}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Touch ID or password"
              ref={inputRef}
              type="password"
              value={password}
            />
            <button
              aria-label="Unlock Mac"
              className="lock-screen-unlock-button"
              type="submit"
            >
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 16 16"
              >
                <path d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5" />
              </svg>
            </button>
          </div>

          <p className="lock-screen-footnote">Swipe up or press Return to continue.</p>
        </form>
      </div>

      <footer className="lock-screen-footer">
        <div className="lock-screen-footer-pills">
          <span className="lock-screen-chip">{hostLabel}</span>
          <span className="lock-screen-chip">Swipe up to reveal the desktop</span>
        </div>
        <p className="lock-screen-footer-hint" id="lock-screen-hint">
          Control + Command + Q locks the session.
        </p>
        <div aria-hidden="true" className="lock-screen-swipe-indicator" />
      </footer>
    </div>
  );
}
