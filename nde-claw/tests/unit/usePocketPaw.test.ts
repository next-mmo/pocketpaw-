import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/http/client';
import { fetchSystemStatus, normalizeSystemStatus } from '@/hooks/usePocketPaw';

vi.mock('@/lib/http/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('system status compatibility', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('normalizes the legacy metrics/system payload', () => {
    const result = normalizeSystemStatus({
      available: true,
      os: 'Windows',
      arch: 'AMD64',
      cpu: {
        percent: 0,
        cores: 36,
        freq_mhz: 2301,
      },
      memory: {
        used_bytes: 29_646_143_488,
        total_bytes: 68_541_308_928,
        percent: 43.3,
      },
      disk: {
        used_bytes: 908_539_695_104,
        total_bytes: 2_047_518_699_520,
        percent: 44.4,
      },
      uptime_seconds: 445_096,
      battery: null,
      timestamp: '2026-03-21T16:26:26.493590+00:00',
    });

    expect(result).toEqual({
      available: true,
      limited: false,
      label: 'Windows (AMD64)',
      platform: 'Windows',
      machine: 'AMD64',
      error: undefined,
      uptime: '5d 3h 38m',
      cpu: {
        percent: 0,
        cores: 36,
      },
      memory: {
        percent: 43.3,
        used_gb: 27.6,
        total_gb: 63.8,
      },
      disk: {
        percent: 44.4,
        used_gb: 846.1,
        total_gb: 1906.9,
      },
      battery: null,
    });
  });

  it('falls back to metrics/system when health/system is unavailable', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({
        data: {
          available: true,
          os: 'Windows',
          arch: 'AMD64',
          cpu: {
            percent: 0,
            cores: 36,
            freq_mhz: 2301,
          },
          memory: {
            used_bytes: 29_646_143_488,
            total_bytes: 68_541_308_928,
            percent: 43.3,
          },
          disk: {
            used_bytes: 908_539_695_104,
            total_bytes: 2_047_518_699_520,
            percent: 44.4,
          },
          uptime_seconds: 445_096,
          battery: null,
          timestamp: '2026-03-21T16:26:26.493590+00:00',
        },
      });

    const result = await fetchSystemStatus();

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/v1/health/system');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/v1/metrics/system');
    expect(result.memory.percent).toBe(43.3);
    expect(result.disk.percent).toBe(44.4);
    expect(result.platform).toBe('Windows');
  });
});
