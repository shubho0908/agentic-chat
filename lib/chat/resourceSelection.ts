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
  const currentCandidates = candidates.filter((candidate) => candidate.current);
  const aggregateRequest =
    (/\b(?:all|every|across|together|each|sabhi)\b/i.test(text) &&
      (kinds.size > 0 || genericWords.test(text))) ||
    /\b(?:these|those|multiple|several|five|four|three|two|[2-9])\s+(?:files?|attachments?|docs?|documents?|pdfs?|images?|photos?|pictures?|snippets?)\b/i.test(text);
  const bothFiles = /\b(?:both|dono)\s+(?:files?|attachments?|docs?|documents?|pdfs?|images?|photos?|pictures?|snippets?)\b/i.test(text);
  const bothGeneric = /\b(?:both|dono)\s+(?:files?|attachments?)\b/i.test(text);
  const hasHistoricalImageReference = /\b(?:earlier|previous|prior|old|above)\s+(?:image|photo|picture|screenshot)\b/i.test(text);
  if (bothGeneric && !hasHistoricalImageReference && currentCandidates.length === 2 &&
      new Set(currentCandidates.map(attachmentKind)).size === 2 &&
      currentCandidates.some((candidate) => attachmentKind(candidate) === "image") &&
      currentCandidates.some((candidate) => attachmentKind(candidate) === "document")) {
    return { state: "selected", kind: "document",
      resources: currentCandidates.filter((candidate) => attachmentKind(candidate) === "document"),
      images: currentCandidates.filter((candidate) => attachmentKind(candidate) === "image") };
  }
  if (bothGeneric && hasHistoricalImageReference && currentCandidates.some((candidate) => attachmentKind(candidate) === "document")) {
    const olderImages = candidates.filter((candidate) => !candidate.current && attachmentKind(candidate) === "image");
    const namedOlderImages = olderImages.filter((candidate) => candidate.fileName &&
      text.toLocaleLowerCase().includes(candidate.fileName.toLocaleLowerCase()));
    const imageFileMention = /\b[^\s/]+\.(?:png|jpe?g|webp|gif|heic|avif|svg|bmp|tiff?)\b/i.test(text);
    const selectedOlderImages = imageFileMention ? namedOlderImages : olderImages;
    if (selectedOlderImages.length !== 1) return { state: "ambiguous" };
    const currentDocuments = currentCandidates.filter((candidate) => attachmentKind(candidate) === "document");
    if (currentDocuments.length !== 1) return { state: "ambiguous" };
    return { state: "selected", kind: "document", resources: currentDocuments, images: selectedOlderImages };
  }
  let comparisonImages: ResourceCandidate[] | undefined;
  if (kinds.size > 1) {
    if (kinds.size !== 2 || !kinds.has("image") || !kinds.has("document"))
      return { state: "ambiguous" };
    const images = candidates.filter(
      (candidate) => attachmentKind(candidate) === "image",
    );
    const currentImages = images.filter((candidate) => candidate.current);
    const textMentionsOlderImage =
      hasHistoricalImageReference ||
      /\b(?:image|photo|picture)\b.{0,45}\b(?:earlier|previous|prior|pehle|old)\b/i.test(text);
    const namedImages = images.filter((candidate) => candidate.fileName &&
      text.toLocaleLowerCase().includes(candidate.fileName.toLocaleLowerCase()));
    const mentionsCurrentImage = /\b(?:this|current|new|attached)\s+(?:image|photo|picture|screenshot)\b/i.test(text);
    comparisonImages = namedImages.length
      ? images.filter((candidate) => namedImages.includes(candidate) ||
          mentionsCurrentImage && candidate.current)
      : textMentionsOlderImage && mentionsCurrentImage
      ? images
      : textMentionsOlderImage
      ? images.filter((candidate) => !candidate.current)
      : aggregateRequest ? images
      : currentImages.length ? currentImages : images;
    if (!comparisonImages.length && !currentHasImage) return { state: "none" };
    if (!aggregateRequest && textMentionsOlderImage &&
        comparisonImages.filter((candidate) => !candidate.current).length > 1)
      return { state: "ambiguous" };
    if (new Set(comparisonImages.map((candidate) => candidate.messageId)).size > 1 &&
        !aggregateRequest && !(textMentionsOlderImage && mentionsCurrentImage &&
          comparisonImages.filter((candidate) => !candidate.current).length === 1))
      return { state: "ambiguous" };
    kinds.delete("image");
  }

  const lowerText = text.toLocaleLowerCase();
  const namedImagePlusOlder = kinds.size === 1 && kinds.has("image") &&
    /\b(?:earlier|previous|prior|old)\s+(?:image|photo|picture)\b/i.test(text) &&
    candidates.some((candidate) => attachmentKind(candidate) === "image" &&
      candidate.current && candidate.fileName && lowerText.includes(candidate.fileName.toLocaleLowerCase()));
  if (namedImagePlusOlder) {
    const chosen = candidates.filter((candidate) => attachmentKind(candidate) === "image" &&
      ((candidate.current && candidate.fileName && lowerText.includes(candidate.fileName.toLocaleLowerCase())) || !candidate.current));
    if (chosen.filter((candidate) => !candidate.current).length !== 1)
      return { state: "ambiguous" };
    return { state: "selected", kind: "image", resources: chosen };
  }
  const named = candidates.filter(
    (candidate) => candidate.fileName.length > 0 &&
      lowerText.includes(candidate.fileName.toLocaleLowerCase()),
  );
  // A bare definition of a historical filename is not a request to use the
  // uploaded attachment. A current upload or explicit possessive/reference is.
  if (named.length && named.every((candidate) => !candidate.current) &&
      /^\s*(?:what|who|where)\s+(?:is|are|was)\s+[^?]+\??\s*$/i.test(text) &&
      !/\b(?:this|that|these|those|my|our|uploaded|attached|sent|earlier|previous|prior)\b/i.test(text))
    return { state: "none" };
  if (named.length && !(comparisonImages && kinds.has("document") &&
      named.every((candidate) => attachmentKind(candidate) === "image"))) {
    const uniqueKinds = new Set(named.map(attachmentKind));
    if (uniqueKinds.size !== 1) {
      if (uniqueKinds.size === 2 && uniqueKinds.has("image") && uniqueKinds.has("document") &&
          (aggregateRequest || kinds.size === 1 && kinds.has("document"))) {
        return { state: "selected", kind: "document",
          resources: named.filter((candidate) => attachmentKind(candidate) === "document"),
          images: named.filter((candidate) => attachmentKind(candidate) === "image") };
      }
      return { state: "ambiguous" };
    }
    const kind = attachmentKind(named[0]);
    if (kinds.size && !kinds.has(kind)) return { state: "ambiguous" };
    if (bothFiles && named.length !== 2) return { state: "ambiguous" };
    const namedMessageIds = new Set(named.map((candidate) => candidate.messageId));
    if (namedMessageIds.size > 1 && !aggregateRequest && !bothFiles) return { state: "ambiguous" };
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
  if (!currentCandidates.length &&
      !currentHasImage && !attachmentReference && !named.length && !aggregateRequest && !bothFiles)
    return { state: "none" };
  if (!kinds.size) {
    if (aggregateRequest && (genericWords.test(text) || currentCandidates.length)) {
      const availableKinds = new Set(candidates.map(attachmentKind));
      if (availableKinds.size === 2 && availableKinds.has("document") && availableKinds.has("image")) {
        kinds.add("document");
        comparisonImages = candidates.filter((c) => attachmentKind(c) === "image");
      } else if (availableKinds.size === 1) kinds.add([...availableKinds][0]);
      else if (availableKinds.size > 1) return { state: "ambiguous" };
    }
    if (!kinds.size && (
      !genericWords.test(text) &&
      !referenceWords.test(text) &&
      !currentHasImage &&
      !bothFiles &&
      !candidates.some((candidate) => candidate.current)
    )) return { state: "none" };
    const currentKinds = new Set(
      candidates.filter((c) => c.current).map(attachmentKind),
    );
    if (currentHasImage) currentKinds.add("image");
    if (!kinds.size && currentKinds.size === 1) kinds.add([...currentKinds][0]);
    else if (!kinds.size && currentKinds.size > 1) {
      // A newly uploaded image and document should both reach the model.
      if (currentKinds.size === 2 && currentKinds.has("image") &&
          currentKinds.has("document") && currentHasImage)
        kinds.add("document");
      else return { state: "ambiguous" };
    } else if (!kinds.size) {
      const allKinds = new Set(candidates.map(attachmentKind));
      if (allKinds.size > 1) return { state: "ambiguous" };
      if (allKinds.size === 1) kinds.add([...allKinds][0]);
      else return { state: "none" };
    }
  }

  const kind = [...kinds][0];
  // An aggregate request without a typed file word can still compare the
  // selected images against documents across turns.
  if (aggregateRequest && kind === "document" && !comparisonImages &&
      /\b(?:images?|photos?|pictures?)\b/i.test(text))
    comparisonImages = candidates.filter((c) => attachmentKind(c) === "image");
  let matching = candidates.filter((c) => attachmentKind(c) === kind);
  const explicitCurrentDocument = kind === "document" &&
    (/\b(?:this|current|new|attached)\s+(?:doc|document|pdf)\b/i.test(text) ||
     /\b(?:pdf|document|doc)\b.{0,20}\b(?:naya|abhi|uploaded)\b/i.test(text));
  const explicitEarlier = earlierWords.test(text) && !explicitCurrentDocument;
  if (explicitEarlier && !aggregateRequest) matching = matching.filter((c) => !c.current);
  else if (explicitCurrentDocument && !aggregateRequest) matching = matching.filter((c) => c.current);
  else if (!aggregateRequest && matching.some((c) => c.current))
    matching = matching.filter((c) => c.current);
  if (kind === "image" && currentHasImage && !earlierWords.test(text) && !aggregateRequest) {
    matching = matching.filter((c) => c.current);
    if (!matching.length) return { state: "selected", kind, resources: [] };
  }
  if (!matching.length) return { state: "none" };
  if (bothFiles && matching.length !== 2) return { state: "ambiguous" };
  const messages = new Set(matching.map((c) => c.messageId));
  if (messages.size > 1 && !aggregateRequest && !bothFiles) return { state: "ambiguous" };
  return { state: "selected", kind, resources: matching,
    ...(comparisonImages && { images: comparisonImages }) };
}
