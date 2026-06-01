import type { ElementType } from "react";
import type { ExportMessage } from "@/types/export";
import { styles } from "./pdfStyles";

interface MessageComponentProps {
  message: ExportMessage;
  index: number;
  includeAttachments: boolean;
  userName?: string | null;
  Text: ElementType;
  View: ElementType;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function MessageComponent({
  message,
  index,
  includeAttachments,
  userName,
  Text,
  View,
}: MessageComponentProps) {
  const isUser = message.role === "user";

  return (
    <View style={styles.messageContainer} break={message.content.length > 500}>
      <View style={styles.messageHeader}>
        <View style={styles.messageHeaderRow}>
          <Text style={styles.messageRole}>
            {isUser ? (userName || "User") : "Assistant"} - Message {index}
          </Text>
          <Text style={styles.messageTime}>{formatDate(message.createdAt)}</Text>
        </View>
      </View>

      <Text style={styles.messageContent}>{message.content}</Text>

      {includeAttachments && message.attachments && message.attachments.length > 0 ? (
        <View style={styles.attachmentsSection}>
          <Text style={styles.attachmentsTitle}>
            Attachments ({message.attachments.length})
          </Text>
          {message.attachments.map((attachment, idx) => (
            <View key={attachment.id || idx} style={styles.attachment}>
              <Text>
                <Text style={styles.attachmentName}>{attachment.fileName}</Text>
                {" - "}
                <Text>{formatFileSize(attachment.fileSize)}</Text>
                {" - "}
                <Text>{attachment.fileType}</Text>
              </Text>
              <Text style={styles.attachmentUrl}>{attachment.fileUrl}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) {
    return "Date unavailable";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
