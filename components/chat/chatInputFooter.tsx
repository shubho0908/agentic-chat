import Image from "next/image";
import Link from "next/link";

interface ChatInputFooterProps {
  centered?: boolean;
}

export function ChatInputFooter({ centered = false }: ChatInputFooterProps) {
  return (
    <div className={`${centered ? 'mt-4' : 'mt-2.5'} flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground/60`}>
      <span className="flex items-center gap-1 tracking-wide">
        Built by{' '}
        <Link
          href="https://shubhojeet.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-medium text-foreground/80 transition-colors hover:text-foreground"
        >
          <Image
            src="/me.jpg"
            alt="Shubhojeet"
            width={12}
            height={12}
            className="rounded-full grayscale transition-all duration-300 hover:grayscale-0"
          />
          Shubhojeet
        </Link>
      </span>
      <span className="flex items-center gap-2 tracking-wide">
        <Link href="/terms" className="font-medium text-foreground/65 transition-colors hover:text-foreground">
          Terms
        </Link>
        <span aria-hidden="true" className="text-muted-foreground/30">
          •
        </span>
        <Link href="/privacy" className="font-medium text-foreground/65 transition-colors hover:text-foreground">
          Privacy
        </Link>
      </span>
    </div>
  );
}
