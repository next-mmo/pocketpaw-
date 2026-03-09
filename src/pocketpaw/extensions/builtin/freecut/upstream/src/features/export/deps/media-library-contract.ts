/**
 * Adapter exports for media-library dependencies.
 * Export modules should import media resolution helpers from here.
 *
 * Only re-exports symbols that do NOT trigger the media-library
 * store/service initialization chain at module evaluation time.
 */

export {
  resolveMediaUrl,
  resolveMediaUrls,
  resolveProxyUrl,
  cleanupBlobUrls,
} from "@/features/media-library/utils/media-resolver";

// Lazy accessor — avoids pulling in the service (and its store
// side-effects) at module-evaluation time.
export const importMediaLibraryService = () =>
  import("@/features/media-library/services/media-library-service").then(
    (m) => m.mediaLibraryService,
  );

// ── Lazy store access for getMediaAudioCodecById ─────────────
//
// We cannot statically import useMediaLibraryStore or mediaLibraryService
// because that creates a circular dependency chain that causes a TDZ error.
//
// Instead, we schedule a microtask that resolves after the initial module
// graph has settled, and cache the store reference for sync access later.

type MediaLibraryStoreModule =
  typeof import("@/features/media-library/stores/media-library-store");

let _storeRef: MediaLibraryStoreModule | undefined;

// Schedule the lazy load — runs after current module evaluation completes
Promise.resolve().then(async () => {
  _storeRef = await import(
    "@/features/media-library/stores/media-library-store"
  );
});

export function getMediaAudioCodecById(
  mediaId: string | undefined,
): string | undefined {
  if (!mediaId) return undefined;

  if (!_storeRef) {
    // Store hasn't loaded yet — this should never happen in practice
    // because audio processing only runs after the full app has initialised.
    return undefined;
  }

  const media = _storeRef.useMediaLibraryStore.getState().mediaById[mediaId];
  if (!media) return undefined;

  if (media.mimeType.startsWith("video/")) {
    return media.audioCodec;
  }
  if (media.mimeType.startsWith("audio/")) {
    return media.codec;
  }
  return undefined;
}
