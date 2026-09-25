import { attachmentKind } from "./attachmentKind";

export interface RoutableAttachment {
  id?: string;
  fileName: string;
  fileType: string;
}

export function selectDocumentAttachmentsForTurn<T extends RoutableAttachment>(
  messages: Array<{ attachments?: T[] }>,
  isReferential: boolean,
): T[] {
  const scopedMessages = isReferential ? messages : messages.slice(-1);
  return scopedMessages
    .flatMap((message) => message.attachments ?? [])
    .filter((attachment) => attachmentKind(attachment) === "document");
}
