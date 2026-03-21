import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionCenter } from '@/components/topbar/ActionCenter';
import { useSystemStatus } from '@/hooks/usePocketPaw';
import { createDefaultPreferencesState, usePreferencesStore } from '@/stores/preferencesStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSystemStore } from '@/stores/systemStore';

vi.mock('@/hooks/usePocketPaw', () => ({
  useSystemStatus: vi.fn(),
}));

function resetStores() {
  usePreferencesStore.setState(createDefaultPreferencesState());
  useConnectionStore.setState({
    backendStatus: 'online',
    version: {
      version: '0.4.10',
      python: '3.12.0',
      agent_backend: 'claude_agent_sdk',
    },
    health: null,
    lastChecked: null,
    error: null,
  });
  useSystemStore.setState({
    bootVisible: false,
    needsUpdate: false,
    isLocked: false,
    platform: 'darwin',
    version: '14.4.0',
  });
}

describe('ActionCenter', () => {
  beforeEach(() => {
    resetStores();
    vi.mocked(useSystemStatus).mockReturnValue({
      data: {
        available: true,
        limited: false,
        label: 'dev-host',
        cpu: { percent: 12.4, cores: 8 },
        memory: { percent: 38.6, used_gb: 12.3, total_gb: 32 },
        disk: { percent: 44.1, used_gb: 221, total_gb: 512 },
        battery: null,
      },
    } as ReturnType<typeof useSystemStatus>);
  });

  it('shows CPU, RAM, and Disk usage in the top bar button', () => {
    render(<ActionCenter />);

    const button = screen.getByRole('button', { name: 'Open Control Center' });

    expect(button).toHaveTextContent('Control Center');
    expect(button).toHaveTextContent('CPU');
    expect(button).toHaveTextContent('12%');
    expect(button).toHaveTextContent('RAM');
    expect(button).toHaveTextContent('39%');
    expect(button).toHaveTextContent('Disk');
    expect(button).toHaveTextContent('44%');
  });
});
