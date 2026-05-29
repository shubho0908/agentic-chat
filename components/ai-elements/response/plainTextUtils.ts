import { type ReactNode } from "react";
import {
  DEFAULT_CODE_LANGUAGE,
  TYPEOF_OBJECT,
  TYPEOF_STRING,
} from "./constants";

function isStringNode(node: unknown): node is string {
  return typeof node === TYPEOF_STRING;
}

function isObjectNode(
  node: unknown,
): node is { props?: { children?: React.ReactNode } } {
  return typeof node === TYPEOF_OBJECT && node !== null;
}

export function getTextFromChildren(nodes: ReactNode): string {
  if (!nodes) return "";
  if (isStringNode(nodes)) return nodes;
  if (Array.isArray(nodes)) return nodes.map(getTextFromChildren).join("");
  if (isObjectNode(nodes) && "props" in nodes && nodes.props?.children) {
    return getTextFromChildren(nodes.props.children);
  }
  return String(nodes);
}

export function normalizeLanguageLabel(languageClass: string | undefined): string {
  if (!languageClass) {
    return DEFAULT_CODE_LANGUAGE;
  }

  const match = /language-([\w-]+)/.exec(languageClass);
  if (!match?.[1]) {
    return DEFAULT_CODE_LANGUAGE;
  }

  return match[1].replace(/[-_]/g, " ");
}
