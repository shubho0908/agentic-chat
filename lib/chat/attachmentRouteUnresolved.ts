export type AttachmentRouteUnresolvedReason =
  | "none" | "ambiguous" | "history-incomplete" | "current-unverified" | "retrieval-unavailable";

export interface AttachmentRouteUnresolved {
  reason: AttachmentRouteUnresolvedReason;
  prompt: string;
}

export function unresolvedAttachmentRoute(reason: AttachmentRouteUnresolvedReason): AttachmentRouteUnresolved {
  const prompt = reason === "none"
    ? "Were you asking about a file in this chat? If so, which one?"
    : reason === "history-incomplete"
      ? "The attachment history could not be checked completely. Please name or reattach the file."
      : reason === "current-unverified"
        ? "I couldn't verify the current message or its files. Please retry."
        : reason === "retrieval-unavailable"
          ? "I couldn't read the requested file's contents. Please retry or reattach it."
          : "Which file in this chat did you mean?";
  return { reason, prompt };
}

export function unresolvedRouteToMessage(unresolved: AttachmentRouteUnresolved): string {
  return unresolved.prompt;
}
