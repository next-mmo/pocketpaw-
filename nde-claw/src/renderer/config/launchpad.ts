import type { AppId } from '@/lib/apps';

export const LAUNCHPAD_PAGE_SIZE = 10;

export type LaunchpadFolderId =
  | 'communication'
  | 'work'
  | 'explore'
  | 'media'
  | 'utilities';

export type LaunchpadFolderDefinition = {
  id: LaunchpadFolderId;
  title: string;
  subtitle: string;
  appIds: AppId[];
};

export type LaunchpadHomeItem =
  | {
      type: 'app';
      appId: AppId;
    }
  | {
      type: 'folder';
      folderId: LaunchpadFolderId;
    };

export const launchpadFolders: Record<LaunchpadFolderId, LaunchpadFolderDefinition> = {
  communication: {
    id: 'communication',
    title: 'Communication',
    subtitle: 'Mail, chat, and calls',
    appIds: ['messages', 'mail', 'facetime', 'contacts'],
  },
  work: {
    id: 'work',
    title: 'Work',
    subtitle: 'Notes and planning tools',
    appIds: ['notes', 'reminders', 'keynote'],
  },
  explore: {
    id: 'explore',
    title: 'Explore',
    subtitle: 'Browse and discover',
    appIds: ['safari', 'maps', 'news'],
  },
  media: {
    id: 'media',
    title: 'Media',
    subtitle: 'Photos, music, and shows',
    appIds: ['photos', 'music', 'podcasts', 'tv'],
  },
  utilities: {
    id: 'utilities',
    title: 'Utilities',
    subtitle: 'System-level tools',
    appIds: ['system-preferences', 'activity-monitor', 'terminal'],
  },
};

export const launchpadHomeItems: LaunchpadHomeItem[] = [
  { type: 'app', appId: 'finder' },
  { type: 'app', appId: 'calendar' },
  { type: 'app', appId: 'calculator' },
  { type: 'app', appId: 'wallpapers' },
  { type: 'app', appId: 'vscode' },
  { type: 'app', appId: 'appstore' },
  { type: 'app', appId: 'safari' },
  { type: 'app', appId: 'photos' },
  { type: 'app', appId: 'system-preferences' },
  { type: 'app', appId: 'mail' },
  { type: 'folder', folderId: 'communication' },
  { type: 'folder', folderId: 'work' },
  { type: 'folder', folderId: 'explore' },
  { type: 'folder', folderId: 'media' },
  { type: 'folder', folderId: 'utilities' },
];

const launchpadSearchableAppIdSet = new Set<AppId>();

for (const item of launchpadHomeItems) {
  if (item.type === 'app') {
    launchpadSearchableAppIdSet.add(item.appId);
    continue;
  }

  for (const appId of launchpadFolders[item.folderId].appIds) {
    launchpadSearchableAppIdSet.add(appId);
  }
}

export const launchpadSearchableAppIds = [...launchpadSearchableAppIdSet];
