import test from 'node:test';
import assert from 'node:assert/strict';

import { isPrivateAddress, isTrustedAttachmentUrl } from '@/lib/network/ssrf';
import { redactSharedConversation } from '@/lib/share/redaction';
import {
  buildGoogleWorkspaceApprovalBarrierMessage,
  hasExplicitGoogleWorkspaceApproval,
  DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS,
} from '@/lib/tools/google-suite/safety';
import { validateRequestedModel, getStageModel } from '@/lib/model-policy';
import { injectContextToMessages } from '@/lib/chat/message-helpers';
import { shouldPersistConversationMemory } from '@/lib/chat/memory-policy';
import {
  buildMemoryLookupQueries,
  mediateMemoryIntent,
} from '@/lib/chat/request-mediator';

test('SSRF guard rejects private network addresses', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('10.0.0.8'), true);
  assert.equal(isPrivateAddress('192.168.1.10'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

test('attachment validator trusts uploaded storage hosts only', () => {
  assert.equal(isTrustedAttachmentUrl('https://demo.ufs.sh/f/safe-file'), true);
  assert.equal(isTrustedAttachmentUrl('https://utfs.io/f/safe-file'), true);
  assert.equal(isTrustedAttachmentUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isTrustedAttachmentUrl('https://internal.example.com/file.pdf'), false);
});

test('shared conversation redaction removes metadata and attachments', () => {
  const redacted = redactSharedConversation({
    id: 'conv_1',
    title: 'Shared',
    isPublic: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    messages: [
      {
        id: 'msg_1',
        role: 'ASSISTANT',
        content: 'hello',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        siblingIndex: 0,
        versions: [
          {
            id: 'ver_1',
            role: 'ASSISTANT',
            content: 'older',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            siblingIndex: 0,
          },
        ],
      },
    ],
  });

  assert.equal(redacted.messages[0].metadata, undefined);
  assert.deepEqual(redacted.messages[0].attachments, []);
  assert.deepEqual(redacted.messages[0].versions[0].attachments, []);
});

test('google workspace destructive actions require explicit approval', () => {
  assert.equal(DESTRUCTIVE_GOOGLE_WORKSPACE_TOOLS.has('gmail_send'), true);
  assert.equal(hasExplicitGoogleWorkspaceApproval('send the email now'), false);
  assert.equal(hasExplicitGoogleWorkspaceApproval('approve these Google Workspace actions'), true);
  assert.match(
    buildGoogleWorkspaceApprovalBarrierMessage(['gmail_send', 'drive_share']),
    /Approval required/
  );
});

test('server model policy rejects unknown models and downshifts orchestration stages', () => {
  assert.equal(validateRequestedModel('gpt-5.4'), 'gpt-5.4');
  assert.equal(validateRequestedModel('not-a-real-model'), null);
  assert.equal(getStageModel('gpt-5.4', 'research_gate'), 'gpt-5-nano');
  assert.equal(getStageModel('gpt-5.4', 'research_formatter'), 'gpt-5-mini');
});

test('untrusted context is no longer injected into the system role', () => {
  const messages = injectContextToMessages(
    [
      { role: 'system', content: 'System rules' },
      { role: 'user', content: 'Question' },
    ],
    'Untrusted tool output'
  );

  assert.equal(messages[0].role, 'system');
  assert.match(String(messages[1].content), /reference_context/);
  assert.equal(messages[2].role, 'user');
});

test('explicit recall prompts always trigger memory mediation without AI fallback', async () => {
  await assert.doesNotReject(async () => {
    const rememberDecision = await mediateMemoryIntent({
      messageText: 'hey buddy, u remember me?',
    });
    const nameDecision = await mediateMemoryIntent({
      messageText: 'do u know my name?',
    });
    const projectDecision = await mediateMemoryIntent({
      messageText: "what's my latest project?",
    });

    assert.equal(rememberDecision.shouldQuery, true);
    assert.equal(nameDecision.shouldQuery, true);
    assert.equal(projectDecision.shouldQuery, true);
  });
});

test('conversation recap prompts also trigger memory mediation', async () => {
  const askedTodayDecision = await mediateMemoryIntent({
    messageText: 'what did i ask u today?',
  });
  const talkedBeforeDecision = await mediateMemoryIntent({
    messageText: 'have we talked before?',
  });
  const mentionDecision = await mediateMemoryIntent({
    messageText: 'did i mention my startup to you earlier?',
  });

  assert.equal(askedTodayDecision.shouldQuery, true);
  assert.equal(talkedBeforeDecision.shouldQuery, true);
  assert.equal(mentionDecision.shouldQuery, true);
});

test('memory lookup queries expand identity questions into targeted recall searches', () => {
  const queries = buildMemoryLookupQueries(
    'do u know my name?',
    'user: My name is Shubho\nassistant: Nice to meet you, Shubho.'
  );

  assert.match(queries[0], /do you know my name/i);
  assert.ok(
    queries.some((query) => /preferred name|nickname|what assistant should call user/i.test(query))
  );
  assert.ok(
    queries.some((query) => /recent conversation recap/i.test(query))
  );
});

test('memory lookup queries expand recap questions into recent-conversation searches', () => {
  const queries = buildMemoryLookupQueries(
    'what did i ask u today?',
    'user: Help me plan interviews.\nassistant: Sure, let us structure them.'
  );

  assert.match(queries[0], /what did i ask you today/i);
  assert.ok(
    queries.some((query) => /prior questions requests and facts|previous chats/i.test(query))
  );
  assert.ok(
    queries.some((query) => /recent conversation recap/i.test(query))
  );
});

test('personal identity facts remain eligible for memory persistence', () => {
  const shouldPersist = shouldPersistConversationMemory({
    userMessage: 'My name is Shubho and I am building an agentic chat app.',
    assistantMessage: 'Nice to meet you, Shubho. I will remember that you are building an agentic chat app.',
  });

  assert.equal(shouldPersist, true);
});
