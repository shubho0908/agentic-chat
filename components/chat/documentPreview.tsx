"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollArea";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "next/link";

interface DocumentPreviewProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  open: boolean;
  onClose: () => void;
}

export function DocumentPreview({ fileUrl, fileName, fileType, open, onClose }: DocumentPreviewProps) {
  const isMobile = useIsMobile();
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isPDF = fileType === "application/pdf" || fileName.endsWith(".pdf");
  const isCSV = fileType === "text/csv" || fileName.endsWith(".csv");
  const isTextFile = (fileType.startsWith("text/") || fileName.endsWith(".txt")) && !isCSV;
  const isOfficeDoc = fileType.includes("wordprocessingml") ||
    fileType.includes("spreadsheetml") ||
    fileName.match(/\.(docx?|xlsx?|pptx?)$/);

  useEffect(() => {
    if (open && fileUrl && (isTextFile || isCSV)) {
      setIsLoading(true);
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Error loading text file:", err);
          setIsLoading(false);
        });
    }
  }, [fileUrl, isTextFile, isCSV, open]);

  const renderCSV = (content: string) => {
    const rows = content.split('\n').map(row => row.split(','));
    const headers = rows[0] || [];
    const dataRows = rows.slice(1);

    return (
      <ScrollArea className="h-[70vh]">
        <div className="p-4">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-background border-b-2">
              <tr>
                {headers.map((header, idx) => (
                  <th key={idx} className="px-4 py-2 text-left text-sm font-semibold border">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b hover:bg-muted/30">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-4 py-2 text-sm border">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    );
  };

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
        <Button
          variant="ghost"
          size="icon"
          asChild
        >
          <Link
            href={fileUrl}
            download={fileName}
            aria-label="Download file"
          >
            <Download className="size-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          asChild
        >
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
    <iframe
      src={fileUrl}
      className="w-full h-full border-0"
      title={fileName}
    />
  ) : isTextFile ? (
    <ScrollArea className="h-full">
      <div className="p-6">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words">
          {isLoading ? "Loading..." : textContent}
        </pre>
      </div>
    </ScrollArea>
  ) : isCSV && textContent !== null ? (
    isLoading ? (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    ) : (
      renderCSV(textContent)
    )
  ) : isOfficeDoc ? (
    <iframe
      src={getViewerUrl()}
      className="w-full h-full border-0"
      title={fileName}
    />
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
          <div className="flex-1 overflow-hidden bg-muted/10">
            {contentView}
          </div>
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
        <div className="flex-1 overflow-hidden bg-muted/10">
          {contentView}
        </div>
      </DialogContent>
    </Dialog>
  );
}
