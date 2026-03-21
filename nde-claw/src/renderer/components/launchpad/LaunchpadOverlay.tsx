import { useEffect, useMemo, useRef } from 'react';
import {
  LAUNCHPAD_PAGE_SIZE,
  launchpadFolders,
  launchpadHomeItems,
  launchpadSearchableAppIds,
} from '@/config/launchpad';
import { appRegistry } from '@/config/apps';
import { launchApp } from '@/lib/launchApp';
import { cn } from '@/lib/utils/cn';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { useWindowsStore } from '@/stores/windowsStore';

function matchesQuery(appId: (typeof launchpadSearchableAppIds)[number], query: string) {
  const definition = appRegistry[appId];
  const searchValue = [definition.title, ...(definition.searchTerms ?? [])].join(' ').toLowerCase();

  return searchValue.includes(query.toLowerCase());
}

export function LaunchpadOverlay() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpen = useLaunchpadStore((state) => state.isOpen);
  const query = useLaunchpadStore((state) => state.query);
  const activePage = useLaunchpadStore((state) => state.activePage);
  const activeFolderId = useLaunchpadStore((state) => state.activeFolderId);
  const close = useLaunchpadStore((state) => state.close);
  const open = useLaunchpadStore((state) => state.open);
  const setQuery = useLaunchpadStore((state) => state.setQuery);
  const setActivePage = useLaunchpadStore((state) => state.setActivePage);
  const openFolder = useLaunchpadStore((state) => state.openFolder);
  const closeFolder = useLaunchpadStore((state) => state.closeFolder);
  const windows = useWindowsStore((state) => state.windows);

  const recentApps = useMemo(
    () =>
      Object.entries(windows)
        .filter(([, windowState]) => windowState.open)
        .sort(([, left], [, right]) => right.zIndex - left.zIndex)
        .map(([appId]) => appId)
        .filter((appId) =>
          launchpadSearchableAppIds.includes(appId as (typeof launchpadSearchableAppIds)[number]),
        )
        .slice(0, 4) as (typeof launchpadSearchableAppIds),
    [windows],
  );
  const searchResults = useMemo(
    () => launchpadSearchableAppIds.filter((appId) => matchesQuery(appId, query)),
    [query],
  );
  const pageCount = Math.ceil(launchpadHomeItems.length / LAUNCHPAD_PAGE_SIZE);
  const pagedItems = useMemo(() => {
    const start = activePage * LAUNCHPAD_PAGE_SIZE;
    return launchpadHomeItems.slice(start, start + LAUNCHPAD_PAGE_SIZE);
  }, [activePage]);
  const activeFolder = activeFolderId ? launchpadFolders[activeFolderId] : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shouldToggle =
        event.key === 'F4' || ((event.metaKey || event.ctrlKey) && event.code === 'Space');

      if (shouldToggle) {
        event.preventDefault();

        if (isOpen) {
          close();
        } else {
          open();
        }

        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();

        if (activeFolderId) {
          closeFolder();
          return;
        }

        close();
        return;
      }

      if (!query && !activeFolderId && event.key === 'ArrowRight') {
        event.preventDefault();
        setActivePage(Math.min(activePage + 1, Math.max(pageCount - 1, 0)));
      }

      if (!query && !activeFolderId && event.key === 'ArrowLeft') {
        event.preventDefault();
        setActivePage(Math.max(activePage - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeFolderId,
    activePage,
    close,
    closeFolder,
    isOpen,
    open,
    pageCount,
    query,
    setActivePage,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    document.body.classList.toggle('launchpad-open', isOpen);

    return () => {
      document.body.classList.remove('launchpad-open');
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <section
      aria-label="Launchpad"
      className="launchpad-overlay"
      onClick={close}
      role="dialog"
    >
      <div aria-hidden="true" className="launchpad-backdrop-glow" />

      <div className="launchpad-shell" onClick={(event) => event.stopPropagation()}>
        <header className="launchpad-header">
          <div className="launchpad-search">
            <span aria-hidden="true" className="launchpad-search-icon">
              ⌕
            </span>
            <input
              aria-label="Search apps"
              className="launchpad-search-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps"
              ref={inputRef}
              type="search"
              value={query}
            />
          </div>

          <div className="launchpad-hint">F4 or Ctrl/⌘ + Space</div>
        </header>

        {!query && !activeFolder ? (
          <section className="launchpad-hero">
            <div>
              <p className="launchpad-eyebrow">Launchpad</p>
              <h2>Everything on this desktop, in one fast surface.</h2>
            </div>

            {recentApps.length > 0 ? (
              <div className="launchpad-recents">
                <span className="launchpad-recents-label">Recent</span>

                <div className="launchpad-recents-grid">
                  {recentApps.map((appId) => {
                    const definition = appRegistry[appId];

                    return (
                      <button
                        aria-label={definition.title}
                        className="launchpad-recent-button"
                        key={appId}
                        onClick={() => void launchApp(appId)}
                        type="button"
                      >
                        <img alt={definition.title} src={definition.icon} />
                        <span>{definition.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeFolder ? (
          <section className="launchpad-folder-panel">
            <div className="launchpad-folder-header">
              <div>
                <p className="launchpad-folder-kicker">Folder</p>
                <h3>{activeFolder.title}</h3>
                <p>{activeFolder.subtitle}</p>
              </div>

              <button className="launchpad-folder-close" onClick={closeFolder} type="button">
                Done
              </button>
            </div>

            <div className="launchpad-grid">
              {activeFolder.appIds.map((appId, index) => {
                const definition = appRegistry[appId];

                return (
                  <button
                    aria-label={definition.title}
                    className={cn('launchpad-card', windows[appId].open ? 'is-open' : '')}
                    key={appId}
                    onClick={() => void launchApp(appId)}
                    style={{ animationDelay: `${index * 20}ms` }}
                    type="button"
                  >
                    <img alt={definition.title} className="launchpad-card-icon" src={definition.icon} />
                    <span className="launchpad-card-title">{definition.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : query ? (
          <section className="launchpad-results">
            <div className="launchpad-results-header">
              <span>Results</span>
              <span>{searchResults.length}</span>
            </div>

            {searchResults.length > 0 ? (
              <div className="launchpad-grid">
                {searchResults.map((appId, index) => {
                  const definition = appRegistry[appId];

                  return (
                    <button
                      aria-label={definition.title}
                      className={cn('launchpad-card', windows[appId].open ? 'is-open' : '')}
                      key={appId}
                      onClick={() => void launchApp(appId)}
                      style={{ animationDelay: `${index * 14}ms` }}
                      type="button"
                    >
                      <img alt={definition.title} className="launchpad-card-icon" src={definition.icon} />
                      <span className="launchpad-card-title">{definition.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="launchpad-empty-state">
                <h3>No matches for &quot;{query}&quot;</h3>
                <p>Try app names like Safari, Notes, Terminal, or Wallpapers.</p>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="launchpad-grid">
              {pagedItems.map((item, index) => {
                if (item.type === 'app') {
                  const definition = appRegistry[item.appId];

                  return (
                    <button
                      aria-label={definition.title}
                      className={cn('launchpad-card', windows[item.appId].open ? 'is-open' : '')}
                      key={item.appId}
                      onClick={() => void launchApp(item.appId)}
                      style={{ animationDelay: `${index * 20}ms` }}
                      type="button"
                    >
                      <img alt={definition.title} className="launchpad-card-icon" src={definition.icon} />
                      <span className="launchpad-card-title">{definition.title}</span>
                    </button>
                  );
                }

                const folder = launchpadFolders[item.folderId];

                return (
                  <button
                    aria-label={folder.title}
                    className="launchpad-folder-tile"
                    key={item.folderId}
                    onClick={() => openFolder(item.folderId)}
                    style={{ animationDelay: `${index * 20}ms` }}
                    type="button"
                  >
                    <div className="launchpad-folder-preview">
                      {folder.appIds.slice(0, 4).map((appId) => {
                        const definition = appRegistry[appId];

                        return <img alt={definition.title} key={appId} src={definition.icon} />;
                      })}
                    </div>
                    <span className="launchpad-card-title">{folder.title}</span>
                    <span className="launchpad-folder-subtitle">{folder.subtitle}</span>
                  </button>
                );
              })}
            </div>

            {pageCount > 1 ? (
              <footer className="launchpad-pagination">
                {Array.from({ length: pageCount }, (_, pageIndex) => (
                  <button
                    aria-label={`Show Launchpad page ${pageIndex + 1}`}
                    className={cn('launchpad-page-dot', pageIndex === activePage ? 'is-active' : '')}
                    key={pageIndex}
                    onClick={() => setActivePage(pageIndex)}
                    type="button"
                  />
                ))}
              </footer>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
