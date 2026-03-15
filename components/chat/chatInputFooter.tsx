import Image from "next/image";
import Link from "next/link";

interface ChatInputFooterProps {
  centered?: boolean;
}

export function ChatInputFooter({ centered = false }: ChatInputFooterProps) {
  return (
    <div className={`${centered ? 'mt-4' : 'mt-2.5'} flex items-center justify-center text-[10px] text-muted-foreground/60`}>
      <span className="flex items-center gap-1 tracking-wide">
        Built by{' '}
        <Link
          href="https://shubhojeet.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-foreground/80 font-medium hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Image 
            src="/me.jpg" 
            alt="Shubhojeet" 
            width={12} 
            height={12} 
            className="rounded-full grayscale hover:grayscale-0 transition-all duration-300"
          />
          Shubhojeet
        </Link>
      </span>
    </div>
  );
}
