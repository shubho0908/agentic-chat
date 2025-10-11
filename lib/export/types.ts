interface ExportAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface ExportMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  timestamp?: number;
  attachments?: ExportAttachment[];
  versions?: ExportMessage[];
}

export interface ExportConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string | null;
    email: string;
  };
  messages: ExportMessage[];
  exportedAt: string;
  version: string;
}

export type ExportFormat = 'json' | 'markdown' | 'pdf';

export interface ExportOptions {
  includeAttachments?: boolean;
  includeVersions?: boolean;
  includeMetadata?: boolean;
}
