import type { AppId } from '@/lib/apps';
import { NativeButton } from '@/components/ui/NativeButton';
import { NativeCard } from '@/components/ui/NativeCard';
import { openExternal } from '@/lib/utils/desktop';

const links = [
  ['Blog', 'https://www.puruvj.dev/blog'],
  ['Works', 'https://www.puruvj.dev/works'],
  ['Twitter', 'https://www.puruvj.dev/twitter'],
  ['GitHub', 'https://www.puruvj.dev/github'],
  ['Dev.to', 'https://www.puruvj.dev/devto'],
] as const;

export default function DeveloperApp(_props: { appId: AppId }) {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
      <NativeCard className="items-center gap-4 p-6">
        <img
          className="h-28 w-28 rounded-full object-cover"
          src="/purus-profile/puru.webp"
          alt="Puru"
        />
        <span className="text-[30px] font-semibold text-black dark:text-white">
          Hi, I&apos;m Puru
        </span>
        <span className="max-w-[560px] text-center text-[15px] leading-6 text-black/70 dark:text-white/70">
          Creator of macOS Web, with a focus on frontend craft, JavaScript, TypeScript, and modern
          product interfaces.
        </span>
      </NativeCard>

      <div className="grid gap-4 md:grid-cols-2">
        {links.map(([label, href]) => (
          <NativeCard className="gap-3" key={href}>
            <span className="text-[18px] font-semibold text-black dark:text-white">{label}</span>
            <span className="text-[13px] leading-5 text-black/65 dark:text-white/70">{href}</span>
            <NativeButton className="items-center" onPress={() => void openExternal(href)}>
              Open
            </NativeButton>
          </NativeCard>
        ))}
      </div>
    </div>
  );
}
