import type { PropsWithChildren, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type NativeCardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function NativeCard({ children, className, ...props }: NativeCardProps) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-[24px] border border-white/40 bg-white/70 p-4 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-black/25',
        className,
      )}
    >
      {children}
    </div>
  );
}
