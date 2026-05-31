import type { ReactElement } from "react";
import type { ExportConversation } from "@/types/export";
import { styles } from "./pdfStyles";
import { MessageComponent } from "./conversationPdf";

export async function createConversationPDFDocument(
  conversation: ExportConversation,
  includeAttachments = true,
): Promise<ReactElement> {
  const { Document, Page, Text, View } = await import("@react-pdf/renderer");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.title}>
            {conversation.title || "Untitled Conversation"}
          </Text>
          <View style={styles.metadata}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Created:</Text>
              <Text style={styles.metadataValue}>
                {formatDate(conversation.createdAt)}
              </Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Updated:</Text>
              <Text style={styles.metadataValue}>
                {formatDate(conversation.updatedAt)}
              </Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Exported:</Text>
              <Text style={styles.metadataValue}>
                {formatDate(conversation.exportedAt)}
              </Text>
            </View>
            {conversation.user?.name ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>User:</Text>
                <Text style={styles.metadataValue}>{conversation.user.name}</Text>
              </View>
            ) : null}
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Messages:</Text>
              <Text style={styles.metadataValue}>{conversation.messages.length}</Text>
            </View>
          </View>
        </View>

        {conversation.messages.map((message, index) => (
          <MessageComponent
            key={message.id}
            message={message}
            index={index + 1}
            includeAttachments={includeAttachments}
            Text={Text}
            View={View}
          />
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
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
