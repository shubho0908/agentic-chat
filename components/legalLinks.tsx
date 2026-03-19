import Link from "next/link";

interface LegalLinksProps {
  className?: string;
}

export function LegalLinks({ className = "" }: LegalLinksProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Link
        href="/terms"
        className="font-medium text-foreground/65 underline decoration-foreground/15 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/40"
      >
        Terms
      </Link>
      <span aria-hidden="true" className="text-muted-foreground/30">
        •
      </span>
      <Link
        href="/privacy"
        className="font-medium text-foreground/65 underline decoration-foreground/15 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/40"
      >
        Privacy
      </Link>
    </span>
  );
}
