"use client";

import { Download, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollArea";
import { useIsMobile } from "@/hooks/useMobile";
import Link from "next/link";

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
    queryKey: ["textFileContent", fileUrl],
    queryFn: () => fetchTextFile(fileUrl),
    enabled: open && !!fileUrl && (isTextFile || isCSV),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const textFileContent = fetchedContent ?? null;
  const errorMessage = error instanceof Error ? error.message : "Failed to load file";

  const renderCSV = (content: string) => {
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
  };

  const renderStatus = (message: string) => (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );

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
    <iframe src={fileUrl} className="w-full h-full border-0" title={fileName} />
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
    <iframe src={getViewerUrl()} className="w-full h-full border-0" title={fileName} />
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
          <DrawerHeader className="px-4 py-4 border-b bg-muted/30">
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
