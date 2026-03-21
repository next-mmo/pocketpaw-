import type { AppId } from '@/lib/apps';
import { NativeCard } from '@/components/ui/NativeCard';
import { appRegistry } from '@/config/apps';

export default function PlaceholderApp({ appId }: { appId: AppId }) {
  const definition = appRegistry[appId];

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <NativeCard className="items-center gap-4 px-8 py-10">
        <img
          className="h-24 w-24 rounded-[28px] object-cover"
          src={definition.icon}
          alt={definition.title}
        />
        <span className="text-[28px] font-semibold text-black dark:text-white">
          {definition.title}
        </span>
        <span className="max-w-[420px] text-center text-[15px] leading-6 text-black/65 dark:text-white/70">
          This surface is intentionally lightweight in the first Electron cut. The desktop shell,
          routing, window manager, and design system are live.
        </span>
      </NativeCard>
    </div>
  );
}
