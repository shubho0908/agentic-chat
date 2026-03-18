"use client";

import { useState } from "react";
import { Download, FileJson, FileText, File, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ExportFormat, ExportConversation } from "@/types/export";
import { downloadJSON } from "@/lib/export/jsonExporter";
import { downloadMarkdown } from "@/lib/export/markdownExporter";
import { downloadPDF } from "@/lib/export/pdfExporter";
import { cn } from "@/lib/utils";


interface ExportSectionProps {
  conversationId: string;
}

const exportFormats = [
  {
    value: 'json' as ExportFormat,
    label: 'JSON',
    description: 'Machine-readable format',
    icon: FileJson,
  },
  {
    value: 'markdown' as ExportFormat,
    label: 'Markdown',
    description: 'Human-readable text',
    icon: FileText,
  },
  {
    value: 'pdf' as ExportFormat,
    label: 'PDF',
    description: 'Professional document',
    icon: File,
  },
];

import { logger } from "@/lib/logger";
export function ExportSection({ conversationId }: ExportSectionProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/export`);
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch conversation data';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            errorMessage = response.statusText || errorMessage;
          }
        }
        
        throw new Error(errorMessage);
      }

      const conversationData: ExportConversation = await response.json();

      switch (selectedFormat) {
        case 'json':
          downloadJSON(conversationData, { includeAttachments: true, includeVersions: true });
          toast.success('JSON file downloaded successfully');
          break;
        case 'markdown':
          downloadMarkdown(conversationData, { includeAttachments: true, includeVersions: false });
          toast.success('Markdown file downloaded successfully');
          break;
        case 'pdf':
          {
            const { createConversationPDFDocument } = await import("./conversationPdf");
            await downloadPDF(
              conversationData,
              await createConversationPDFDocument(conversationData, true)
            );
          }
          toast.success('PDF file downloaded successfully');
          break;
      }
    } catch (error) {
      logger.error('Export error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export conversation');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-3 block">
          Export conversation
        </Label>
        <div className="grid grid-cols-3 gap-3">
          {exportFormats.map((format) => {
            const Icon = format.icon;
            const isSelected = selectedFormat === format.value;
            
            return (
              <button
                key={format.value}
                type="button"
                onClick={() => setSelectedFormat(format.value)}
                className={cn(
                  "group relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl transition-all duration-300 ease-out cursor-pointer outline-none",
                  "active:scale-[0.98]",
                  isSelected
                    ? "bg-primary/[0.04] dark:bg-primary/[0.08] shadow-sm ring-2 ring-primary"
                    : "bg-background hover:bg-accent/40 ring-1 ring-border/50 hover:ring-border/80 hover:shadow-sm"
                )}
              >
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary animate-in fade-in zoom-in-50 duration-300 shadow-[0_0_8px_rgba(0,0,0,0.5)] dark:shadow-[0_0_8px_rgba(255,255,255,0.5)] shadow-primary/50" />
                  </div>
                )}
                
                <div className={cn(
                  "flex items-center justify-center p-2.5 rounded-full mb-3 transition-colors duration-300",
                  isSelected 
                    ? "bg-primary/10 text-primary" 
                    : "bg-muted/60 text-muted-foreground group-hover:text-foreground group-hover:bg-muted/80"
                )}>
                  <Icon className="size-4 sm:size-5" />
                </div>
                
                <span className={cn(
                  "text-xs sm:text-sm font-semibold mb-1 transition-colors duration-300",
                  isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  {format.label}
                </span>
                
                <span className={cn(
                  "text-[10px] text-center leading-tight transition-colors duration-300 line-clamp-2 px-1 text-balance",
                  isSelected ? "text-muted-foreground" : "text-muted-foreground/70 group-hover:text-muted-foreground/90"
                )}>
                  {format.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full group rounded-lg transition-all duration-300 ease-out active:scale-[0.98]"
      >
        {isExporting ? (
          <>
            <Loader className="size-4 animate-spin mr-2" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="size-4 mr-2 group-hover:-translate-y-0.5 transition-transform duration-300" />
            Download {exportFormats.find(f => f.value === selectedFormat)?.label}
          </>
        )}
      </Button>

      <p className="text-[11px] text-center text-muted-foreground/70 leading-relaxed text-balance pt-1">
        Export includes all messages{selectedFormat !== 'pdf' ? ', attachments,' : ''} and metadata.
        {selectedFormat === 'json' && ' Perfect for backups and data portability.'}
        {selectedFormat === 'markdown' && ' Easy to read and compatible with most text editors.'}
        {selectedFormat === 'pdf' && ' Professional format suitable for printing and sharing.'}
      </p>
    </div>
  );
}
