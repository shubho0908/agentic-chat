import { DynamicStructuredTool } from "@langchain/core/tools";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { z } from "zod";
import { CustomEventName } from "@/lib/orchestrator/constants";
import { ToolName } from "@/lib/tools/constants";
import { generateAndStorePdf } from "@/lib/pdf/service";
import { PdfAccent } from "@/lib/pdf/document";
import { logger } from "@/lib/logger";

const createPdfSchema = z.object({
  title: z.string().describe("Document title, shown on the first page"),
  subtitle: z.string().optional().describe("Optional one-line subtitle under the title"),
  author: z.string().optional().describe("Optional author name for the header metadata"),
  accent: z
    .enum([PdfAccent.SLATE, PdfAccent.INDIGO, PdfAccent.EMERALD, PdfAccent.AMBER, PdfAccent.ROSE])
    .optional()
    .describe("Color accent for headings and rules; default slate"),
  sections: z
    .array(z.unknown())
    .min(1)
    .describe(
      "Ordered sections. Each section: { heading?: string, blocks: Block[] }. Block types: " +
      "{type:\"paragraph\", text} | {type:\"heading\", text, level?: 2|3} | " +
      "{type:\"list\", style?: \"bullet\"|\"numbered\", items: (string | {text, items?})[]} | " +
      "{type:\"table\", columns: string[], rows: string[][]} | " +
      "{type:\"code\", code, language?} | {type:\"quote\", text, attribution?} | " +
      "{type:\"callout\", variant?: \"info\"|\"warning\"|\"success\"|\"danger\", title?, text} | " +
      "{type:\"key_values\", items: {label, value}[]} | " +
      "{type:\"image\", url, alt?, caption?} (direct https image URL only) | {type:\"divider\"}. " +
      "Text fields support inline markdown: **bold**, *italic*, `code`, [label](https://url).",
    ),
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const createPdfTool = new DynamicStructuredTool({
  name: ToolName.CREATE_PDF,
  description:
    "Create a polished, professionally typeset PDF document and deliver it to the user as a downloadable file card. " +
    "Use whenever the user asks for a PDF or wants content exported as a document (reports, summaries, notes, guides, resumes, invoices). " +
    "Compose the document from structured sections and typed blocks instead of one long paragraph: headings, paragraphs, bullet or numbered lists, " +
    "tables for tabular data, code blocks for code, callouts for important notes, key_values for metadata or specs, quotes, and images. " +
    "The PDF must be self-contained: the user reads the PDF, not this chat, so include all content that belongs in the document.",
  schema: createPdfSchema,
  responseFormat: "content_and_artifact",
  func: async (input, _runManager, config) => {
    const outcome = await generateAndStorePdf(input, { signal: config?.signal });

    if (!outcome.ok) {
      return [
        `PDF creation failed: ${outcome.error}\nFix the document input and call ${ToolName.CREATE_PDF} again with the corrected value.`,
        null,
      ];
    }

    const { pdf } = outcome;

    const pages = pdf.pageCount > 0 ? `${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"}` : "pages unknown";
    try {
      await dispatchCustomEvent(CustomEventName.PDF_FILE, { pdf }, config);
    } catch (error) {
      logger.warn("[create_pdf] Failed to emit PDF file event:", error);
    }

    return [
      `PDF created: "${pdf.title}" (${pages}, ${formatBytes(pdf.size)}). ` +
        `The user has received a download card for this file, so do not paste the URL or restate the file contents. ` +
        `Reply with one or two sentences confirming what the PDF covers.`,
      { pdf },
    ];
  },
});
