"use client";

import { BookOpen, ExternalLink, FileText } from "lucide-react";
import { memo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scrollArea";
import type { Citation } from "@/types/deep-research";
import Link from "next/link";

interface SourcesSheetProps {
  citations: Citation[];
  trigger?: React.ReactNode;
}

function SourcesSheetComponent({ citations, trigger }: SourcesSheetProps) {
  const [open, setOpen] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80 transition-colors gap-1.5 focus:outline-none focus-visible:ring-0"
          >
            <BookOpen className="size-3" />
            {citations.length} {citations.length === 1 ? 'Source' : 'Sources'}
          </Badge>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:w-[90vw] sm:max-w-[600px] md:max-w-[700px] lg:max-w-[800px] p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          <SheetHeader className="flex-shrink-0 px-4 sm:px-6 pt-6 pb-4 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2.5 text-base sm:text-lg">
              <div className="flex items-center justify-center size-7 sm:size-8 rounded-lg bg-primary/10">
                <BookOpen className="size-3.5 sm:size-4 text-primary" />
              </div>
              <span className="truncate">References & Sources</span>
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm pt-1">
              {citations.length} {citations.length === 1 ? 'citation' : 'citations'} from this research
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 space-y-3">
              {citations.map((citation, index) => (
                <div
                  key={citation.id || index}
                  className="group relative rounded-lg border border-border/60 bg-card/30 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:bg-card/50 hover:shadow-md overflow-hidden"
                >
                  <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                    <div className="flex-shrink-0 flex items-start pt-0.5">
                      <div className="flex size-6 sm:size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-xs sm:text-sm font-semibold text-primary ring-1 ring-primary/10">
                        {index + 1}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-2.5 overflow-hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5 overflow-hidden">
                          <h4 className="text-sm sm:text-[15px] font-semibold leading-snug text-foreground tracking-tight break-words pr-1">
                            {citation.source}
                          </h4>
                          
                          {(citation.author || citation.year) && (
                            <div className="flex items-center gap-2 text-xs sm:text-[13px] text-muted-foreground flex-wrap">
                              {citation.author && (
                                <span className="font-medium text-foreground/60 break-words">
                                  {citation.author}
                                </span>
                              )}
                              {citation.author && citation.year && (
                                <span className="text-muted-foreground/40">•</span>
                              )}
                              {citation.year && (
                                <span className="text-muted-foreground/80">{citation.year}</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {citation.url && (
                          <Link
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 flex items-center justify-center size-8 sm:size-9 rounded-lg border border-border/50 bg-background/50 text-primary transition-all hover:bg-primary/10 hover:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Open source"
                          >
                            <ExternalLink className="size-3.5 sm:size-4" />
                          </Link>
                        )}
                      </div>
                      
                      {citation.relevance && (
                        <div className="flex gap-2 sm:gap-2.5 items-start rounded-lg bg-muted/30 px-2.5 sm:px-3 py-2 sm:py-2.5 border border-border/30 overflow-hidden">
                          <FileText className="size-3 sm:size-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
                          <p className="text-xs sm:text-[13px] text-muted-foreground/90 leading-relaxed break-words">
                            {citation.relevance}
                          </p>
                        </div>
                      )}
                      
                      {citation.url && (
                        <div className="pt-0.5 overflow-hidden">
                          <Link
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] sm:text-[12px] text-primary/60 hover:text-primary transition-colors block font-mono focus:outline-none focus-visible:underline break-all"
                          >
                            {citation.url}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const SourcesSheet = memo(SourcesSheetComponent);
