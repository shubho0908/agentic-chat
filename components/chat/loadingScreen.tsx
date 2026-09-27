"use client";

import "./loading-screen.css";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 7;
const MAX_ROWS = 6;
const PRUNE_OVERFLOW = 90;

interface Pattern {
	me: boolean;
	bars: number[];
}

const PATTERNS: Pattern[] = [
	{ me: true, bars: [106] },
	{ me: false, bars: [152, 88] },
	{ me: true, bars: [88, 64] },
	{ me: false, bars: [128, 76] },
	{ me: true, bars: [128] },
	{ me: false, bars: [106] },
];

interface Row {
	id: number;
	pattern: Pattern;
	animate: boolean;
}

/* Enough rows that the feed is already full on first paint — the oldest ones sit
   above the viewport and fade out under the mask, so the conversation reads as
   already in progress rather than starting from empty. */
const SEED_ROWS = 8;

function buildRows(count: number, animate: boolean): Row[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i,
		pattern: PATTERNS[i % PATTERNS.length],
		animate,
	}));
}

function Bubble({ variant, animate, bars }: {
	variant: "me" | "them";
	animate: boolean;
	bars: number[];
}) {
	return (
		<div
			className={
				variant === "me"
					? `ls-bubble ls-me ${animate ? "pop-me" : ""}`
					: `ls-bubble ls-them ${animate ? "pop-them" : ""}`
			}
		>
			{bars.map((width, i) => (
				<span key={i} className="ls-bar" style={{ width }} />
			))}
		</div>
	);
}

export function LoadingScreen({ exiting = false }: { exiting?: boolean }) {
	const [rows, setRows] = useState<Row[]>(() => buildRows(SEED_ROWS, false));
	const stackRef = useRef<HTMLDivElement>(null);
	const seqRef = useRef(SEED_ROWS);
	const timerRef = useRef<number | null>(null);

	const slideUp = useCallback((delta: number) => {
		const stack = stackRef.current;
		if (!stack) return;
		stack.style.transition = "none";
		stack.style.transform = `translateY(${delta}px)`;
		void stack.offsetHeight;
		stack.style.transition = "";
		stack.style.transform = "translateY(0)";
	}, []);

	const addBubble = useCallback(
		(animate: boolean) => {
			const pattern = PATTERNS[seqRef.current % PATTERNS.length];
			const id = seqRef.current;
			seqRef.current += 1;
			setRows((prev) => [...prev, { id, pattern, animate }]);
		},
		[],
	);

	useEffect(() => {
		const reduced =
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
			false;

		if (reduced) return;

		const loop = () => {
			addBubble(true);
			const lastMe = PATTERNS[(seqRef.current - 1) % PATTERNS.length].me;
			timerRef.current = window.setTimeout(loop, lastMe ? 1250 : 850);
		};
		timerRef.current = window.setTimeout(loop, 650);

		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, [addBubble]);

	useLayoutEffect(() => {
		const stack = stackRef.current;
		if (!stack || rows.length === 0) return;

		const firstRow = stack.firstElementChild as HTMLElement | null;
		if (!firstRow) return;
		const overflow =
			stack.getBoundingClientRect().top - firstRow.getBoundingClientRect().top;

		const last = rows[rows.length - 1];
		if (last.animate && overflow > 0) {
			const rowEl = stack.lastElementChild as HTMLElement | null;
			slideUp((rowEl?.offsetHeight ?? 0) + GAP);
		}
		if (stack.children.length > MAX_ROWS && overflow > PRUNE_OVERFLOW) {
			setRows((prev) => prev.slice(1));
		}
	}, [rows, slideUp]);

	useEffect(() => {
		if (!exiting) return;
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
	}, [exiting]);

	return (
		<div
			className={`loading-screen${exiting ? " ls-exiting" : ""}`}
			role="status"
			aria-live="polite"
			aria-label="Preparing your chat"
		>
			<div className="loading-caption" aria-hidden="true">
				Preparing your chat
			</div>

			<div className="loading-feed" aria-hidden="true">
				<div className="loading-feed-stack" ref={stackRef}>
					{rows.map((row) => (
						<Bubble
							key={row.id}
							variant={row.pattern.me ? "me" : "them"}
							animate={row.animate}
							bars={row.pattern.bars}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
