import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VALIDATION_LIMITS } from "@/constants/validation";
import { MessageActions } from "@/components/chat/messageActions";
import { InlineMarkdown } from "@/components/ai-elements/inlineMarkdown";
import { HumanInTheLoopApprovalCard } from "@/components/chat/humanInTheLoopApprovalCard";
import { HumanInTheLoopRequestKind } from "@/lib/tools/constants";
import { MessageRole, type Message } from "@/lib/schemas/chat";
import { ChatMessage } from "@/components/chat/chatMessage";
import { Response } from "@/components/ai-elements/response";
import { extractUrls } from "@/lib/url-normalization";
import { MessageEditForm } from "@/components/chat/messageEditForm";

test("inline Markdown renders emphasis instead of literal delimiters", () => {
  const html = renderToStaticMarkup(createElement(InlineMarkdown, {
    content: "Keep **bold** and *italic* text",
  }));
  assert.match(html, /<strong class="[^"]*font-semibold[^"]*">bold<\/strong>/);
  assert.match(html, /<em class="[^"]*italic[^"]*">italic<\/em>/);
  assert.doesNotMatch(html, /\*\*bold\*\*/);
});

test("user chat messages render Markdown formatting", () => {
  const message: Message = {
    id: "user-markdown",
    role: MessageRole.USER,
    content: "Keep **bold** text",
    timestamp: 1,
  };
  const html = renderToStaticMarkup(createElement(ChatMessage, { message, isLastMessage: true }));
  assert.match(html, /<strong[^>]*>bold<\/strong>/);
  assert.doesNotMatch(html, /\*\*bold\*\*/);
});

test("normalizes user-message URLs before previewing them", () => {
  assert.deepEqual(
    extractUrls("Visit https://example.com) and www.example.com/path"),
    ["https://example.com/", "https://www.example.com/path"],
  );
});

test("normalizes bare links in the plain-text renderer without swallowing punctuation", () => {
  const html = renderToStaticMarkup(
    createElement(InlineMarkdown, { content: "See https://example.com) and www.example.com/path." }),
  );

  assert.match(html, /href="https:\/\/example\.com\/"/);
  assert.match(html, /href="https:\/\/www\.example\.com\/path"/);
  assert.match(html, /\) and/);
});

test("renders the complete accepted user-message content", () => {
  const tail = "END-OF-USER-MESSAGE";
  const content = `${"a".repeat(VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH - tail.length)}${tail}`;
  const html = renderToStaticMarkup(createElement(InlineMarkdown, { content }));

  assert.match(html, new RegExp(tail));
});

test("does not silently truncate long assistant content", () => {
  const tail = "END-OF-ASSISTANT-MESSAGE";
  const children = `${"b".repeat(VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH - tail.length)}${tail}`;
  const html = renderToStaticMarkup(createElement(Response, null, children));

  assert.match(html, new RegExp(tail));
});

test("keeps Markdown list boundaries visible in inline content", () => {
  const html = renderToStaticMarkup(
    createElement(InlineMarkdown, {
      content: "- first\n- second\n\n3. third\n4. fourth",
    }),
  );

  assert.match(html, /role="list"/);
  assert.match(html, /role="listitem"/);
  assert.match(html, /list-disc/);
  assert.match(html, /data-list-start="3"/);
  assert.match(html, />3\.<\/span>third/);
  assert.match(html, /first/);
  assert.match(html, /fourth/);
});

test("preserves nested, empty, and task-list boundaries without nested controls", () => {
  const html = renderToStaticMarkup(
    createElement(InlineMarkdown, {
      content: "- outer\n  - inner\n- \n- [x] done\n- [ ] pending",
    }),
  );

  assert.ok((html.match(/role="list"/g) ?? []).length >= 2);
  assert.ok((html.match(/role="listitem"/g) ?? []).length >= 4);
  assert.match(html, /inner/);
  assert.match(html, /done/);
  assert.match(html, /☑/);
  assert.match(html, /☐/);
  assert.doesNotMatch(html, /<input/);
});

test("HITL headings and context render Markdown formatting", () => {
  const html = renderToStaticMarkup(createElement(HumanInTheLoopApprovalCard, {
    requestKind: HumanInTheLoopRequestKind.ASK_USER,
    question: "Keep **bold** text",
    context: "Use *emphasis* here",
    pending: true,
    isLoading: false,
    onDecision: () => {},
  }));
  assert.match(html, /<strong[^>]*>bold<\/strong>/);
  assert.match(html, /<em[^>]*>emphasis<\/em>/);
  assert.doesNotMatch(html, /\*\*bold\*\*/);
  assert.doesNotMatch(html, /\*emphasis\*/);
});

test("message edit field exposes an accessible, bounded autosizing control", () => {
  const html = renderToStaticMarkup(
    createElement(MessageEditForm, {
      editText: "hello",
      onEditTextChange: () => {},
      onSubmit: () => {},
      onCancel: () => {},
    }),
  );

  assert.match(html, /aria-label="Edit message"/);
  assert.match(html, /name="message"/);
  assert.match(html, /autocomplete="off"/i);
  assert.match(html, /rows="1"/);
  assert.match(html, /cols="1"/);
  assert.match(html, new RegExp(`maxlength="${VALIDATION_LIMITS.CHAT_MESSAGE_MAX_LENGTH}"`, "i"));
  assert.doesNotMatch(html, /<button/);
});

test("editing replaces message actions with accessible save and cancel controls", () => {
  const html = renderToStaticMarkup(
    createElement(MessageActions, {
      context: { isUser: true, isEditing: true, canEdit: true },
      textContent: "hello",
      onEditStart: () => {},
      onEditSubmit: () => {},
      onEditCancel: () => {},
      canSaveEdit: true,
    }),
  );

  assert.match(html, /aria-label="Save and resend message"/);
  assert.match(html, /aria-label="Cancel editing message"/);
  assert.doesNotMatch(html, /aria-label="Copy to clipboard"/);
});

test("save is disabled when the edited message contains only whitespace", () => {
  const html = renderToStaticMarkup(
    createElement(MessageActions, {
      context: { isUser: true, isEditing: true, canEdit: true },
      textContent: "hello",
      onEditStart: () => {},
      onEditSubmit: () => {},
      onEditCancel: () => {},
      canSaveEdit: false,
    }),
  );

  const saveButton = html.match(/<button[^>]*aria-label="Save and resend message"[^>]*>/)?.[0] ?? "";
  assert.match(saveButton, /disabled/);
});

test("textarea resizing grows with content and scrolls only above the cap", async () => {
  const textareaModule = (await import("@/hooks/useChatTextarea")) as unknown as Record<
    string,
    unknown
  >;
  const resizeTextarea = textareaModule.resizeTextarea;

  assert.equal(typeof resizeTextarea, "function");
  if (typeof resizeTextarea !== "function") return;

  const style: Partial<CSSStyleDeclaration> = {};
  let scrollHeight = 72;
  const textarea = {
    style,
    get scrollHeight() {
      return scrollHeight;
    },
  };

  resizeTextarea(textarea, 200);
  assert.equal(style.height, "72px");
  assert.equal(style.overflowY, "");

  scrollHeight = 260;
  resizeTextarea(textarea, 200);
  assert.equal(style.height, "200px");
  assert.equal(style.overflowY, "auto");

  scrollHeight = 40;
  resizeTextarea(textarea, 200);
  assert.equal(style.height, "40px");
  assert.equal(style.overflowY, "");
});
