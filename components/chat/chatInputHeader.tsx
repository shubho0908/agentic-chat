interface ChatInputHeaderProps {
  firstName?: string | null;
}

export function ChatInputHeader({ firstName }: ChatInputHeaderProps) {
  const greeting = firstName ? `Hi, ${firstName}.` : "Hi there.";

  return (
    <div className="text-left space-y-4 cursor-default mb-8">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-[family-name:var(--font-newsreader)] font-normal tracking-tight text-foreground leading-[1.1]">
        {greeting} <br />
        <span className="italic text-muted-foreground">ready when you are.</span>
      </h1>
    </div>
  );
}
