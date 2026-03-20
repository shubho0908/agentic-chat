"use client";

import { type RefObject, useState, useEffect } from "react";
import { Key, Loader, Cog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OPENAI_MODELS, DEFAULT_MODEL } from "@/constants/openai-models";
import { useApiKey, useApiKeyMutations } from "@/hooks/useApiKey";
import { saveModel, getModel, removeModel } from "@/lib/storage";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { ApiKeyInput } from "./apiKeyInput";
import { ModelSelector } from "./modelSelector";
import { isValidApiKey } from "../utils/byokUtils";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES } from "@/constants/toasts";

interface BYOKProps {
  autoOpen?: boolean;
  onConfigured?: (configured: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  hiddenTrigger?: boolean;
}

function getInitialModelSelection() {
  return getModel() ?? DEFAULT_MODEL;
}

interface BYOKContentProps {
  isConfigured: boolean;
  maskedKey?: string | null;
  updatedAt?: string | null;
  apiKey: string;
  selectedModel: string;
  hasAnyChange: boolean;
  isSaving: boolean;
  onApiKeyChange: (value: string) => void;
  onModelSelect: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onClose: () => void;
}

function BYOKFields({
  isConfigured,
  maskedKey,
  updatedAt,
  apiKey,
  selectedModel,
  onApiKeyChange,
  onModelSelect,
}: Pick<
  BYOKContentProps,
  | "isConfigured"
  | "maskedKey"
  | "updatedAt"
  | "apiKey"
  | "selectedModel"
  | "onApiKeyChange"
  | "onModelSelect"
>) {
  return (
    <div className="grid gap-5 sm:gap-6">
      {isConfigured && maskedKey && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[13px] text-muted-foreground sm:text-xs">Current API Key</p>
              <p className="break-all font-mono text-base sm:text-sm">{maskedKey}</p>
              {updatedAt && (
                <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">
                  Last updated: {new Date(updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <div className="size-2 rounded-full bg-green-500" title="Active" />
            </div>
          </div>
        </div>
      )}

      <ApiKeyInput
        value={apiKey}
        onChange={onApiKeyChange}
        label={isConfigured ? "Update API Key (optional)" : "API Key"}
        description={
          isConfigured
            ? "Enter a new key only if you want to replace the existing one."
            : "Your API key will be encrypted and stored securely."
        }
      />

      <ModelSelector selectedModel={selectedModel} onModelSelect={onModelSelect} />
    </div>
  );
}

function BYOKActions({
  isConfigured,
  hasAnyChange,
  apiKey,
  selectedModel,
  isSaving,
  onSave,
  onClear,
}: Pick<
  BYOKContentProps,
  | "isConfigured"
  | "hasAnyChange"
  | "apiKey"
  | "selectedModel"
  | "isSaving"
  | "onSave"
  | "onClear"
>) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {isConfigured && (
        <Button className="h-11 w-full rounded-xl text-sm sm:h-9 sm:w-auto" variant="outline" onClick={onClear}>
          Clear Settings
        </Button>
      )}
      <Button
        className="h-11 w-full rounded-xl text-sm sm:h-9 sm:w-auto"
        onClick={onSave}
        disabled={
          (!isConfigured && !apiKey.trim()) ||
          (isConfigured && !hasAnyChange) ||
          !selectedModel ||
          (apiKey.trim() && !isValidApiKey(apiKey)) ||
          isSaving
        }
      >
        {isSaving ? (
          <Loader className="size-4 animate-spin" />
        ) : (
          <span>{isConfigured ? "Update Settings" : "Save Configuration"}</span>
        )}
      </Button>
    </div>
  );
}

export function BYOK({
  autoOpen = false,
  onConfigured,
  triggerRef,
  hiddenTrigger = false,
}: BYOKProps = {}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(getInitialModelSelection);
  const [initialModel, setInitialModel] = useState(getInitialModelSelection);

  const { data: apiKeyData, isLoading } = useApiKey();
  const { saveApiKey: saveApiKeyMutation, deleteApiKey: deleteApiKeyMutation } = useApiKeyMutations();

  const isConfigured = apiKeyData?.exists ?? false;
  const hasApiKeyChange = apiKey.trim().length > 0;
  const hasModelChange = selectedModel !== initialModel;
  const hasAnyChange = hasApiKeyChange || hasModelChange;

  useEffect(() => {
    if (!isLoading) {
      onConfigured?.(isConfigured);

      if (!isConfigured && autoOpen) {
        const timer = setTimeout(() => {
          setOpen(true);
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [isConfigured, isLoading, autoOpen, onConfigured]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setApiKey("");
      const storedModel = getModel();
      if (storedModel) {
        setSelectedModel(storedModel);
        setInitialModel(storedModel);
      }
    }
    setOpen(newOpen);
  };

  const handleSave = async () => {
    if (!isConfigured && !apiKey.trim()) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.ENTER_KEY);
      return;
    }

    if (apiKey.trim() && !isValidApiKey(apiKey)) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.INVALID_FORMAT, {
        description: TOAST_ERROR_MESSAGES.API_KEY.INVALID_FORMAT_DESCRIPTION
      });
      return;
    }

    try {
      if (apiKey.trim()) {
        await saveApiKeyMutation.mutateAsync(apiKey);
      }
      
      const modelSaved = saveModel(selectedModel);

      if (modelSaved) {
        setApiKey("");
        setInitialModel(selectedModel);
        toast.success(TOAST_SUCCESS_MESSAGES.SETTINGS_SAVED, {
          description: `Model: ${OPENAI_MODELS.find(m => m.id === selectedModel)?.name}`,
        });
        setOpen(false);
      } else {
        toast.error(TOAST_ERROR_MESSAGES.MODEL.FAILED_SAVE);
      }
    } catch (error) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.FAILED_SAVE, {
        description: error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  const handleClear = async () => {
    try {
      await deleteApiKeyMutation.mutateAsync();
      removeModel();
      setApiKey("");
      setSelectedModel(DEFAULT_MODEL);
      setInitialModel(DEFAULT_MODEL);
      toast.success(TOAST_SUCCESS_MESSAGES.SETTINGS_CLEARED);
    } catch (error) {
      toast.error(TOAST_ERROR_MESSAGES.API_KEY.FAILED_CLEAR, {
        description: error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  if (isLoading && !hiddenTrigger) {
    return <Skeleton className="h-9 w-10 md:w-24 rounded-xl" />;
  }

  const trigger = (
    <Button
      ref={triggerRef}
      variant={isConfigured ? "outline" : "default"}
      size="sm"
      className={cn(
        "gap-2 rounded-xl transition-all",
        hiddenTrigger &&
          "pointer-events-none absolute h-0 w-0 overflow-hidden border-0 p-0 opacity-0",
        isConfigured
          ? "shadow-sm hover:shadow-md"
          : "shadow-md hover:shadow-lg"
      )}
      tabIndex={hiddenTrigger ? -1 : 0}
      aria-hidden={hiddenTrigger}
    >
      {isConfigured ? (
        <>
          <Cog className="size-4" />
          <span className="hidden sm:inline">API Settings</span>
        </>
      ) : (
        <>
          <Key className="size-4" />
          <span className="hidden sm:inline">Setup API Key</span>
        </>
      )}
    </Button>
  );

  const contentProps: BYOKContentProps = {
    isConfigured,
    maskedKey: apiKeyData?.maskedKey,
    updatedAt: apiKeyData?.updatedAt,
    apiKey,
    selectedModel,
    hasAnyChange,
    isSaving: saveApiKeyMutation.isPending,
    onApiKeyChange: setApiKey,
    onModelSelect: setSelectedModel,
    onSave: handleSave,
    onClear: handleClear,
    onClose: () => handleOpenChange(false),
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[92dvh] overflow-hidden p-0">
          <div className="flex min-h-0 flex-col">
            <div className="relative border-b px-4 pb-4 pt-3">
              <div className="pr-10">
                <DrawerTitle className="text-left text-lg leading-tight sm:text-xl">OpenAI API Configuration</DrawerTitle>
                <DrawerDescription className="mt-1 text-left text-[13px] leading-5 text-muted-foreground sm:text-sm">
                  Configure your OpenAI API key and select a model. Your credentials are stored securely in your browser.
                </DrawerDescription>
              </div>
              <button
                type="button"
                onClick={contentProps.onClose}
                className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2"
                aria-label="Close API configuration"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <BYOKFields {...contentProps} />
            </div>

            <div className="border-t bg-background px-4 py-4 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
              <BYOKActions {...contentProps} />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[min(calc(100vw-1rem),500px)] overflow-hidden p-0 sm:w-full sm:max-w-[500px] focus-visible:outline-none">
        <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="text-lg leading-tight sm:text-xl">OpenAI API Configuration</DialogTitle>
          <DialogDescription className="text-[13px] leading-5 sm:text-sm">
            Configure your OpenAI API key and select a model. Your credentials
            are stored securely in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <BYOKFields {...contentProps} />
        </div>

        <div className="border-t px-4 py-4 sm:px-6 sm:py-5">
          <BYOKActions {...contentProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
