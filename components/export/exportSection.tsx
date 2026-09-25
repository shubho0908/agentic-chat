"use client";

import { useState } from "react";
import { Download, FileJson, FileText, File, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { ExportFormat, ExportConversation } from "@/types/export";
import { downloadJSON } from "@/lib/export/jsonExporter";
import { downloadMarkdown } from "@/lib/export/markdownExporter";
import { downloadPDF } from "@/lib/export/pdfExporter";
import { apiRoutes } from "@/lib/routes";
import { toUserFriendlyError } from "@/lib/errorMessages";

interface ExportSectionProps {
  conversationId: string;
}

const exportFormats = [
  {
    value: 'json' as ExportFormat,
    label: 'JSON',
    shortLabel: 'JSON',
    icon: FileJson,
  },
  {
    value: 'markdown' as ExportFormat,
    label: 'Markdown',
    shortLabel: 'Text',
    icon: FileText,
  },
  {
    value: 'pdf' as ExportFormat,
    label: 'PDF',
    shortLabel: 'PDF',
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
      const response = await fetch(apiRoutes.conversationExport(conversationId));
      
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
            const { createConversationPDFDocument } = await import("./createConversationPDFDocument");
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
      toast.error(toUserFriendlyError(error, "Failed to export conversation"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <fieldset className="space-y-3">
      <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl p-1">
        <legend className="sr-only">Download format</legend>
        {exportFormats.map((format) => {
          const Icon = format.icon;
          const isSelected = selectedFormat === format.value;

          return (
            <TabsTrigger
              key={format.value}
              type="button"
              aria-pressed={isSelected}
              data-state={isSelected ? "active" : "inactive"}
              onClick={() => setSelectedFormat(format.value)}
              className="h-full min-h-9 gap-1.5 px-2 text-xs sm:gap-2 data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground dark:data-[state=active]:border-white/15 dark:data-[state=active]:bg-white/[0.12] dark:data-[state=active]:text-foreground"
            >
              <Icon className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />
              <span className="sm:hidden">{format.shortLabel}</span>
              <span className="hidden sm:inline">{format.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        variant="outline"
        className="h-11 w-full gap-2 rounded-lg text-sm sm:h-10 sm:text-[13px]"
      >
        {isExporting ? <Loader className="size-4 animate-spin" /> : <Download className="size-4" />}
        {isExporting
          ? "Preparing…"
          : <span>Download<span className="hidden sm:inline"> {exportFormats.find((format) => format.value === selectedFormat)?.label}</span></span>}
      </Button>
    </fieldset>
  );
}
