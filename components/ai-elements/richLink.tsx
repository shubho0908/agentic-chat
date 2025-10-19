"use client";

import { ExternalLink, Globe, Link2, Loader } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  domain: string;
}

interface RichLinkProps {
  url: string;
  className?: string;
  variant?: "default" | "compact" | "minimal";
}

const SafeImage = ({ 
  src, 
  alt, 
  size, 
  className, 
  fallback 
}: { 
  src?: string; 
  alt: string; 
  size: number; 
  className?: string;
  fallback: React.ReactNode;
}) => {
  const [error, setError] = useState(false);
  
  if (!src || error) return <>{fallback}</>;
  
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setError(true)}
      unoptimized
    />
  );
};

const fetchLinkMetadata = async (url: string): Promise<LinkMetadata> => {
  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export function RichLink({ url, className, variant = "default" }: RichLinkProps) {
  const { data: metadata, isLoading, isError } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => fetchLinkMetadata(url),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (isLoading) {
    return (
      <div className={cn("inline-block w-full max-w-2xl", className)}>
        <Card className="group relative overflow-hidden border border-border/40 bg-gradient-to-br from-card/90 via-card/80 to-card/90 backdrop-blur-xl shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-100 transition-opacity duration-500" />
          <CardContent className="relative p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Loader className="size-5 animate-spin text-primary/60" />
                <div className="absolute inset-0 size-5 animate-ping rounded-full bg-primary/20" />
              </div>
              <div className="flex-1 space-y-2.5">
                <div className="h-4 w-3/4 animate-pulse rounded-lg bg-gradient-to-r from-muted via-muted/60 to-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded-lg bg-gradient-to-r from-muted/60 via-muted/40 to-muted/60" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !metadata) {
    return (
      <Link
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-primary hover:underline"
      >
        <Link2 className="size-3.5" />
        <span className="text-sm break-all">{url}</span>
        <ExternalLink className="size-3 flex-shrink-0" />
      </Link>
    );
  }

  const displayTitle = metadata.title || metadata.siteName || metadata.domain || "Link";
  const displaySite = metadata.siteName || metadata.domain;

  if (variant === "minimal") {
    return (
      <Link
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative inline-flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3.5 py-2 transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:shadow-lg hover:shadow-white/10"
      >
        <SafeImage
          src={metadata.favicon}
          alt=""
          size={16}
          className="relative size-4 flex-shrink-0 rounded transition-transform duration-300 group-hover:scale-110 brightness-0 invert"
          fallback={<Globe className="size-4 flex-shrink-0 text-white/90" />}
        />
        <span className="relative text-sm font-semibold text-white/95 transition-colors duration-300 group-hover:text-white truncate">
          {displayTitle}
        </span>
        <ExternalLink className="relative size-3.5 flex-shrink-0 text-white/70 transition-all duration-300 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("inline-block w-full max-w-2xl", className)}>
        <Link href={url} target="_blank" rel="noopener noreferrer" className="group block no-underline">
          <Card className="relative overflow-hidden border border-border/40 bg-gradient-to-br from-card/95 via-card/85 to-card/95 backdrop-blur-xl shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 opacity-100 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/5 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:bg-primary/10" />
            <CardContent className="relative p-3.5">
              <div className="flex items-center gap-3.5">
                <div className="relative size-14 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 shadow-inner ring-1 ring-border/50">
                  {metadata.image ? (
                    <SafeImage
                      src={metadata.image}
                      alt=""
                      size={56}
                      className="object-cover size-full transition-all duration-500 group-hover:scale-110 group-hover:brightness-110"
                      fallback={
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5">
                          <Globe className="size-7 text-primary/70" />
                        </div>
                      }
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5">
                      <Globe className="size-7 text-primary/70 transition-transform duration-500 group-hover:scale-110" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-50 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-foreground transition-colors duration-300 group-hover:text-primary line-clamp-1">
                    {displayTitle}
                  </h4>
                  <div className="flex items-center gap-2 mt-1.5">
                    <SafeImage
                      src={metadata.favicon}
                      alt=""
                      size={14}
                      className="size-3.5 flex-shrink-0 rounded transition-transform duration-300 group-hover:scale-110"
                      fallback={<Globe className="size-3.5 flex-shrink-0 text-muted-foreground/60" />}
                    />
                    <span className="text-xs font-medium text-muted-foreground/80 transition-colors duration-300 group-hover:text-muted-foreground truncate">{displaySite}</span>
                    <div className="ml-auto flex items-center justify-center size-6 rounded-lg bg-primary/10 opacity-0 transition-all duration-300 group-hover:opacity-100">
                      <ExternalLink className="size-3 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("inline-block w-full max-w-2xl", className)}>
      <Link href={url} target="_blank" rel="noopener noreferrer" className="group block no-underline">
        <Card className="relative overflow-hidden border border-border/40 bg-gradient-to-br from-card/95 via-card/90 to-card/95 backdrop-blur-xl shadow-lg transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
          {metadata.image && (
            <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30">
              <SafeImage
                src={metadata.image}
                alt=""
                size={640}
                className="object-cover size-full transition-all duration-700 group-hover:scale-110 group-hover:brightness-110"
                fallback={
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5">
                    <Globe className="size-16 text-primary/40" />
                  </div>
                }
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="absolute top-3 right-3 flex items-center justify-center size-10 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110">
                <ExternalLink className="size-5 text-white" />
              </div>
            </div>
          )}
          <CardContent className="relative p-5">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <h4 className="text-base font-bold leading-tight text-foreground transition-colors duration-300 group-hover:text-primary line-clamp-2">
                    {displayTitle}
                  </h4>
                  {metadata.description && (
                    <p className="text-sm text-muted-foreground/90 transition-colors duration-300 group-hover:text-muted-foreground line-clamp-2 leading-relaxed">
                      {metadata.description}
                    </p>
                  )}
                </div>
                {!metadata.image && (
                  <div className="flex-shrink-0 flex items-center justify-center size-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-inner transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/20">
                    <ExternalLink className="size-5" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2.5 pt-2 border-t border-border/30">
                <div className="flex items-center justify-center size-6 rounded-lg bg-muted/50 p-1 ring-1 ring-border/30">
                  <SafeImage
                    src={metadata.favicon}
                    alt=""
                    size={16}
                    className="size-full rounded transition-transform duration-300 group-hover:scale-110"
                    fallback={<Globe className="size-full text-muted-foreground/60" />}
                  />
                </div>
                <span className="text-xs font-semibold text-muted-foreground/70 transition-colors duration-300 group-hover:text-muted-foreground truncate">{displaySite}</span>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium opacity-0 transition-all duration-300 group-hover:opacity-100">
                  <span>Visit</span>
                  <ExternalLink className="size-3" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
