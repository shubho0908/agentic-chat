import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";

import { REMARK_PLUGINS } from "@/components/ai-elements/response/constants";
import { shouldRenderMarkdownContent } from "@/lib/markdown/rendering";

function renderMarkdown(content: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: REMARK_PLUGINS, rehypePlugins: [rehypeKatex] },
      content,
    ),
  );
}

test("two currency amounts in one paragraph are not swallowed into math", () => {
  const html = renderMarkdown(
    "Dhurandhar ne $143 million ke aas-paas **gross** kiya, lekin box-office $90 million tak bhi ja sakta hai.",
  );
  assert.equal(html.includes("math-inline"), false, html);
  assert.ok(html.includes("$143 million"), html);
  assert.ok(html.includes("$90 million"), html);
  assert.ok(html.includes("<strong>gross</strong>"), html);
});

test("currency ranges and mixed amounts stay plain text", () => {
  const html = renderMarkdown("Price is $50-$100 and roughly $1,200.50 total.");
  assert.equal(html.includes("math"), false, html);
  assert.ok(html.includes("$50-$100"), html);
  assert.ok(html.includes("$1,200.50"), html);
});

test("double-dollar math still renders through KaTeX", () => {
  const html = renderMarkdown("Euler: $$e^{i\\pi} + 1 = 0$$");
  assert.ok(html.includes("math"), html);
  assert.ok(html.includes("katex"), html);
});

test("currency and real math coexist in one message", () => {
  const html = renderMarkdown(
    "Revenue hit $143 million this year. The growth model is $$f(x) = x^2$$ over time.",
  );
  assert.ok(html.includes("$143 million"), html);
  assert.ok(html.includes("katex"), html);
});

test("markdown gate no longer treats single dollars as math syntax", () => {
  assert.equal(shouldRenderMarkdownContent("Costs $50 and $100 total"), false);
  assert.equal(shouldRenderMarkdownContent("Math: $$x^2$$"), true);
  assert.equal(shouldRenderMarkdownContent("A **bold** claim"), true);
});
