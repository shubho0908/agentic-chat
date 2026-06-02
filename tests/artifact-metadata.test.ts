import test from "node:test";
import assert from "node:assert/strict";

import { messageMetadataSchema, type Message, MessageRole } from "@/lib/schemas/chat";
import {
  ARTIFACT_ONLY_ASSISTANT_CONTENT,
  buildMessagesForAPI,
  getPersistableAssistantContent,
} from "@/hooks/chat/conversationManager";
import { createArtifactMetadataCollector } from "@/lib/artifacts/metadata";
import { ArtifactEventType, ArtifactType, type ArtifactMetadata } from "@/types/artifact";

const artifact: ArtifactMetadata = {
  id: "artifact-test",
  type: ArtifactType.REACT,
  title: "Counter",
  language: "tsx",
  content: "export default function Counter(){ return <button>1</button>; }",
  createdAt: 1_706_000_000_000,
};

test("artifact metadata collector builds durable artifact snapshots from stream events", () => {
  const collector = createArtifactMetadataCollector();

  collector.push({
    type: ArtifactEventType.START,
    artifactId: artifact.id,
    artifactType: artifact.type,
    title: artifact.title,
    language: artifact.language,
  });
  collector.push({
    type: ArtifactEventType.CHUNK,
    artifactId: artifact.id,
    content: "export default ",
  });
  collector.push({
    type: ArtifactEventType.CHUNK,
    artifactId: artifact.id,
    content: "function App(){}",
  });
  collector.push({
    type: ArtifactEventType.END,
    artifactId: artifact.id,
  });

  assert.deepEqual(collector.getArtifacts().map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    language: item.language,
    content: item.content,
  })), [{
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    language: artifact.language,
    content: "export default function App(){}",
  }]);
});

test("message metadata schema accepts artifacts and artifact-only responses are persistable", () => {
  const metadata = { artifacts: [artifact] };
  const parsed = messageMetadataSchema.safeParse(metadata);

  assert.equal(parsed.success, true);
  assert.equal(getPersistableAssistantContent("", metadata), ARTIFACT_ONLY_ASSISTANT_CONTENT);
});

test("buildMessagesForAPI sends artifact bodies as hidden assistant context", () => {
  const messages: Message[] = [{
    role: MessageRole.ASSISTANT,
    content: ARTIFACT_ONLY_ASSISTANT_CONTENT,
    id: "assistant-1",
    metadata: { artifacts: [artifact] },
  }];

  const apiMessages = buildMessagesForAPI(
    messages,
    "Make the counter button blue",
    "System",
    "test-model"
  );

  const assistantMessage = apiMessages.find((message) => message.role === MessageRole.ASSISTANT);
  assert.equal(typeof assistantMessage?.content, "string");
  assert.match(assistantMessage?.content as string, /<artifact type="react" title="Counter" language="tsx">/);
  assert.match(assistantMessage?.content as string, /export default function Counter/);
  assert.doesNotMatch(assistantMessage?.content as string, new RegExp(ARTIFACT_ONLY_ASSISTANT_CONTENT));
});
