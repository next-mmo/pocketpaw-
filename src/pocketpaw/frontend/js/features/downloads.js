/**
 * PocketPaw - Download Center Feature Module
 *
 * Created: 2026-03-14
 * Global download manager — tracks all downloads across agent, extensions,
 * browser, and user actions. Like a browser's download center but for the
 * entire PocketPaw platform.
 *
 * State:
 *   showDownloads, downloads, downloadsLoading, downloadsFilter,
 *   downloadStats, downloadSearch, downloadsSortBy
 *
 * Methods:
 *   openDownloads, closeDownloads, loadDownloads, loadDownloadStats,
 *   deleteDownload, clearDownloads, getFilteredDownloads,
 *   formatDownloadSize, getDownloadIcon, getDownloadStatusColor,
 *   openDownloadFile, retryDownload, getTimeAgo
 */

window.PocketPaw = window.PocketPaw || {};

window.PocketPaw.Downloads = {
  name: "Downloads",

  getState() {
    return {
      showDownloads: false,
      downloads: [],
      downloadsLoading: false,
      downloadsFilter: "all", // all | completed | downloading | failed
      downloadStats: { total: 0, by_status: {}, total_size: 0, active: 0 },
      downloadSearch: "",
      downloadsSortBy: "newest", // newest | oldest | largest | smallest | name
      downloadDetailId: null,
    };
  },

  getMethods() {
    return {
      /**
       * Open the download center panel.
       */
      openDownloads() {
        this.showDownloads = true;
        this.loadDownloads();
        this.loadDownloadStats();
      },

      /**
       * Close the download center panel.
       */
      closeDownloads() {
        this.showDownloads = false;
        this.downloadDetailId = null;
      },

      /**
       * Fetch all downloads from the API.
       */
      async loadDownloads() {
        this.downloadsLoading = true;
        try {
          const params = new URLSearchParams({ limit: "500" });
          if (
            this.downloadsFilter &&
            this.downloadsFilter !== "all"
          ) {
            params.set("status", this.downloadsFilter);
          }
          const resp = await fetch(
            `/api/v1/downloads?${params.toString()}`
          );
          if (resp.ok) {
            const data = await resp.json();
            this.downloads = data.downloads || [];
          }
        } catch (e) {
          console.error("Failed to load downloads:", e);
        } finally {
          this.downloadsLoading = false;
        }
      },

      /**
       * Fetch download stats for badges.
       */
      async loadDownloadStats() {
        try {
          const resp = await fetch("/api/v1/downloads/stats");
          if (resp.ok) {
            this.downloadStats = await resp.json();
          }
        } catch (e) { /* silent */ }
      },

      /**
       * Delete a download record.
       */
      async deleteDownload(id) {
        try {
          const resp = await fetch(`/api/v1/downloads/${id}`, {
            method: "DELETE",
          });
          if (resp.ok) {
            this.downloads = this.downloads.filter(
              (d) => d.id !== id
            );
            if (this.downloadDetailId === id) {
              this.downloadDetailId = null;
            }
            this.loadDownloadStats();
            this.showToast("Download removed", "success");
          }
        } catch (e) {
          this.showToast("Failed to remove download", "error");
        }
      },

      /**
       * Clear download history.
       */
      async clearDownloads(status) {
        const body = status ? { status } : {};
        try {
          const resp = await fetch("/api/v1/downloads/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (resp.ok) {
            this.loadDownloads();
            this.loadDownloadStats();
            this.showToast(
              status
                ? `Cleared ${status} downloads`
                : "Download history cleared",
              "success"
            );
          }
        } catch (e) {
          this.showToast("Failed to clear downloads", "error");
        }
      },

      /**
       * Get filtered + searched + sorted downloads.
       */
      getFilteredDownloads() {
        let list = [...this.downloads];

        // Search
        if (this.downloadSearch.trim()) {
          const q = this.downloadSearch.toLowerCase();
          list = list.filter(
            (d) =>
              (d.filename || "").toLowerCase().includes(q) ||
              (d.url || "").toLowerCase().includes(q) ||
              (d.source_label || "").toLowerCase().includes(q) ||
              (d.tags || []).some((t) =>
                t.toLowerCase().includes(q)
              )
          );
        }

        // Sort
        switch (this.downloadsSortBy) {
          case "oldest":
            list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
            break;
          case "largest":
            list.sort((a, b) => (b.size || 0) - (a.size || 0));
            break;
          case "smallest":
            list.sort((a, b) => (a.size || 0) - (b.size || 0));
            break;
          case "name":
            list.sort((a, b) =>
              (a.filename || "").localeCompare(b.filename || "")
            );
            break;
          default: // newest
            list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }

        return list;
      },

      /**
       * Format byte size into human-readable string.
       */
      formatDownloadSize(bytes) {
        if (!bytes || bytes === 0) return "—";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
          size /= 1024;
          i++;
        }
        return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
      },

      /**
       * Get icon name for a download based on MIME type.
       */
      getDownloadIcon(dl) {
        const mime = dl.mime_type || "";
        const ext = (dl.filename || "").split(".").pop().toLowerCase();

        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "music";
        if (mime === "application/pdf") return "file-text";
        if (
          mime.includes("zip") ||
          mime.includes("tar") ||
          mime.includes("gzip") ||
          mime.includes("rar") ||
          mime.includes("7z")
        )
          return "archive";
        if (
          mime.includes("python") ||
          mime.includes("javascript") ||
          mime.includes("typescript") ||
          mime.includes("json")
        )
          return "file-code";
        if (mime.startsWith("text/")) return "file-text";
        if (
          ["exe", "msi", "dmg", "deb", "rpm", "appimage"].includes(
            ext
          )
        )
          return "package";

        return "file";
      },

      /**
       * Get status color classes.
       */
      getDownloadStatusColor(status) {
        switch (status) {
          case "completed":
            return "text-green-400";
          case "downloading":
            return "text-blue-400";
          case "pending":
            return "text-amber-400";
          case "failed":
            return "text-red-400";
          case "cancelled":
            return "text-white/30";
          default:
            return "text-white/50";
        }
      },

      /**
       * Get status icon.
       */
      getDownloadStatusIcon(status) {
        switch (status) {
          case "completed":
            return "check-circle-2";
          case "downloading":
            return "loader-2";
          case "pending":
            return "clock";
          case "failed":
            return "x-circle";
          case "cancelled":
            return "ban";
          default:
            return "circle";
        }
      },

      /**
       * Get source icon.
       */
      getDownloadSourceIcon(source) {
        switch (source) {
          case "agent":
            return "bot";
          case "extension":
            return "puzzle";
          case "browser":
            return "globe";
          case "user":
            return "user";
          default:
            return "download";
        }
      },

      /**
       * Open file location (if file_path exists).
       */
      openDownloadFile(dl) {
        if (dl.file_path) {
          // Use agent's open_in_explorer tool via WebSocket
          socket.send("run_tool", {
            tool: "open_in_explorer",
            args: { path: dl.file_path },
          });
        } else if (dl.url) {
          window.open(dl.url, "_blank");
        }
      },

      /**
       * Get relative time string from a timestamp.
       */
      getTimeAgo(timestamp) {
        if (!timestamp) return "";
        const now = Date.now() / 1000;
        const diff = now - timestamp;

        if (diff < 60) return "Just now";
        if (diff < 3600)
          return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400)
          return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800)
          return `${Math.floor(diff / 86400)}d ago`;

        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      },

      /**
       * View screenshot of a download.
       */
      viewDownloadScreenshot(dl) {
        if (dl.screenshot) {
          this.screenshotSrc = dl.screenshot;
          this.showScreenshot = true;
        }
      },

      /**
       * Toggle download detail panel.
       */
      toggleDownloadDetail(id) {
        this.downloadDetailId =
          this.downloadDetailId === id ? null : id;
      },

      /**
       * Get download by ID.
       */
      getDownloadDetail() {
        return this.downloads.find(
          (d) => d.id === this.downloadDetailId
        );
      },
    };
  },
};

window.PocketPaw.Loader.register(
  "Downloads",
  window.PocketPaw.Downloads
);
