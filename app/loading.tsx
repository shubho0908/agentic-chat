import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader className="size-5 animate-spin" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
