import type { ReactNode } from "react";
import type * as ReactPdf from "@react-pdf/renderer";
import { PdfBlockType, PdfCalloutVariant, PdfListStyle, type PdfBlock, type PdfDocument, type PdfListItem } from "./document";
import { ensurePdfFonts, PdfFontFamily } from "./fonts";
import { parseInlineMarkdown, splitScriptRuns, type InlineSegment } from "./text";
import { CALLOUT_COLORS, resolveTheme, type PdfTheme } from "./theme";
import type { PdfImageAsset } from "./images";

const PAGE_MARGIN_TOP = 56;
const PAGE_MARGIN_BOTTOM = 72;
const PAGE_MARGIN_X = 56;
const CONTENT_WIDTH = 483;
const MAX_IMAGE_HEIGHT = 400;
const CODE_WRAP_CHARS = 90;
const WATERMARK_TEXT = "Agentic Chat";

let pdf: typeof ReactPdf;

type PdfStyleProp = ReactPdf.TextProps["style"];

export interface RenderPdfOptions {
  images: Map<string, PdfImageAsset>;
  generatedAt: Date;
  logoDataUri?: string;
}

interface BlockProps {
  theme: PdfTheme;
  images: Map<string, PdfImageAsset>;
}

function formatPdfDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function runsForSegment(segment: InlineSegment, baseFontSize: number): ReactNode[] {
  return splitScriptRuns(segment.text).map((run, index) => {
    const devanagari = run.devanagari && !segment.code;
    const fontFamily = segment.code
      ? PdfFontFamily.MONO
      : devanagari
        ? PdfFontFamily.DEVANAGARI
        : PdfFontFamily.BODY;
    return (
      <pdf.Text
        key={index}
        style={{
          fontFamily,
          fontWeight: segment.bold ? 600 : 400,
          fontStyle: segment.italic ? "italic" : "normal",
          fontSize: segment.code ? baseFontSize * 0.86 : baseFontSize,
          color: segment.code ? "#9F1239" : undefined,
        }}
      >
        {run.text}
      </pdf.Text>
    );
  });
}

function RichText({
  text,
  style,
  theme,
  fontSize = 10.5,
}: {
  text: string;
  style?: PdfStyleProp;
  theme: PdfTheme;
  fontSize?: number;
}) {
  const segments = parseInlineMarkdown(text);
  return (
    <pdf.Text style={[{ fontFamily: PdfFontFamily.BODY, fontSize, color: theme.body }, style]}>
      {segments.map((segment, index) =>
        segment.link ? (
          <pdf.Link key={index} src={segment.link} style={{ color: theme.accent, textDecoration: "underline" }}>
            {runsForSegment(segment, fontSize)}
          </pdf.Link>
        ) : (
          <pdf.Text key={index}>{runsForSegment(segment, fontSize)}</pdf.Text>
        ),
      )}
    </pdf.Text>
  );
}

function ParagraphBlock({ block, theme }: { block: Extract<PdfBlock, { type: "paragraph" }> } & BlockProps) {
  return <RichText text={block.text} theme={theme} style={{ lineHeight: 1.6, marginBottom: 8 }} />;
}

function HeadingBlock({ block, theme }: { block: Extract<PdfBlock, { type: "heading" }> } & BlockProps) {
  const level = block.level ?? 2;
  const fontSize = level === 3 ? 10.5 : 12.5;
  return (
    <pdf.View wrap={false} minPresenceAhead={36}>
      <RichText
        text={block.text}
        theme={theme}
        fontSize={fontSize}
        style={{ fontWeight: 600, color: theme.ink, marginTop: level === 3 ? 10 : 12, marginBottom: level === 3 ? 3 : 4 }}
      />
    </pdf.View>
  );
}

const BULLET_MARKERS = ["\u2022", "\u25E6", "\u25AA"];

