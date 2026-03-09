import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FreeCutLogo } from "@/components/brand/freecut-logo";
import { Separator } from "@/components/ui/separator";
import { isElectronApp } from "@/types/electron-updater";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const isElectron = isElectronApp();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    if (isElectron && open) {
      window.electronUpdater!.getVersion().then(setAppVersion);
    }
  }, [isElectron, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">About FreeCut</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center space-y-4 py-4">
          <FreeCutLogo size="lg" />

          <div>
            <h2 className="text-xl font-bold">FreeCut</h2>
            {isElectron && appVersion && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Desktop v{appVersion}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Professional video editing, zero installation
            </p>
          </div>

          <Separator />

          <div className="text-sm text-muted-foreground space-y-2">
            <p>Open source video editor built with React, Vite, and FFmpeg.</p>
            <p>
              Fork of{" "}
              <a
                href="https://github.com/walterlow/freecut"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                walterlow/freecut
              </a>{" "}
              with GPU-accelerated backend.
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <a
              href="https://github.com/peopleinfo/freecut"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <span>·</span>
            <span>MIT License</span>
            <span>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
