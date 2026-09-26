import test from "node:test";
import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HumanInTheLoopApprovalCard } from "@/components/chat/humanInTheLoopApprovalCard";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";

const ASK_USER = HumanInTheLoopRequestKind.ASK_USER;

function render(props: Partial<ComponentProps<typeof HumanInTheLoopApprovalCard>>): string {
  return renderToStaticMarkup(
    createElement(HumanInTheLoopApprovalCard, { pending: true, isLoading: false, onDecision: () => {}, ...props }),
  );
}


test("approval card lists each action with its args and both decisions", () => {
  const html = render({
    requestKind: HumanInTheLoopRequestKind.APPROVAL,
    toolCalls: [
      { id: "call-1", name: "GMAIL_SEND_EMAIL", args: { to: "ops@example.com", subject: "Restock" } },
      { id: "call-2", name: "SLACK_POST_MESSAGE", args: { channel: "#ops" } },
    ],
  });

  assert.match(html, /Approval required/);
  assert.match(html, /All 2 actions run as soon as you approve/);
  assert.match(html, /Gmail · Send email/);
  assert.match(html, /Slack · Post message/);
  assert.match(html, /Subject/);
  assert.match(html, /ops@example\.com/);
  assert.match(html, /Deny/);
  assert.match(html, /Approve all/);
  assert.match(html, /2 actions/);
});

test("a resolved approval card drops its actions but keeps the record", () => {
  const html = render({
    requestKind: HumanInTheLoopRequestKind.APPROVAL,
    pending: false,
    toolCalls: [{ id: "call-1", name: "GMAIL_SEND_EMAIL", args: { to: "ops@example.com" } }],
  });

  assert.doesNotMatch(html, />Approve</);
  assert.doesNotMatch(html, /Deny/);
  assert.match(html, /This action runs as soon as you approve/);
  assert.match(html, /Gmail · Send email/);
});

test("decision card badges the recommended option and strips its letter reference", () => {
  const html = render({
    requestKind: ASK_USER,
    title: "Flavor launch",
    question: "How many flavors should we launch?",
    context: "Shelf space is limited to three slots.",
    recommendation: "Option B: Five maximizes case volume.",
    options: [
      { label: "Three (core line)", description: "Keeps the shelf tight" },
      { label: "Five (full case)", description: "Best margin per case" },
    ],
  });

  assert.match(html, /Decision needed/);
  assert.match(html, /How many flavors should we launch\?/);
  assert.match(html, /Shelf space is limited to three slots\./);
  assert.match(html, /Suggested/);
  assert.match(html, /Five maximizes case volume\./);
  assert.doesNotMatch(html, /Option B:/);
  assert.match(html, /Something else…/);
  assert.match(html, /Submit answer/);
});

test("option links stay non-interactive while context links remain interactive", () => {
  const html = render({
    requestKind: ASK_USER,
    question: "Choose an option",
    context: "Read the [context](https://context.example/notes)",
    options: [
      {
        label: "[Approve plan](https://option.example/plan)",
        description: "See [details](https://option.example/details) and https://option.example/raw for more",
      },
    ],
  });

  assert.match(html, /href="https:\/\/context\.example\/notes"/);
  assert.match(html, /Approve plan/);
  assert.match(html, /See details and https:\/\/option\.example\/raw for more/);
  assert.doesNotMatch(html, /href="https:\/\/option\.example\/plan"/);
  assert.doesNotMatch(html, /href="https:\/\/option\.example\/details"/);
  assert.doesNotMatch(html, /href="https:\/\/option\.example\/raw"/);
});

test("a suggestion with no rationale renders no note", () => {
  const html = render({
    requestKind: ASK_USER,
    question: "Pick one",
    recommendation: "Option A",
    options: [{ label: "Keep it", description: "No change" }],
  });

  assert.match(html, /Keep it/);
  assert.doesNotMatch(html, /text-muted-foreground break-words/);
});

test("free-text question asks for the answer and blocks Send until it is typed", () => {
  const html = render({ requestKind: ASK_USER, question: "Which mailbox should I use?" });

  assert.match(html, /Input needed/);
  assert.match(html, /Which mailbox should I use\?/);
  assert.match(html, /Type your answer…/);
  assert.match(html, /disabled=""[^>]*>Send</);
});

test("an unresolved request renders no controls at all", () => {
  const html = render({ requestKind: ASK_USER, question: "Which mailbox should I use?", pending: false });

  assert.doesNotMatch(html, /<button/);
  assert.match(html, /Type your answer…/);
});

test("options survive a payload that omits the optional title", () => {
  const html = render({
    requestKind: ASK_USER,
    question: "Which region should I ship to?",
    options: [
      { label: "EU", description: "Fastest customs" },
      { label: "US", description: "Longer lead time" },
    ],
    pending: true,
    isLoading: false,
    onDecision: () => {},
  });

  assert.match(html, /EU/);
  assert.match(html, /US/);
  assert.doesNotMatch(html, /Type your answer/);
});

test("long values start collapsed in the fixed-height viewport", () => {
  const html = render({
    requestKind: HumanInTheLoopRequestKind.APPROVAL,
    toolCalls: [
      {
        id: "c1",
        name: "GMAIL_SEND_EMAIL",
        args: { body: "x".repeat(400), meta: { a: 1, b: 2, c: { d: 3 } } },
      },
    ],
  });

  assert.match(html, /max-h-40 overflow-hidden/);
});