function ListItems({
  items,
  listStyle,
  depth,
  theme,
}: {
  items: PdfListItem[];
  listStyle: "bullet" | "numbered";
  depth: number;
  theme: PdfTheme;
}) {
  return (
    <pdf.View style={{ marginLeft: depth === 0 ? 2 : 14 }}>
      {items.map((item, index) => (
        <pdf.View key={index}>
          <pdf.View style={{ flexDirection: "row", marginBottom: 4 }} wrap={false}>
            <pdf.Text
              style={{
                width: 16,
                fontFamily: PdfFontFamily.BODY,
                fontSize: 10.5,
                color: listStyle === PdfListStyle.NUMBERED ? theme.accent : theme.muted,
                fontWeight: listStyle === PdfListStyle.NUMBERED ? 600 : 400,
              }}
            >
              {listStyle === PdfListStyle.NUMBERED ? `${index + 1}.` : BULLET_MARKERS[Math.min(depth, BULLET_MARKERS.length - 1)]}
            </pdf.Text>
            <pdf.View style={{ flex: 1 }}>
              {item.text ? <RichText text={item.text} theme={theme} style={{ lineHeight: 1.5 }} /> : null}
            </pdf.View>
          </pdf.View>
          {item.items && item.items.length > 0 ? (
            <ListItems items={item.items} listStyle={listStyle} depth={depth + 1} theme={theme} />
          ) : null}
        </pdf.View>
      ))}
    </pdf.View>
  );
}

function ListBlock({ block, theme }: { block: Extract<PdfBlock, { type: "list" }> } & BlockProps) {
  return (
    <pdf.View style={{ marginBottom: 8 }}>
      <ListItems items={block.items} listStyle={block.style ?? "bullet"} depth={0} theme={theme} />
    </pdf.View>
  );
}

function TableBlock({ block, theme }: { block: Extract<PdfBlock, { type: "table" }> } & BlockProps) {
  const columnWidth = CONTENT_WIDTH / block.columns.length;
  return (
    <pdf.View style={{ marginVertical: 8, borderTopWidth: 1, borderTopColor: theme.hairline }}>
      <pdf.View
        style={{
          flexDirection: "row",
          backgroundColor: theme.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
        }}
        wrap={false}
      >
        {block.columns.map((column, index) => (
          <pdf.View key={index} style={{ width: columnWidth, paddingVertical: 6, paddingHorizontal: 8 }}>
            <RichText text={column} theme={theme} fontSize={9} style={{ fontWeight: 600, color: theme.ink }} />
          </pdf.View>
        ))}
      </pdf.View>
      {block.rows.map((row, rowIndex) => (
        <pdf.View
          key={rowIndex}
          style={{
            flexDirection: "row",
            borderBottomWidth: 1,
            borderBottomColor: theme.hairline,
            backgroundColor: rowIndex % 2 === 1 ? "#FAFAFA" : undefined,
          }}
          wrap={false}
        >
          {block.columns.map((_, columnIndex) => (
            <pdf.View key={columnIndex} style={{ width: columnWidth, paddingVertical: 6, paddingHorizontal: 8 }}>
              <RichText text={row[columnIndex] ?? ""} theme={theme} fontSize={9.5} style={{ lineHeight: 1.45 }} />
            </pdf.View>
          ))}
        </pdf.View>
      ))}
    </pdf.View>
  );
}

function wrapCodeLine(line: string): string[] {
  if (line.length <= CODE_WRAP_CHARS) return [line];
  const wrapped: string[] = [];
  for (let index = 0; index < line.length; index += CODE_WRAP_CHARS) {
    wrapped.push(line.slice(index, index + CODE_WRAP_CHARS));
  }
  return wrapped;
}

function CodeBlock({ block, theme }: { block: Extract<PdfBlock, { type: "code" }> } & BlockProps) {
  const content = block.code
    .replace(/\t/g, "  ")
    .split("\n")
    .flatMap(wrapCodeLine)
    .join("\n");
  return (
    <pdf.View
      style={{
        backgroundColor: theme.codeSurface,
        borderWidth: 1,
        borderColor: theme.codeBorder,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginVertical: 8,
      }}
    >
      {block.language ? (
        <pdf.Text
          style={{
            fontFamily: PdfFontFamily.BODY,
            fontSize: 7.5,
            color: theme.faint,
            textTransform: "uppercase",
            letterSpacing: 1,
            textAlign: "right",
            marginBottom: 4,
          }}
        >
          {block.language}
        </pdf.Text>
      ) : null}
      <pdf.Text style={{ fontFamily: PdfFontFamily.MONO, fontSize: 8.5, lineHeight: 1.55, color: "#24292F" }}>
        {content}
      </pdf.Text>
    </pdf.View>
  );
}

