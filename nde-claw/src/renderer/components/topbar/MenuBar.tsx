import { useCallback, useMemo, useRef } from 'react';
import { appRegistry } from '@/config/apps';
import { buildFinderMenus } from '@/config/menus';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { launchApp } from '@/lib/launchApp';
import { openExternal } from '@/lib/utils/desktop';
import { useAuthStore } from '@/stores/authStore';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { useMenuBarStore } from '@/stores/menuBarStore';
import { useSystemStore } from '@/stores/systemStore';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { MenuPopover } from './MenuPopover';

export function MenuBar() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeMenu = useMenuBarStore((state) => state.activeMenu);
  const menus = useMenuBarStore((state) => state.menus);
  const openMenu = useMenuBarStore((state) => state.openMenu);
  const closeMenu = useMenuBarStore((state) => state.closeMenu);
  const openLaunchpad = useLaunchpadStore((state) => state.open);
  const closeLaunchpad = useLaunchpadStore((state) => state.close);
  const lockDesktop = useSystemStore((state) => state.lock);
  const authLogout = useAuthStore((state) => state.logout);
  const userName = useUserProfileStore((state) => state.name);

  // Rebuild menus with the user's name for the "Log Out <Name>…" item
  const dynamicMenus = useMemo(() => buildFinderMenus(userName || undefined), [userName]);

  useOnClickOutside(containerRef, closeMenu);

  const handleMenuAction = useCallback(
    async (menuId: string) => {
      closeMenu();

      switch (menuId) {
        case 'about-this-mac':
          await launchApp('purus-twitter');
          break;
        case 'launchpad':
          openLaunchpad();
          break;
        case 'lock-screen':
          closeLaunchpad();
          lockDesktop();
          break;
        case 'logout':
          closeLaunchpad();
          authLogout();
          lockDesktop();
          break;
        case 'system-preferences':
        case 'preferences':
          await launchApp('wallpapers');
          break;
        case 'app-store':
          await launchApp('appstore');
          break;
        case 'new-finder-window':
          await launchApp('finder');
          break;
        case 'send-finder-feedback':
        case 'macos-help':
          await openExternal(appRegistry['view-source'].href!);
          break;
        default:
          break;
      }
    },
    [authLogout, closeLaunchpad, closeMenu, lockDesktop, openLaunchpad],
  );

  return (
    <div className="menu-bar" ref={containerRef}>
      {Object.entries(dynamicMenus).map(([menuId, menuSection]) => (
        <div className="menu-button-group" key={menuId}>
          <button
            className="menu-button no-drag"
            data-active={activeMenu === menuId}
            onClick={() => openMenu(activeMenu === menuId ? '' : menuId)}
            onMouseEnter={() => {
              if (activeMenu) {
                openMenu(menuId);
              }
            }}
            type="button"
          >
            {menuId === 'apple' ? <span className="apple-mark">OS</span> : menuSection.title}
          </button>

          {activeMenu === menuId ? (
            <div className="menu-popover-anchor">
              <MenuPopover menu={menuSection.menu} onSelect={handleMenuAction} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
