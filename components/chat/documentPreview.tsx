"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollArea";

interface DocumentPreviewProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  open: boolean;
  onClose: () => void;
}

export function DocumentPreview({ fileUrl, fileName, fileType, open, onClose }: DocumentPreviewProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isPDF = fileType === "application/pdf" || fileName.endsWith(".pdf");
  const isTextFile = fileType.startsWith("text/") || fileName.endsWith(".txt");
  const isCSV = fileType === "text/csv" || fileName.endsWith(".csv");
  const isOfficeDoc = fileType.includes("wordprocessingml") || 
                      fileType.includes("spreadsheetml") || 
                      fileName.match(/\.(docx?|xlsx?|pptx?)$/);

  useEffect(() => {
    if (open && (isTextFile || isCSV)) {
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{fileName}</DialogTitle>
              <DialogDescription className="mt-1">{fileType}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
              >
                <a
                  href={fileUrl}
                  download={fileName}
                  aria-label="Download file"
                >
                  <Download className="size-4" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                asChild
              >
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/10">
          {isPDF ? (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : isTextFile && textContent !== null ? (
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
                  <a href={fileUrl} download={fileName}>
                    <Download />
                    Download File
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    Open in New Tab
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