function QuoteBlock({ block, theme }: { block: Extract<PdfBlock, { type: "quote" }> } & BlockProps) {
  return (
    <pdf.View style={{ borderLeftWidth: 3, borderLeftColor: theme.accent, paddingLeft: 12, marginVertical: 8 }}>
      <RichText text={block.text} theme={theme} fontSize={11} style={{ fontStyle: "italic", color: theme.muted, lineHeight: 1.6 }} />
      {block.attribution ? (
        <pdf.Text style={{ fontFamily: PdfFontFamily.BODY, fontSize: 9, color: theme.faint, marginTop: 4 }}>
          {`\u2014 ${block.attribution}`}
        </pdf.Text>
      ) : null}
    </pdf.View>
  );
}

function CalloutBlock({ block, theme }: { block: Extract<PdfBlock, { type: "callout" }> } & BlockProps) {
  const variant = block.variant ?? PdfCalloutVariant.INFO;
  const colors = CALLOUT_COLORS[variant];
  return (
    <pdf.View
      style={{
        backgroundColor: colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: colors.bar,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginVertical: 8,
      }}
    >
      {block.title ? (
        <pdf.Text style={{ fontFamily: PdfFontFamily.BODY, fontSize: 10, fontWeight: 600, color: colors.title, marginBottom: 3 }}>
          {block.title}
        </pdf.Text>
      ) : null}
      <RichText text={block.text} theme={theme} fontSize={10} style={{ lineHeight: 1.55 }} />
    </pdf.View>
  );
}

function KeyValuesBlock({ block, theme }: { block: Extract<PdfBlock, { type: "key_values" }> } & BlockProps) {
  return (
    <pdf.View style={{ marginVertical: 8 }}>
      {block.items.map((item, index) => (
        <pdf.View
          key={index}
          style={{
            flexDirection: "row",
            paddingVertical: 6,
            borderBottomWidth: index === block.items.length - 1 ? 0 : 1,
            borderBottomColor: theme.hairline,
          }}
          wrap={false}
        >
          <pdf.Text
            style={{
              width: 160,
              fontFamily: PdfFontFamily.BODY,
              fontSize: 8.5,
              fontWeight: 600,
              color: theme.faint,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              paddingRight: 12,
            }}
          >
            {item.label}
          </pdf.Text>
          <pdf.View style={{ flex: 1 }}>
            <RichText text={item.value} theme={theme} style={{ lineHeight: 1.45 }} />
          </pdf.View>
        </pdf.View>
      ))}
    </pdf.View>
  );
}

function fittedImageWidth(size: { width: number; height: number }): number {
  const scale = Math.min(1, CONTENT_WIDTH / size.width, MAX_IMAGE_HEIGHT / size.height);
  return Math.round(size.width * scale);
}

