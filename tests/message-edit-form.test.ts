import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageActions } from "@/components/chat/messageActions";
import { MessageEditForm } from "@/components/chat/messageEditForm";

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
  assert.match(html, /maxlength="51200"/i);
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

  assert.match(html, /aria-label="Save and resend message"[^>]*disabled/);
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
