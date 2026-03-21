import { useState } from 'react';
import { useUserProfileStore } from '@/stores/userProfileStore';
import { usePreferencesStore } from '@/stores/preferencesStore';

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-purple-600',
  'from-pink-500 to-rose-500',
  'from-cyan-400 to-blue-500',
  'from-emerald-400 to-teal-500',
  'from-violet-400 to-fuchsia-500',
  'from-orange-400 to-amber-500',
];

export function OnboardingOverlay() {
  const onboarded = useUserProfileStore((s) => s.onboarded);
  const setProfile = useUserProfileStore((s) => s.setProfile);
  const completeOnboarding = useUserProfileStore((s) => s.completeOnboarding);
  const wallpaperImage = usePreferencesStore((s) => s.wallpaper.image);

  const [name, setName] = useState('');
  const [step, setStep] = useState<'welcome' | 'name' | 'done'>('welcome');
  const [gradIdx] = useState(() => Math.floor(Math.random() * AVATAR_GRADIENTS.length));

  if (onboarded) return null;

  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const handleFinish = () => {
    const finalName = name.trim() || 'User';
    setProfile(finalName);
    completeOnboarding();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-label="Welcome"
      aria-modal="true"
    >
      {/* Wallpaper bg */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${wallpaperImage})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl" aria-hidden="true" />

      {/* Card */}
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/15 bg-black/50 shadow-2xl backdrop-blur-xl"
        style={{ animation: 'onboard-fade-in 0.6s ease-out' }}
      >
        {step === 'welcome' && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-linear-to-br from-indigo-500 to-purple-600 text-[36px] shadow-lg shadow-purple-500/30">
              🐾
            </div>
            <h1 className="text-[24px] font-bold text-white">Welcome to PocketPaw</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
              Your AI assistant, running locally on your machine. Let's personalise your experience.
            </p>
            <button
              type="button"
              className="mt-7 w-full rounded-xl bg-white/90 px-6 py-3 text-[14px] font-semibold text-black transition-all hover:bg-white active:scale-[.97]"
              onClick={() => setStep('name')}
            >
              Get Started
            </button>
            <button
              type="button"
              className="mt-2 text-[12px] text-white/35 hover:text-white/55 transition-colors"
              onClick={handleFinish}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'name' && (
          <form
            className="flex flex-col items-center px-8 py-10 text-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                setStep('done');
              }
            }}
          >
            {/* Avatar preview */}
            <div
              className={`mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-linear-to-br ${AVATAR_GRADIENTS[gradIdx]} text-[28px] font-bold text-white shadow-lg transition-all`}
            >
              {initials}
            </div>

            <h2 className="text-[20px] font-bold text-white">What's your name?</h2>
            <p className="mt-1.5 text-[13px] text-white/45">
              This is shown on the lock screen and menus.
            </p>

            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-5 w-full rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-center text-[15px] text-white placeholder:text-white/25 outline-none focus:border-white/25 focus:bg-white/12 transition-all"
              maxLength={32}
            />

            <button
              type="submit"
              disabled={!name.trim()}
              className="mt-5 w-full rounded-xl bg-white/90 px-6 py-3 text-[14px] font-semibold text-black transition-all hover:bg-white active:scale-[.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            <button
              type="button"
              className="mt-2 text-[12px] text-white/35 hover:text-white/55 transition-colors"
              onClick={handleFinish}
            >
              Skip
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            {/* Avatar */}
            <div
              className={`mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-linear-to-br ${AVATAR_GRADIENTS[gradIdx]} text-[28px] font-bold text-white shadow-lg`}
              style={{ animation: 'onboard-pop 0.4s ease-out' }}
            >
              {initials}
            </div>

            <h2 className="text-[20px] font-bold text-white">
              Hey, {name.trim().split(/\s+/)[0]}! 👋
            </h2>
            <p className="mt-1.5 text-[13px] text-white/45">
              You're all set. PocketPaw is ready to go.
            </p>

            <button
              type="button"
              className="mt-7 w-full rounded-xl bg-white/90 px-6 py-3 text-[14px] font-semibold text-black transition-all hover:bg-white active:scale-[.97]"
              onClick={handleFinish}
            >
              Enter PocketPaw
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes onboard-fade-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes onboard-pop {
          0%   { transform: scale(0.8); }
          50%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
