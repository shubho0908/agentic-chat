import { generateAndStorePdf } from "./lib/pdf/service";

const heavy = {
  title: "Heavy Benchmark Document",
  sections: Array.from({ length: 6 }, (_, i) => ({
    heading: `Section ${i + 1}`,
    blocks: [
      { type: "paragraph", text: "Lorem ipsum dolor sit amet, **bold** and *italic* with `code` and हिंदी मिश्रित text. ".repeat(5) },
      { type: "table", columns: ["A", "B", "C", "D"], rows: Array.from({ length: 8 }, (_, r) => [`r${r}c1`, `r${r}c2`, `r${r}c3`, `r${r}c4`]) },
      { type: "code", code: "const x = computeSomething(a, b, c);\n".repeat(10), language: "ts" },
      { type: "list", style: "bullet", items: Array.from({ length: 6 }, (_, k) => `Item ${k + 1} with some descriptive text`) },
      { type: "callout", variant: "info", title: "Note", text: "Callout body text." },
    ],
  })),
};

const store = async (buffer: Buffer, name: string) => ({ url: `https://x/${name}`, name, size: buffer.length });

async function main() {
  const times: number[] = [];
  let peak = 0;
  let size = 0;
  for (let i = 0; i < 4; i++) {
    global.gc?.();
    const t0 = performance.now();
    const r = await generateAndStorePdf(heavy, { store });
    const dt = performance.now() - t0;
    if (!r.ok) throw new Error(r.error);
    size = r.pdf.size;
    times.push(dt);
    peak = Math.max(peak, process.memoryUsage().rss);
  }
  times.sort((a, b) => a - b);
  console.log(`pdf size: ${(size / 1024 / 1024).toFixed(2)} MB, pages: heavy doc`);
  console.log(`render+store p50: ${times[2].toFixed(0)}ms  p95: ${times[3].toFixed(0)}ms  first(cold): included`);
  console.log(`peak RSS (4 sequential renders): ${(peak / 1024 / 1024).toFixed(0)} MB`);

  // concurrency burst: 6 at once, semaphore should cap active at 2
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: 6 }, () => generateAndStorePdf(heavy, { store })));
  const ok = results.filter((r) => r.ok).length;
  console.log(`concurrent 6: ${ok}/6 ok in ${(performance.now() - t0).toFixed(0)}ms, peak RSS ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
