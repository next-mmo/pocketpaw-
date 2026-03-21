import type { PropsWithChildren, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type NativeButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    textClassName?: string;
    onPress?: () => void;
  }
>;

export function NativeButton({
  children,
  className,
  textClassName,
  onPress,
  onClick,
  ...props
}: NativeButtonProps) {
  return (
    <button
      type="button"
      {...props}
      onClick={onPress ?? onClick}
      className={cn(
        'rounded-2xl bg-white/70 px-4 py-2 shadow-sm shadow-black/10 active:opacity-80 dark:bg-white/10',
        className,
      )}
    >
      <span className={cn('text-[13px] font-medium text-black dark:text-white', textClassName)}>
        {children}
      </span>
    </button>
  );
}
