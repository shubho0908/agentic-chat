import { attachmentKind, type AttachmentKind } from "./attachmentKind";

export interface ResourceCandidate {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  kind?: string | null;
  messageId: string;
  current: boolean;
}

export type ResourceSelection =
  | { state: "none" }
  | { state: "ambiguous" }
  | {
      state: "selected";
      kind: AttachmentKind;
      resources: ResourceCandidate[];
      images?: ResourceCandidate[];
    };

const imageWords = /\b(?:images?|pictures?|photos?|screenshots?)\b/i;
const documentWords = /\b(?:docs?|documents?|pdfs?)\b/i;
const snippetWords = /\b(?:snippets?|pasted\s+(?:text|content))\b/i;
const genericWords = /\b(?:files?|attachments?)\b/i;
const referenceWords =
  /\b(?:this|that|these|those|attached|earlier|previous|prior|above|uploaded|sent)\b/i;
const earlierWords =
  /\b(?:earlier|previous|prior|above|before|last\s+(?:time|week)|sent\s+(?:before|earlier))\b/i;

export function selectConversationResource(
  text: string,
  currentHasImage: boolean,
  candidates: ResourceCandidate[],
): ResourceSelection {
  if (
    /\b(?:remember|recall)\b/i.test(text) &&
    !currentHasImage &&
    !/\b(?:this|that|these|those|attached|uploaded|sent|earlier|previous)\b/i.test(
      text,
    )
  )
    return { state: "none" };
  const kinds = new Set<AttachmentKind>();
  if (imageWords.test(text)) kinds.add("image");
  if (documentWords.test(text)) kinds.add("document");
  if (snippetWords.test(text)) kinds.add("snippet");
  let comparisonImages: ResourceCandidate[] | undefined;
  if (kinds.size > 1) {
    if (kinds.size !== 2 || !kinds.has("image") || !kinds.has("document"))
      return { state: "ambiguous" };
    const images = candidates.filter(
      (candidate) => attachmentKind(candidate) === "image",
    );
    const currentImages = images.filter((candidate) => candidate.current);
    const textMentionsOlderImage =
      /\b(?:earlier|previous|prior|old|above)\s+(?:image|photo|picture)\b/i.test(text);
    comparisonImages = textMentionsOlderImage
      ? images.filter((candidate) => !candidate.current)
      : currentImages.length ? currentImages : images;
    if (!comparisonImages.length && !currentHasImage) return { state: "none" };
    if (new Set(comparisonImages.map((candidate) => candidate.messageId)).size > 1)
      return { state: "ambiguous" };
    kinds.delete("image");
  }

  const lowerText = text.toLocaleLowerCase();
  const named = candidates.filter(
    (candidate) => candidate.fileName.length > 0 &&
      lowerText.includes(candidate.fileName.toLocaleLowerCase()),
  );
  if (named.length) {
    const uniqueKinds = new Set(named.map(attachmentKind));
    if (uniqueKinds.size !== 1) return { state: "ambiguous" };
    const kind = attachmentKind(named[0]);
    if (kinds.size && !kinds.has(kind)) return { state: "ambiguous" };
    const namedMessageIds = new Set(named.map((candidate) => candidate.messageId));
    if (namedMessageIds.size > 1) return { state: "ambiguous" };
    return { state: "selected", kind, resources: named,
      ...(comparisonImages && { images: comparisonImages }) };
  }

  if (
    kinds.has("image") &&
    !currentHasImage &&
    !candidates.some((c) => attachmentKind(c) === "image")
  ) {
    return { state: "none" };
  }
  const attachmentReference =
    /\b(?:this|that|these|those|attached|earlier|previous|prior|above|uploaded|sent)\s+(?:files?|attachments?|docs?|documents?|pdfs?|images?|photos?|pictures?|screenshots?|snippets?)\b/i.test(text) ||
    /\b(?:files?|attachments?|docs?|documents?|pdfs?|images?|photos?|pictures?|screenshots?|snippets?)\s+(?:i|we)\s+(?:sent|uploaded|attached|pasted)\b/i.test(text) ||
    (/\b(?:earlier|previous|prior|above)\b/i.test(text) && kinds.size > 0);
  if (!candidates.some((candidate) => candidate.current) &&
      !currentHasImage && !attachmentReference && !named.length)
    return { state: "none" };
  if (!kinds.size) {
    if (
      !genericWords.test(text) &&
      !referenceWords.test(text) &&
      !currentHasImage &&
      !candidates.some((candidate) => candidate.current)
    ) return { state: "none" };
    const currentKinds = new Set(
      candidates.filter((c) => c.current).map(attachmentKind),
    );
    if (currentHasImage) currentKinds.add("image");
    if (currentKinds.size === 1) kinds.add([...currentKinds][0]);
    else if (currentKinds.size > 1) {
      // A newly uploaded image and document should both reach the model.
      if (currentKinds.size === 2 && currentKinds.has("image") &&
          currentKinds.has("document") && currentHasImage)
        kinds.add("document");
      else return { state: "ambiguous" };
    } else {
      const allKinds = new Set(candidates.map(attachmentKind));
      if (allKinds.size > 1) return { state: "ambiguous" };
      if (allKinds.size === 1) kinds.add([...allKinds][0]);
      else return { state: "none" };
    }
  }

  const kind = [...kinds][0];
  let matching = candidates.filter((c) => attachmentKind(c) === kind);
  const explicitCurrentDocument = kind === "document" &&
    /\b(?:this|current|new|attached)\s+(?:doc|document|pdf)\b/i.test(text);
  const explicitEarlier = earlierWords.test(text) && !explicitCurrentDocument;
  if (explicitEarlier) matching = matching.filter((c) => !c.current);
  else if (matching.some((c) => c.current))
    matching = matching.filter((c) => c.current);
  if (kind === "image" && currentHasImage && !earlierWords.test(text)) {
    matching = matching.filter((c) => c.current);
    if (!matching.length) return { state: "selected", kind, resources: [] };
  }
  if (!matching.length) return { state: "none" };
  const messages = new Set(matching.map((c) => c.messageId));
  if (messages.size > 1) return { state: "ambiguous" };
  return { state: "selected", kind, resources: matching,
    ...(comparisonImages && { images: comparisonImages }) };
}
