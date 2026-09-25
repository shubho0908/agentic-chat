"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const Tabs = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

const TabsList = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-xl border border-border/70 bg-muted/70 p-1 text-muted-foreground shadow-inner",
        className
      )}
      {...props}
    />
  )
}

const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<"button">) => {
  return (
    <button
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[calc(100%-1px)] cursor-pointer flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-muted-foreground transition-[color,background-color,border-color,box-shadow,transform] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.10),0_4px_12px_-8px_rgba(0,0,0,0.30)] dark:data-[state=active]:border-white/15 dark:data-[state=active]:bg-white/[0.12] dark:data-[state=active]:text-foreground dark:data-[state=active]:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_4px_14px_-8px_rgba(0,0,0,0.8)]",
        className
      )}
      {...props}
    />
  )
}

const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
