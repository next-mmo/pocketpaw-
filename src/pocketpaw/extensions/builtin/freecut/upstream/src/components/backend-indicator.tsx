/**
 * Backend Status Indicator
 *
 * Shows whether the app is connected to Python backend (GPU/CPU).
 */
import { useEffect, useState } from 'react';

interface BackendStatus {
  available: boolean;
  gpu: string | null;
}

export function BackendIndicator() {
  const [status, setStatus] = useState<BackendStatus>({
    available: false,
    gpu: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch('http://127.0.0.1:7890/info', {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json();
          setStatus({
            available: true,
            gpu: data.ffmpeg_gpu ?? null,
          });
        } else {
          setStatus({ available: false, gpu: null });
        }
      } catch {
        setStatus({ available: false, gpu: null });
      } finally {
        setLoading(false);
      }
    }

    checkBackend();

    // Refresh every 30 seconds
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return null;
  }

  if (!status.available) {
    return (
      <div className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded-full border border-yellow-700 bg-yellow-900/80 px-3 py-1.5 text-xs font-medium text-yellow-200">
        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
        <span>Backend Required</span>
      </div>
    );
  }

  const isGpu = status.gpu !== null;
  const label = isGpu ? `GPU (${status.gpu?.toUpperCase()})` : 'CPU';

  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded-full border border-green-700 bg-green-900/80 px-3 py-1.5 text-xs font-medium text-green-200">
      <span
        className={`h-2 w-2 rounded-full ${isGpu ? 'bg-cyan-400' : 'bg-green-400'} animate-pulse`}
      />
      <span>Backend: {label}</span>
    </div>
  );
}
