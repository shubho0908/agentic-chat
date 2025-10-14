"use client";

import { useState } from "react";
import { Download, FileJson, FileText, File, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ExportFormat, ExportConversation } from "@/types/export";
import { downloadJSON } from "@/lib/export/json-exporter";
import { downloadMarkdown } from "@/lib/export/markdown-exporter";
import { downloadPDF } from "@/lib/export/pdf-exporter";
import { ConversationPDF } from "./conversationPdf";
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
          await downloadPDF(
            conversationData,
            <ConversationPDF conversation={conversationData} includeAttachments={true} />
          );
          toast.success('PDF file downloaded successfully');
          break;
      }
    } catch (error) {
      console.error('Export error:', error);
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
        <div className="grid grid-cols-3 gap-2">
          {exportFormats.map((format) => {
            const Icon = format.icon;
            const isSelected = selectedFormat === format.value;
            
            return (
              <Button
                key={format.value}
                type="button"
                onClick={() => setSelectedFormat(format.value)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer",
                  "hover:border-primary/50 hover:bg-accent/50",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background"
                )}
              >
                <Icon className={cn(
                  "size-5 mb-1.5",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}>
                  {format.label}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {format.description}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full"
        size="sm"
      >
        {isExporting ? (
          <>
            <Loader className="size-4 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="size-4" />
            Download {exportFormats.find(f => f.value === selectedFormat)?.label}
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        Export includes all messages{selectedFormat !== 'pdf' ? ', attachments,' : ''} and metadata.
        {selectedFormat === 'json' && ' Perfect for backups and data portability.'}
        {selectedFormat === 'markdown' && ' Easy to read and compatible with most text editors.'}
        {selectedFormat === 'pdf' && ' Professional format suitable for printing and sharing.'}
      </p>
    </div>
  );
}
