import { normalizeAppDefinitions, type AppDefinition } from '@/lib/apps';

type WindowAppOptions = Omit<AppDefinition, 'launchKind' | 'resizable' | 'expandable'> & {
  resizable?: boolean;
  expandable?: boolean;
};
type ExternalAppOptions = Omit<
  AppDefinition,
  'launchKind' | 'routePath' | 'resizable' | 'expandable'
>;

function createWindowApp(definition: WindowAppOptions): AppDefinition {
  return {
    launchKind: 'window',
    resizable: true,
    expandable: true,
    showInDock: true,
    ...definition,
  };
}

function createLaunchpadApp(definition: WindowAppOptions): AppDefinition {
  return createWindowApp({
    ...definition,
    showInDock: false,
  });
}

function createExternalApp(definition: ExternalAppOptions): AppDefinition {
  return {
    launchKind: 'external',
    resizable: false,
    expandable: false,
    showInDock: true,
    ...definition,
  };
}

const definitions: readonly AppDefinition[] = [
  createWindowApp({
    id: 'finder',
    title: 'Finder',
    icon: '/app-icons/finder/256.png',
    routePath: '/app/finder',
    defaultBounds: {
      width: 860,
      height: 580,
    },
    searchTerms: ['files', 'desktop', 'browser'],
  }),
  createWindowApp({
    id: 'wallpapers',
    title: 'Wallpapers',
    icon: '/app-icons/wallpapers/256.png',
    routePath: '/app/wallpapers',
    dockBreaksBefore: true,
    defaultBounds: {
      width: 960,
      height: 680,
    },
    searchTerms: ['backgrounds', 'desktop', 'appearance'],
  }),
  createWindowApp({
    id: 'calculator',
    title: 'Calculator',
    icon: '/app-icons/calculator/256.png',
    routePath: '/app/calculator',
    resizable: false,
    expandable: false,
    defaultBounds: {
      width: 340,
      height: 520,
    },
    searchTerms: ['math', 'numbers'],
  }),
  createWindowApp({
    id: 'calendar',
    title: 'Calendar',
    icon: '/app-icons/calendar/256.png',
    routePath: '/app/calendar',
    defaultBounds: {
      width: 900,
      height: 640,
    },
    searchTerms: ['schedule', 'dates'],
  }),
  createWindowApp({
    id: 'vscode',
    title: 'VSCode',
    icon: '/app-icons/vscode/256.png',
    routePath: '/app/vscode',
    defaultBounds: {
      width: 1024,
      height: 720,
    },
    searchTerms: ['editor', 'code', 'developer'],
  }),
  createWindowApp({
    id: 'appstore',
    title: 'App Store',
    icon: '/app-icons/appstore/256.png',
    routePath: '/app/appstore',
    defaultBounds: {
      width: 1010,   // ~70% of 1440 default viewport
      height: 720,
    },
    searchTerms: ['store', 'download', 'apps', 'tahoe', 'upgrade', 'macos 26'],
  }),
  createWindowApp({
    id: 'purus-twitter',
    title: 'About the Developer',
    icon: '/app-icons/purus-twitter/256.png',
    routePath: '/app/purus-twitter',
    dockBreaksBefore: true,
    defaultBounds: {
      width: 860,
      height: 620,
    },
    searchTerms: ['developer', 'profile', 'about'],
  }),
  createLaunchpadApp({
    id: 'mail',
    title: 'Mail',
    icon: '/app-icons/mail/256.png',
    routePath: '/app/mail',
    defaultBounds: {
      width: 920,
      height: 640,
    },
    searchTerms: ['email', 'inbox'],
  }),
  createLaunchpadApp({
    id: 'messages',
    title: 'Messages',
    icon: '/app-icons/messages/256.png',
    routePath: '/app/messages',
    defaultBounds: {
      width: 920,
      height: 640,
    },
    searchTerms: ['chat', 'sms', 'imessage'],
  }),
  createLaunchpadApp({
    id: 'facetime',
    title: 'FaceTime',
    icon: '/app-icons/facetime/256.png',
    routePath: '/app/facetime',
    defaultBounds: {
      width: 880,
      height: 620,
    },
    searchTerms: ['video', 'call'],
  }),
  createLaunchpadApp({
    id: 'contacts',
    title: 'Contacts',
    icon: '/app-icons/contacts/256.png',
    routePath: '/app/contacts',
    defaultBounds: {
      width: 820,
      height: 600,
    },
    searchTerms: ['address book', 'people'],
  }),
  createLaunchpadApp({
    id: 'notes',
    title: 'Notes',
    icon: '/app-icons/notes/256.png',
    routePath: '/app/notes',
    defaultBounds: {
      width: 840,
      height: 620,
    },
    searchTerms: ['writing', 'scratchpad'],
  }),
  createLaunchpadApp({
    id: 'activity-monitor',
    title: 'Activity Monitor',
    icon: '/app-icons/devutils/256.webp',
    routePath: '/app/activity-monitor',
    defaultBounds: {
      width: 980,
      height: 650,
    },
    searchTerms: ['activity', 'monitor', 'telemetry', 'agent', 'tools'],
  }),
  createLaunchpadApp({
    id: 'reminders',
    title: 'Reminders',
    icon: '/app-icons/reminders/256.png',
    routePath: '/app/reminders',
    defaultBounds: {
      width: 840,
      height: 620,
    },
    searchTerms: ['tasks', 'todo'],
  }),
  createLaunchpadApp({
    id: 'photos',
    title: 'Photos',
    icon: '/app-icons/photos/256.png',
    routePath: '/app/photos',
    defaultBounds: {
      width: 980,
      height: 680,
    },
    searchTerms: ['gallery', 'images'],
  }),
  createLaunchpadApp({
    id: 'music',
    title: 'Music',
    icon: '/app-icons/music/256.png',
    routePath: '/app/music',
    defaultBounds: {
      width: 980,
      height: 660,
    },
    searchTerms: ['songs', 'audio'],
  }),
  createLaunchpadApp({
    id: 'podcasts',
    title: 'Podcasts',
    icon: '/app-icons/podcasts/256.png',
    routePath: '/app/podcasts',
    defaultBounds: {
      width: 980,
      height: 660,
    },
    searchTerms: ['shows', 'episodes'],
  }),
  createLaunchpadApp({
    id: 'tv',
    title: 'TV',
    icon: '/app-icons/tv/256.png',
    routePath: '/app/tv',
    defaultBounds: {
      width: 1040,
      height: 700,
    },
    searchTerms: ['video', 'movies', 'shows'],
  }),
  createLaunchpadApp({
    id: 'news',
    title: 'News',
    icon: '/app-icons/news/256.png',
    routePath: '/app/news',
    defaultBounds: {
      width: 980,
      height: 660,
    },
    searchTerms: ['articles', 'headlines'],
  }),
  createLaunchpadApp({
    id: 'maps',
    title: 'Maps',
    icon: '/app-icons/maps/256.png',
    routePath: '/app/maps',
    defaultBounds: {
      width: 1040,
      height: 700,
    },
    searchTerms: ['directions', 'travel'],
  }),
  createLaunchpadApp({
    id: 'safari',
    title: 'Safari',
    icon: '/app-icons/safari/256.png',
    routePath: '/app/safari',
    defaultBounds: {
      width: 1040,
      height: 720,
    },
    searchTerms: ['browser', 'web'],
  }),
  createLaunchpadApp({
    id: 'system-preferences',
    title: 'System Settings',
    icon: '/app-icons/system-preferences/256.png',
    routePath: '/app/system-preferences',
    defaultBounds: {
      width: 900,
      height: 640,
    },
    searchTerms: ['preferences', 'settings'],
  }),
  createLaunchpadApp({
    id: 'terminal',
    title: 'Terminal',
    icon: '/app-icons/terminal/256.png',
    routePath: '/app/terminal',
    defaultBounds: {
      width: 940,
      height: 620,
    },
    searchTerms: ['shell', 'command line'],
  }),
  createLaunchpadApp({
    id: 'keynote',
    title: 'Keynote',
    icon: '/app-icons/keynote/256.png',
    routePath: '/app/keynote',
    defaultBounds: {
      width: 980,
      height: 680,
    },
    searchTerms: ['presentation', 'slides'],
  }),
  createExternalApp({
    id: 'view-source',
    title: 'View Source',
    icon: '/app-icons/view-source/256.png',
    href: 'https://github.com/puruvj/macos-web',
    defaultBounds: {
      width: 0,
      height: 0,
    },
  }),
  createExternalApp({
    id: 'vercel',
    title: 'Powered by Vercel',
    icon: '/app-icons/vercel/256.webp',
    href: 'https://vercel.com/?utm_source=purus-projects&utm_campaign=oss',
    dockBreaksBefore: true,
    defaultBounds: {
      width: 0,
      height: 0,
    },
  }),
];

export const appDefinitions = definitions;
export const appRegistry = normalizeAppDefinitions(definitions);
export const appIds = definitions.map((definition) => definition.id);
