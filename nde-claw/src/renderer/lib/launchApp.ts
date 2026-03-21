import { appRegistry } from '@/config/apps';
import type { AppId } from '@/lib/apps';
import { openExternal } from '@/lib/utils/desktop';
import { useLaunchpadStore } from '@/stores/launchpadStore';
import { useWindowsStore } from '@/stores/windowsStore';

export async function launchApp(appId: AppId) {
  const definition = appRegistry[appId];

  useLaunchpadStore.getState().close();

  if (definition.launchKind === 'external') {
    await openExternal(definition.href!);
    return;
  }

  const { openApp, focusApp } = useWindowsStore.getState();
  openApp(appId);
  focusApp(appId);
}
