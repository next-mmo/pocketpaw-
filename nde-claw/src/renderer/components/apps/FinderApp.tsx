import type { AppId } from '@/lib/apps';
import { launchApp } from '@/lib/launchApp';
import { NativeButton } from '@/components/ui/NativeButton';
import { NativeCard } from '@/components/ui/NativeCard';
import { appRegistry } from '@/config/apps';

const quickLaunchApps: AppId[] = ['wallpapers', 'calendar', 'calculator', 'appstore'];

type FinderAppProps = {
  appId: AppId;
};

export default function FinderApp({ appId }: FinderAppProps) {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <NativeCard className="gap-3">
        <span className="text-[12px] uppercase tracking-[1.5px] text-black/50 dark:text-white/55">
          {appRegistry[appId].title}
        </span>
        <span className="block text-[28px] font-semibold text-black dark:text-white">
          Welcome back to the desktop.
        </span>
        <span className="block text-[14px] leading-6 text-black/70 dark:text-white/70">
          The Finder keeps the shell active while the rest of the apps open in their own windows.
          Use the shortcuts below to jump into the core experiences.
        </span>
      </NativeCard>

      <div className="grid gap-4 md:grid-cols-2">
        {quickLaunchApps.map((quickAppId) => {
          const definition = appRegistry[quickAppId];

          return (
            <NativeCard className="gap-3" key={quickAppId}>
              <div className="flex items-center gap-3">
                <img
                  className="h-14 w-14 rounded-2xl object-cover"
                  src={definition.icon}
                  alt={definition.title}
                />
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[17px] font-semibold text-black dark:text-white">
                    {definition.title}
                  </span>
                  <span className="text-[13px] text-black/60 dark:text-white/65">
                    Open the {definition.title.toLowerCase()} workspace.
                  </span>
                </div>
              </div>
              <NativeButton
                className="items-center"
                onPress={() => void launchApp(quickAppId)}
              >
                Launch
              </NativeButton>
            </NativeCard>
          );
        })}
      </div>
    </div>
  );
}
