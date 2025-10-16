import { BookOpen, ExternalLink, FileText } from "lucide-react";
import { memo } from "react";
import type { Citation } from "@/types/tools";

interface CitationsDisplayProps {
  citations: Citation[];
}

function CitationsDisplayComponent({ citations }: CitationsDisplayProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center justify-center size-5 rounded-md bg-primary/10">
          <BookOpen className="size-3 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          References & Sources
        </h3>
        <span className="text-xs text-muted-foreground">
          ({citations.length})
        </span>
      </div>
      
      <div className="grid gap-3">
        {citations.map((citation, index) => (
          <div
            key={citation.id || index}
            className="group relative rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm cursor-pointer"
          >
            <div className="flex gap-3 p-4">
              <div className="flex-shrink-0 flex items-start pt-0.5">
                <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </div>
              </div>
              
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                      {citation.source}
                    </h4>
                    
                    {(citation.author || citation.year) && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        {citation.author && (
                          <span className="font-medium text-foreground/70">
                            {citation.author}
                          </span>
                        )}
                        {citation.author && citation.year && (
                          <span className="text-muted-foreground/50">•</span>
                        )}
                        {citation.year && (
                          <span>{citation.year}</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {citation.url && (
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center justify-center size-8 rounded-md border border-transparent bg-primary/5 text-primary transition-colors hover:bg-primary/10 hover:border-primary/20 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Open source"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                
                {citation.relevance && (
                  <div className="flex gap-2 items-start">
                    <FileText className="size-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {citation.relevance}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CitationsDisplay = memo(CitationsDisplayComponent);
