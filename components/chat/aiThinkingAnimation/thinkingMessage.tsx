// Dots loader adapted from Beautiful UI "Loading State" (MIT License).

// Chevron wavefront delays for a 3x3 grid, 650ms cycle. Two fronts are
// always in flight because the cycle is shorter than the full sweep.
const DOT_DELAYS_MS = [90, 180, 270, 0, 90, 180, 90, 180, 270];
const WAVE_MS = 650;

interface ThinkingMessageProps {
  message: string;
}

export function ThinkingMessage({ message }: ThinkingMessageProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="flex w-fit items-center gap-2.5">
      <span
        aria-hidden
        className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]"
      >
        {DOT_DELAYS_MS.map((delay, index) => (
          <span
            key={index}
            className="size-[4px] rounded-full bg-primary"
            style={{
              opacity: 0.15,
              animation: `pixel-on ${WAVE_MS}ms ease-in-out ${delay}ms infinite`,
            }}
          />
        ))}
      </span>
      <span
        className="bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)] bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent dark:bg-[linear-gradient(110deg,#525252,35%,#fff,50%,#525252,75%,#525252)]"
        style={{ animation: "shimmer-text 1.4s linear infinite" }}
      >
        {message}
      </span>
    </div>
  );
}
