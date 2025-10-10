import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ExportConversation, ExportMessage } from '@/lib/export/types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: 1.5,
    borderBottomColor: '#000000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000000',
  },
  metadata: {
    fontSize: 8,
    color: '#666666',
    marginTop: 5,
    lineHeight: 1.4,
  },
  metadataRow: {
    flexDirection: 'row',
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  metadataLabel: {
    fontWeight: 'bold',
    width: 65,
    marginRight: 5,
  },
  metadataValue: {
    flex: 1,
  },
  messageContainer: {
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#fafafa',
    borderRadius: 2,
    borderLeft: 2,
    borderLeftColor: '#000000',
  },
  messageHeader: {
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: 0.5,
    borderBottomColor: '#cccccc',
  },
  messageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  messageRole: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    marginRight: 10,
  },
  messageTime: {
    fontSize: 7,
    color: '#666666',
  },
  messageContent: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#000000',
  },
  attachmentsSection: {
    marginTop: 8,
    paddingTop: 6,
    borderTop: 0.5,
    borderTopColor: '#cccccc',
  },
  attachmentsTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  attachment: {
    fontSize: 7,
    color: '#333333',
    marginBottom: 4,
    paddingLeft: 8,
    lineHeight: 1.4,
  },
  attachmentName: {
    fontWeight: 'bold',
    color: '#000000',
  },
  attachmentUrl: {
    fontSize: 6,
    color: '#666666',
    marginTop: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#666666',
    borderTop: 0.5,
    borderTopColor: '#cccccc',
    paddingTop: 8,
  },
});

interface ConversationPDFProps {
  conversation: ExportConversation;
  includeAttachments?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatFileSize(bytes: number): string {
  return (bytes / 1024).toFixed(2) + ' KB';
}

const MessageComponent: React.FC<{ message: ExportMessage; index: number; includeAttachments: boolean }> = ({
  message,
  index,
  includeAttachments,
}) => {
  const isUser = message.role === 'user';
  
  return (
    <View style={styles.messageContainer} break={message.content.length > 500}>
      <View style={styles.messageHeader}>
        <View style={styles.messageHeaderRow}>
          <Text style={styles.messageRole}>
            {isUser ? 'User' : 'Assistant'} - Message {index}
          </Text>
          <Text style={styles.messageTime}>{formatDate(message.createdAt)}</Text>
        </View>
      </View>
      
      <Text style={styles.messageContent}>{message.content}</Text>
      
      {includeAttachments && message.attachments && message.attachments.length > 0 && (
        <View style={styles.attachmentsSection}>
          <Text style={styles.attachmentsTitle}>
            Attachments ({message.attachments.length})
          </Text>
          {message.attachments.map((attachment, idx) => (
            <View key={attachment.id || idx} style={styles.attachment}>
              <Text>
                <Text style={styles.attachmentName}>{attachment.fileName}</Text>
                {' - '}
                <Text>{formatFileSize(attachment.fileSize)}</Text>
                {' - '}
                <Text>{attachment.fileType}</Text>
              </Text>
              <Text style={styles.attachmentUrl}>
                {attachment.fileUrl}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export const ConversationPDF: React.FC<ConversationPDFProps> = ({
  conversation,
  includeAttachments = true,
}) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.title}>
            {conversation.title || 'Untitled Conversation'}
          </Text>
          <View style={styles.metadata}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Created:</Text>
              <Text style={styles.metadataValue}>{formatDate(conversation.createdAt)}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Updated:</Text>
              <Text style={styles.metadataValue}>{formatDate(conversation.updatedAt)}</Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Exported:</Text>
              <Text style={styles.metadataValue}>{formatDate(conversation.exportedAt)}</Text>
            </View>
            {conversation.user?.name && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>User:</Text>
                <Text style={styles.metadataValue}>{conversation.user.name}</Text>
              </View>
            )}
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
          />
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};
