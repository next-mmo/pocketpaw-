import type { AppId } from '@/lib/apps';
import { openExternal } from '@/lib/utils/desktop';

const upgradeGuideUrl = 'https://support.apple.com/en-nz/122727';
const featuresPdfUrl = 'https://www.apple.com/ph/os/pdf/All_New_Features_macOS_Tahoe_Sept_2025.pdf';

const releaseMeta = [
  ['Delivery', 'Software Update'],
  ['Published', 'December 10, 2025'],
  ['Compatibility', 'Apple silicon Macs plus select Intel models'],
] as const;

const featureHighlights = [
  {
    title: 'Liquid Glass',
    description:
      'Tahoe refreshes macOS with transparent system chrome, rounder windows, and more flexible icon tinting.',
  },
  {
    title: 'Phone + Live Activities',
    description:
      'Continuity brings the Phone app to Mac, while Live Activities surface real-time updates in the menu bar.',
  },
  {
    title: 'Spotlight Actions',
    description:
      'Spotlight now ranks mixed results together, surfaces clipboard history, and runs actions without leaving the keyboard.',
  },
  {
    title: 'Apple Games',
    description:
      'The release adds a dedicated Games hub, an in-game overlay, and faster Mac App Store installs for games.',
  },
] as const;

const compatibleModels = [
  'MacBook Air with Apple silicon introduced in 2020 or later',
  'MacBook Pro with Apple silicon introduced in 2020 or later',
  'MacBook Pro (13-inch, 2020, Four Thunderbolt 3 ports) and MacBook Pro (16-inch, 2019)',
  'Mac mini introduced in 2020 or later',
  'iMac introduced in 2020 or later',
  'Mac Studio introduced in 2022 or later, and Mac Pro introduced in 2019 or later',
] as const;

const installSteps = [
  'Check Apple compatibility before you commit the upgrade.',
  'Make a Time Machine or external backup first.',
  'Use Software Update on a supported Mac to download and install Tahoe 26.',
] as const;

export default function AppStoreApp(_props: { appId: AppId }) {
  return (
    <div className="appstore-app">
      <section className="appstore-hero">
        <div className="appstore-hero-copy">
          <span className="appstore-badge">Featured Upgrade</span>
          <h1>macOS Tahoe 26</h1>
          <p className="appstore-hero-lead">
            Apple&apos;s next desktop release brings Liquid Glass styling, Phone on Mac, a much
            deeper Spotlight, and a new Apple Games experience.
          </p>

          <div className="appstore-button-row">
            <button
              className="appstore-primary-button"
              onClick={() => void openExternal(upgradeGuideUrl)}
              type="button"
            >
              Get macOS Tahoe
            </button>
            <button
              className="appstore-secondary-button"
              onClick={() => void openExternal(featuresPdfUrl)}
              type="button"
            >
              Browse All Features
            </button>
          </div>

          <p className="appstore-hero-note">
            Apple&apos;s official upgrade guide routes Tahoe installs through Software Update rather
            than a standalone Mac App Store download.
          </p>
        </div>

        <aside className="appstore-product-card">
          <div className="appstore-product-header">
            <img
              alt="App Store"
              className="appstore-product-icon"
              src="/app-icons/appstore/1024.png"
            />
            <div>
              <p className="appstore-eyebrow">Operating System</p>
              <h2>macOS Tahoe</h2>
              <p className="appstore-subtle">From Apple</p>
            </div>
          </div>

          <dl className="appstore-meta-grid">
            {releaseMeta.map(([label, value]) => (
              <div className="appstore-meta-item" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="appstore-terminal-tip">
            <p>Installer check</p>
            <code>softwareupdate --list-full-installers</code>
          </div>
        </aside>
      </section>

      <section className="appstore-info-grid">
        <article className="appstore-panel">
          <div className="appstore-panel-header">
            <span>What&apos;s New</span>
            <h3>Tahoe highlights</h3>
          </div>

          <div className="appstore-feature-grid">
            {featureHighlights.map((feature) => (
              <div className="appstore-feature-card" key={feature.title}>
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="appstore-panel">
          <div className="appstore-panel-header">
            <span>Compatibility</span>
            <h3>Supported Macs</h3>
          </div>

          <ul className="appstore-list">
            {compatibleModels.map((model) => (
              <li key={model}>{model}</li>
            ))}
          </ul>
        </article>

        <article className="appstore-panel">
          <div className="appstore-panel-header">
            <span>Install Path</span>
            <h3>Recommended flow</h3>
          </div>

          <ol className="appstore-steps">
            {installSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="appstore-panel appstore-panel-accent">
          <div className="appstore-panel-header">
            <span>Operator Note</span>
            <h3>App Store context</h3>
          </div>
          <p>
            Tahoe still fits naturally inside this App Store surface as a featured release, but the
            actual installer path Apple documents is Software Update on compatible hardware.
          </p>
        </article>
      </section>
    </div>
  );
}
