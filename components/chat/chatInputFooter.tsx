import Image from "next/image";
import Link from "next/link";

interface ChatInputFooterProps {
  centered?: boolean;
}

export function ChatInputFooter({ centered = false }: ChatInputFooterProps) {
  return (
    <div className={`${centered ? 'mt-4' : 'mt-2'} flex items-center justify-center text-${centered ? 'sm' : 'xs'} text-muted-foreground`}>
      <span className="flex items-center gap-1">
        Built by{' '}
        <Link
          href="https://shubhojeet.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-black dark:text-white font-semibold hover:opacity-80 transition-opacity underline flex items-center gap-1.5"
        >
          <Image 
            src="/me.jpg" 
            alt="Shubhojeet" 
            width={16} 
            height={16} 
            className="rounded-full ml-1"
          />
          Shubhojeet
        </Link>
      </span>
    </div>
  );
}
