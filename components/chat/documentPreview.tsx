"use client";

import { Download, ExternalLink, FileWarning } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollArea";
import { useIsMobile } from "@/hooks/useMobile";
import Link from "next/link";
import { queryKeys } from "@/lib/queryKeys";

const IFRAME_LOAD_TIMEOUT_MS = 4000;

interface EmbeddedFrameProps {
  src: string;
  fileName: string;
  fileUrl: string;
}

function EmbeddedFrame({ src, fileName, fileUrl }: EmbeddedFrameProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "blocked">("loading");
  const [prevSrc, setPrevSrc] = useState(src);

  if (prevSrc !== src) {
    setPrevSrc(src);
    setStatus("loading");
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus((current) => (current === "loading" ? "blocked" : current));
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [src]);

  if (status === "blocked") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <FileWarning className="size-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Preview blocked</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Your browser or an extension (e.g., ad blocker) prevented this file from loading inline. Download it or open it in a new tab to view.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href={fileUrl} download={fileName}>
              <Download />
              Download
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={fileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Open in New Tab
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        </div>
      )}
      <iframe
        src={src}
        className="w-full h-full border-0"
        title={fileName}
        sandbox="allow-scripts allow-popups"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("blocked")}
      />
    </div>
  );
}

interface DocumentPreviewProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  open: boolean;
  onClose: () => void;
}

async function fetchTextFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function getOccurrenceKey(value: string, counts: Map<string, number>): string {
  const nextCount = counts.get(value) ?? 0;
  counts.set(value, nextCount + 1);
  return nextCount === 0 ? value || "empty" : `${value || "empty"}-${nextCount}`;
}

function renderCSV(content: string) {
  const rows = content.split("\n").map((row) => row.split(","));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const headerKeys = new Map<string, number>();
  const rowKeys = new Map<string, number>();

  return (
    <ScrollArea className="h-[70vh]">
      <div className="p-4">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 bg-background border-b-2">
            <tr>
              {headers.map((header) => (
                <th
                  key={getOccurrenceKey(header, headerKeys)}
                  className="px-4 py-2 text-left text-sm font-semibold border"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row) => {
              const rowKey = getOccurrenceKey(row.join("\u001f"), rowKeys);
              const cellKeys = new Map<string, number>();

              return (
                <tr key={rowKey} className="border-b hover:bg-muted/30">
                  {row.map((cell) => (
                    <td
                      key={`${rowKey}-${getOccurrenceKey(cell, cellKeys)}`}
                      className="px-4 py-2 text-sm border"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  );
}

function renderStatus(message: string) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export function DocumentPreview({ fileUrl, fileName, fileType, open, onClose }: DocumentPreviewProps) {
  const isMobile = useIsMobile();

  const isPDF = fileType === "application/pdf" || fileName.endsWith(".pdf");
  const isCSV = fileType === "text/csv" || fileName.endsWith(".csv");
  const isTextFile = (fileType.startsWith("text/") || fileName.endsWith(".txt")) && !isCSV;
  const isOfficeDoc =
    fileType.includes("wordprocessingml") ||
    fileType.includes("spreadsheetml") ||
    fileName.match(/\.(docx?|xlsx?|pptx?)$/);

  const { data: fetchedContent, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.textFileContent(fileUrl),
    queryFn: () => fetchTextFile(fileUrl),
    enabled: open && !!fileUrl && (isTextFile || isCSV),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const textFileContent = fetchedContent ?? null;
  const errorMessage = error instanceof Error ? error.message : "Failed to load file";

  const getViewerUrl = () => {
    if (isOfficeDoc) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
  };

  const headerContent = (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="truncate text-lg font-semibold">{fileName}</div>
        <div className="mt-1 text-sm text-muted-foreground">{fileType}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={fileUrl} download={fileName} aria-label="Download file">
            <Download className="size-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );

  const contentView = !fileUrl ? null : isPDF ? (
    <EmbeddedFrame src={fileUrl} fileName={fileName} fileUrl={fileUrl} />
  ) : isTextFile ? (
    isLoading ? (
      renderStatus("Loading...")
    ) : isError ? (
      renderStatus(errorMessage)
    ) : (
      <ScrollArea className="h-full">
        <div className="p-6">
          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
            {textFileContent}
          </pre>
        </div>
      </ScrollArea>
    )
  ) : isCSV ? (
    isLoading ? (
      renderStatus("Loading...")
    ) : isError ? (
      renderStatus(errorMessage)
    ) : textFileContent !== null ? (
      renderCSV(textFileContent)
    ) : (
      renderStatus("No content available")
    )
  ) : isOfficeDoc ? (
    <EmbeddedFrame src={getViewerUrl()} fileName={fileName} fileUrl={fileUrl} />
  ) : (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-muted-foreground">Preview not available for this file type</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href={fileUrl} download={fileName}>
            <Download />
            Download File
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Open in New Tab
          </Link>
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open && !!fileUrl} onOpenChange={onClose}>
        <DrawerContent className="h-[80vh] p-0 flex flex-col">
          <DrawerHeader className="p-4 border-b bg-muted/30">
            <DrawerTitle className="sr-only">{fileName}</DrawerTitle>
            <DrawerDescription className="sr-only">{fileType}</DrawerDescription>
            {headerContent}
          </DrawerHeader>
          <div className="flex-1 overflow-hidden bg-muted/10">{contentView}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open && !!fileUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <DialogDescription className="sr-only">{fileType}</DialogDescription>
          {headerContent}
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-muted/10">{contentView}</div>
      </DialogContent>
    </Dialog>
  );
}
