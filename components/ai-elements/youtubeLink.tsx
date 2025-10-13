"use client";

import { ExternalLink, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface YouTubeLinkProps {
  url: string;
  videoId: string;
  className?: string;
  showThumbnail?: boolean;
}

export function YouTubeLink({ url, videoId, className, showThumbnail = true }: YouTubeLinkProps) {
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;

  if (showThumbnail) {
    return (
      <div className={cn("inline-block w-full max-w-lg", className)}>
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-block no-underline w-full"
        >
          <Card className="overflow-hidden border-red-200 dark:border-red-900/50 hover:border-red-400 dark:hover:border-red-700 transition-all hover:shadow-lg hover:shadow-red-500/20 bg-gradient-to-br from-red-50/50 to-red-100/30 dark:from-red-950/20 dark:to-red-900/10">
            <div className="relative aspect-video bg-black overflow-hidden">
              <Image
                src={thumbnailUrl}
                alt="YouTube video thumbnail"
                fill
                className="object-cover group-hover:opacity-90 transition-opacity"
                unoptimized
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <div className="bg-red-600 group-hover:bg-red-700 rounded-full p-3 transition-all group-hover:scale-110 shadow-lg">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </div>
            </div>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="#FF0000">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                  Watch on YouTube
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block"
    >
      <Badge 
        className={cn(
          "gap-2 px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-red-400 shadow-sm hover:shadow-lg hover:shadow-red-500/30 transition-all cursor-pointer",
          className
        )}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
        <span>YouTube Video</span>
        <ExternalLink className="w-3 h-3" />
      </Badge>
    </Link>
  );
}
