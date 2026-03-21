import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type UserProfile = {
  name: string;
  initials: string;
  avatarUrl: string | null;
  onboarded: boolean;
};

type UserProfileStore = UserProfile & {
  setProfile: (name: string, avatarUrl?: string | null) => void;
  completeOnboarding: () => void;
  reset: () => void;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const DEFAULTS: UserProfile = {
  name: '',
  initials: '',
  avatarUrl: null,
  onboarded: false,
};

export const useUserProfileStore = create<UserProfileStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setProfile: (name, avatarUrl = null) =>
        set({
          name: name.trim(),
          initials: getInitials(name) || '?',
          avatarUrl,
        }),

      completeOnboarding: () =>
        set({ onboarded: true }),

      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'macos:user-profile',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
