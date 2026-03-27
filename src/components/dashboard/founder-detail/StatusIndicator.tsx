import { useState } from "react";
import { Pencil } from "lucide-react";

interface StatusIndicatorProps {
  isOwner?: boolean;
  defaultStatus?: string;
}

export function StatusIndicator({ isOwner = false, defaultStatus = "Open to partnerships" }: StatusIndicatorProps) {
  const [status, setStatus] = useState(defaultStatus);
  const [editing, setEditing] = useState(false);

  if (isOwner && editing) {
    return (
      <input
        autoFocus
        className="rounded-md bg-success/10 border border-success/20 px-3 py-1 text-xs font-medium text-success outline-none focus:ring-1 focus:ring-success/40 w-full max-w-[220px] whitespace-nowrap overflow-hidden text-ellipsis"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
        maxLength={40}
      />
    );
  }

  return (
    <button
      onClick={() => isOwner && setEditing(true)}
      className={`inline-flex items-center gap-1.5 rounded-md bg-success/10 border border-success/20 px-3 py-1 text-xs font-medium text-success whitespace-nowrap transition-all ${isOwner ? "cursor-pointer hover:bg-success/15" : "cursor-default"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse shrink-0" />
      <span className="leading-none">{status}</span>
      {isOwner && <Pencil className="h-2.5 w-2.5 opacity-50" />}
    </button>
  );
}