function ImageBlock({ block, theme, images }: { block: Extract<PdfBlock, { type: "image" }> } & BlockProps) {
  const asset = images.get(block.url);
  return (
    <pdf.View style={{ marginVertical: 10, alignItems: "center" }} wrap={false}>
      {asset?.ok ? (
        <pdf.Image
          src={asset.dataUri}
          style={{
            width: asset.size ? fittedImageWidth(asset.size) : CONTENT_WIDTH,
            maxHeight: MAX_IMAGE_HEIGHT,
            objectFit: "contain",
          }}
        />
      ) : (
        <pdf.View
          style={{
            width: CONTENT_WIDTH,
            height: 90,
            backgroundColor: theme.surface,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <pdf.Text style={{ fontFamily: PdfFontFamily.BODY, fontSize: 9.5, color: theme.muted }}>
            Image unavailable
          </pdf.Text>
          {block.alt ? (
            <pdf.Text style={{ fontFamily: PdfFontFamily.BODY, fontSize: 8, color: theme.faint, marginTop: 3, textAlign: "center" }}>
              {block.alt}
            </pdf.Text>
          ) : null}
        </pdf.View>
      )}
      {block.caption ? (
        <pdf.Text style={{ fontFamily: PdfFontFamily.BODY, fontSize: 8.5, color: theme.faint, marginTop: 6, textAlign: "center" }}>
          {block.caption}
        </pdf.Text>
      ) : null}
    </pdf.View>
  );
}

function BlockView({ block, theme, images }: { block: PdfBlock } & BlockProps) {
  switch (block.type) {
    case PdfBlockType.PARAGRAPH:
      return <ParagraphBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.HEADING:
      return <HeadingBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.LIST:
      return <ListBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.TABLE:
      return <TableBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.CODE:
      return <CodeBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.QUOTE:
      return <QuoteBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.CALLOUT:
      return <CalloutBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.KEY_VALUES:
      return <KeyValuesBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.IMAGE:
      return <ImageBlock block={block} theme={theme} images={images} />;
    case PdfBlockType.DIVIDER:
      return <pdf.View style={{ height: 1, backgroundColor: theme.hairline, marginVertical: 14 }} />;
    default:
      return null;
  }
}

function Watermark({ theme, logoDataUri }: { theme: PdfTheme; logoDataUri?: string }) {
  return (
    <pdf.View
      style={{
        position: "absolute",
        bottom: 24,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
      }}
      fixed
    >
      {logoDataUri ? (
        <pdf.Image src={logoDataUri} style={{ width: 9, height: 9, marginRight: 5 }} />
      ) : null}
      <pdf.Text style={{ fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: theme.watermark }}>
        {WATERMARK_TEXT}
      </pdf.Text>
    </pdf.View>
  );
}

export async function renderPdfDocument(document: PdfDocument, options: RenderPdfOptions): Promise<Buffer> {
  pdf = await import("@react-pdf/renderer");
  await ensurePdfFonts();
  const theme = resolveTheme(document.accent);
  const metaParts = [formatPdfDate(options.generatedAt)];
  if (document.author) metaParts.push(document.author);

  const element = (
    <pdf.Document title={document.title} author={document.author ?? WATERMARK_TEXT} producer={WATERMARK_TEXT} creator={WATERMARK_TEXT}>
      <pdf.Page
        size="A4"
        style={{
          paddingTop: PAGE_MARGIN_TOP,
          paddingBottom: PAGE_MARGIN_BOTTOM,
          paddingHorizontal: PAGE_MARGIN_X,
          fontFamily: PdfFontFamily.BODY,
        }}
      >
        <pdf.View>
          <pdf.View style={{ width: 40, height: 4, borderRadius: 2, marginBottom: 14, backgroundColor: theme.accent }} />
          <RichText text={document.title} theme={theme} fontSize={24} style={{ fontWeight: 600, color: theme.ink, lineHeight: 1.28 }} />
          {document.subtitle ? (
            <RichText text={document.subtitle} theme={theme} fontSize={11} style={{ color: theme.muted, lineHeight: 1.5, marginTop: 6 }} />
          ) : null}
          <pdf.View style={{ flexDirection: "row", marginTop: 12 }}>
            <pdf.Text style={{ fontSize: 8.5, color: theme.faint }}>{metaParts.join("   \u2022   ")}</pdf.Text>
          </pdf.View>
          <pdf.View style={{ height: 1, marginTop: 16, marginBottom: 6, backgroundColor: theme.hairline }} />
        </pdf.View>

        {document.sections.map((section, sectionIndex) => (
          <pdf.View key={sectionIndex}>
            {section.heading ? (
              <pdf.View
                style={{ flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 8 }}
                wrap={false}
                minPresenceAhead={48}
              >
                <pdf.View style={{ width: 3, height: 13, borderRadius: 1.5, marginRight: 8, backgroundColor: theme.accent }} />
                <RichText text={section.heading} theme={theme} fontSize={15} style={{ fontWeight: 600, color: theme.ink }} />
              </pdf.View>
            ) : null}
            {section.blocks.map((block, blockIndex) => (
              <BlockView key={blockIndex} block={block} theme={theme} images={options.images} />
            ))}
          </pdf.View>
        ))}

        <Watermark theme={theme} logoDataUri={options.logoDataUri} />
        <pdf.Text
          style={{ position: "absolute", bottom: 24, right: PAGE_MARGIN_X, fontSize: 8, color: theme.faint }}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </pdf.Page>
    </pdf.Document>
  );

  return pdf.renderToBuffer(element);
}
