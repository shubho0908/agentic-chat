"use client"

import { STRING_ENUM } from "@/constants/stringEnums";
import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerOverlay = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay> & {
  ref?: React.Ref<React.ElementRef<typeof DrawerPrimitive.Overlay>>
}) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-md", className)}
    {...props}
  />
)

const DrawerContent = ({
  className,
  children,
  variant = "default",
  showHandle = variant === STRING_ENUM.DEFAULT,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
  variant?: "default" | "bare"
  showHandle?: boolean
  ref?: React.Ref<React.ElementRef<typeof DrawerPrimitive.Content>>
}) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex h-auto flex-col",
        variant === STRING_ENUM.DEFAULT &&
          "mt-24 rounded-t-3xl border border-black/5 bg-background/95 shadow-[var(--shadow-apple)] supports-[backdrop-filter]:bg-background/80 backdrop-blur-2xl dark:border-white/10",
        variant === STRING_ENUM.BARE && "inset-y-0",
        className
      )}
      {...props}
    >
      {showHandle && <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
)

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerTitle = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> & {
  ref?: React.Ref<React.ElementRef<typeof DrawerPrimitive.Title>>
}) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
)

const DrawerDescription = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description> & {
  ref?: React.Ref<React.ElementRef<typeof DrawerPrimitive.Description>>
}) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
)

export {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
}
