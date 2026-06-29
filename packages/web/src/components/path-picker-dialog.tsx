import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RemoteBrowser } from "@/components/remote-browser";

export function PathPickerDialog({
  open,
  onOpenChange,
  remoteId,
  remoteLabel,
  initialPath,
  onSelect,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remoteId: string;
  remoteLabel: string;
  initialPath: string;
  onSelect: (path: string) => void;
  /** Hide folder create/rename/delete actions (read-only source remotes). */
  readOnly?: boolean;
}) {
  const [path, setPath] = useState(initialPath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a folder</DialogTitle>
          <DialogDescription>
            Browsing <span className="font-medium">{remoteLabel}</span>. Navigate
            to the folder you want, then select it.
          </DialogDescription>
        </DialogHeader>

        <RemoteBrowser
          key={remoteId}
          remoteId={remoteId}
          initialPath={initialPath}
          onPathChange={setPath}
          readOnly={readOnly}
        />

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Selected: </span>
          <span className="font-mono text-foreground">{path || "/ (root)"}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              onSelect(path);
              onOpenChange(false);
            }}
          >
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
