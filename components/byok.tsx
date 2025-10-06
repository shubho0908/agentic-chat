"use client";

import { type RefObject, useState, useEffect } from "react";
import { Key, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OPENAI_MODELS, DEFAULT_MODEL } from "@/constants/openai-models";
import { useApiKey, useApiKeyMutations } from "@/hooks/useApiKey";
import { saveModel, getModel, removeModel } from "@/lib/storage";
import { toast } from "sonner";
import { ApiKeyInput } from "./apiKeyInput";
import { ModelSelector } from "./modelSelector";
import { isValidApiKey } from "../utils/byokUtils";

interface BYOKProps {
  autoOpen?: boolean;
  onConfigured?: (configured: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function BYOK({ autoOpen = false, onConfigured, triggerRef }: BYOKProps = {}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  const { data: apiKeyData, isLoading } = useApiKey();
  const { saveApiKey: saveApiKeyMutation, deleteApiKey: deleteApiKeyMutation } = useApiKeyMutations();

  const isConfigured = apiKeyData?.exists ?? false;

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

  useEffect(() => {
    const storedModel = getModel();
    if (storedModel) {
      setSelectedModel(storedModel);
    }
  }, []);

  const handleSave = async () => {
    if (!isConfigured && !apiKey.trim()) {
      toast.error("Please enter your OpenAI API key");
      return;
    }

    if (apiKey.trim() && !isValidApiKey(apiKey)) {
      toast.error("Invalid API key format", {
        description: "Valid formats: sk-..., sk-proj-..., or sk-svcacct-..."
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
        toast.success("Settings saved successfully", {
          description: `Model: ${OPENAI_MODELS.find(m => m.id === selectedModel)?.name}`,
        });
        setOpen(false);
      } else {
        toast.error("Failed to save model preference");
      }
    } catch (error) {
      toast.error("Failed to save API key", {
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
      toast.success("Settings cleared");
    } catch (error) {
      toast.error("Failed to clear settings", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          variant={isConfigured ? "outline" : "default"}
          size="sm"
          className={cn(
            "gap-2 rounded-xl transition-all",
            isConfigured
              ? "bg-background/80 backdrop-blur-sm shadow-sm hover:shadow-md"
              : "shadow-md hover:shadow-lg"
          )}
        >
          {isConfigured ? (
            <>
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">API Settings</span>
            </>
          ) : (
            <>
              <Key className="size-4" />
              <span className="hidden sm:inline">Setup API Key</span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto focus-visible:outline-none">
        <DialogHeader>
          <DialogTitle>OpenAI API Configuration</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Configure your OpenAI API key and select a model. Your credentials
            are stored securely in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:gap-6 py-3 sm:py-4">
          {isConfigured && apiKeyData?.maskedKey && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Current API Key</p>
                  <p className="text-sm font-mono break-all">{apiKeyData.maskedKey}</p>
                  {apiKeyData.updatedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last updated: {new Date(apiKeyData.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <div className="size-2 rounded-full bg-green-500" title="Active" />
                </div>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="api-key" className="text-sm">
              {isConfigured ? "Update API Key (optional)" : "API Key"}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {isConfigured 
                ? "Enter a new key only if you want to replace the existing one" 
                : "Your API key will be encrypted and stored securely"}
            </p>
            <ApiKeyInput value={apiKey} onChange={setApiKey} />
          </div>
          <ModelSelector selectedModel={selectedModel} onModelSelect={setSelectedModel} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {isConfigured && (
            <Button className="rounded-xl text-sm" variant="outline" onClick={handleClear}>
              <span className="hidden xs:inline">Clear Settings</span>
              <span className="xs:hidden">Clear</span>
            </Button>
          )}
          <Button
            className="rounded-xl text-sm"
            onClick={handleSave}
            disabled={
              (!isConfigured && !apiKey.trim()) || 
              !selectedModel || 
              (apiKey.trim() && !isValidApiKey(apiKey)) || 
              saveApiKeyMutation.isPending
            }
          >
            <span className="hidden xs:inline">
              {saveApiKeyMutation.isPending ? "Saving..." : isConfigured ? "Update Settings" : "Save Configuration"}
            </span>
            <span className="xs:hidden">
              {saveApiKeyMutation.isPending ? "..." : "Save"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
