import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ConversationsPage } from '@/features/conversations/ConversationsPage';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/shared/api/conversations', () => ({
  conversationsApi: {
    create: vi.fn(),
    list: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    sendStream: vi.fn(),
    sendAttachment: vi.fn(),
    attachmentBlob: vi.fn(),
  },
}));

vi.mock('@/shared/api/voice', () => ({
  voiceApi: {
    transcribe: vi.fn(),
  },
}));

import { useAuth } from '@/features/auth/AuthContext';
import { conversationsApi } from '@/shared/api/conversations';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/conversations']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/conversations" element={ui} />
          <Route path="/support-call" element={<div>Support Call Route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Client chat conversations page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        value: vi.fn(() => 'blob:mock-audio'),
      });
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-audio');
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        writable: true,
        value: vi.fn(() => undefined),
      });
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    }
    (useAuth as any).mockReturnValue({
      user: {
        id: 'client-1',
        email: 'client@example.com',
        name: 'Jane Doe',
        role: 'client',
      },
    });
    (conversationsApi.list as any).mockResolvedValue([]);
    (conversationsApi.messages as any).mockResolvedValue([]);
    (conversationsApi.create as any).mockResolvedValue({
      id: 'conversation-1',
      user_id: 'client-1',
      channel: 'CHAT',
      status: 'OPEN',
      subject: 'I need help with billing',
      created_at: '2026-04-02T12:00:00Z',
      updated_at: '2026-04-02T12:00:00Z',
    });
    (conversationsApi.send as any).mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      sender_id: 'client-1',
      content: 'I need help with billing',
      is_internal: false,
      is_read: false,
      created_at: '2026-04-02T12:00:01Z',
    });
    (conversationsApi.sendStream as any).mockImplementation(
      async (
        payload: { conversationId?: string; content: string; subject?: string },
        handlers: any,
      ) => {
        await handlers.onMeta?.({
          conversation: {
            id: payload.conversationId ?? 'conversation-1',
            user_id: 'client-1',
            channel: 'CHAT',
            status: 'OPEN',
            subject: payload.subject ?? payload.content,
            created_at: '2026-04-02T12:00:00Z',
            updated_at: '2026-04-02T12:00:00Z',
          },
          user_message: {
            id: 'message-1',
            conversation_id: payload.conversationId ?? 'conversation-1',
            sender_id: 'client-1',
            content: payload.content,
            is_internal: false,
            is_read: false,
            created_at: '2026-04-02T12:00:01Z',
          },
          created_conversation: !payload.conversationId,
        });
        await handlers.onDone?.({
          assistant_message: {
            id: 'assistant-1',
            conversation_id: payload.conversationId ?? 'conversation-1',
            sender_id: 'support-assistant',
            content: 'Here is a fast reply.',
            is_internal: false,
            is_read: false,
            created_at: '2026-04-02T12:00:02Z',
          },
        });
      },
    );
    (conversationsApi.sendAttachment as any).mockResolvedValue({
      id: 'message-attachment-1',
      conversation_id: 'conversation-1',
      sender_id: 'client-1',
      content: 'Shared an image: invoice.png',
      is_internal: false,
      is_read: false,
      attachment_filename: 'invoice.png',
      attachment_content_type: 'image/png',
      attachment_size: 12,
      created_at: '2026-04-02T12:00:01Z',
    });
    (conversationsApi.attachmentBlob as any).mockResolvedValue(
      new Blob(['fake-audio'], { type: 'audio/webm' }),
    );
  });

  it('shows the chat-style intro for client users', async () => {
    renderWithQueryClient(<ConversationsPage />);

    expect(await screen.findByText('Start a fresh conversation')).toBeInTheDocument();
    expect(screen.getByText('Welcome back, Jane.')).toBeInTheDocument();
    expect(screen.getByText('I need help with my account setup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Start call').length).toBeGreaterThan(0);
  });

  it('streams the first text message through the fast chat endpoint', async () => {
    renderWithQueryClient(<ConversationsPage />);

    const composer = await screen.findByPlaceholderText('Ask anything');

    fireEvent.change(composer, { target: { value: 'I need help with billing' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(conversationsApi.sendStream).toHaveBeenCalledWith(
        {
          conversationId: undefined,
          content: 'I need help with billing',
          subject: 'I need help with billing',
        },
        expect.any(Object),
        expect.any(AbortSignal),
      );
    });
  });

  it('shows the client message immediately and a waiting state for the AI reply', async () => {
    let resolveStream: (() => Promise<void>) | undefined;
    (conversationsApi.sendStream as any).mockImplementation(
      async (_payload: any, handlers: any) =>
        new Promise<void>((resolve) => {
          void handlers.onMeta?.({
            conversation: {
              id: 'conversation-1',
              user_id: 'client-1',
              channel: 'CHAT',
              status: 'OPEN',
              subject: 'I need help with billing',
              created_at: '2026-04-02T12:00:00Z',
              updated_at: '2026-04-02T12:00:00Z',
            },
            user_message: {
              id: 'message-1',
              conversation_id: 'conversation-1',
              sender_id: 'client-1',
              content: 'I need help with billing',
              is_internal: false,
              is_read: false,
              created_at: '2026-04-02T12:00:01Z',
            },
            created_conversation: true,
          });
          resolveStream = async () => {
            await handlers.onToken?.({ delta: 'Here is a fast reply.' });
            await handlers.onDone?.({
              assistant_message: {
                id: 'assistant-1',
                conversation_id: 'conversation-1',
                sender_id: 'support-assistant',
                content: 'Here is a fast reply.',
                is_internal: false,
                is_read: false,
                created_at: '2026-04-02T12:00:02Z',
              },
            });
            resolve();
          };
        }),
    );

    renderWithQueryClient(<ConversationsPage />);

    const composer = await screen.findByPlaceholderText('Ask anything');

    fireEvent.change(composer, { target: { value: 'I need help with billing' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(screen.getAllByText('I need help with billing').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('AI is preparing a response')).toBeInTheDocument();

    await act(async () => {
      await resolveStream?.();
    });

    await waitFor(() => {
      expect(screen.getByText('Here is a fast reply.')).toBeInTheDocument();
    });
  });

  it('sends selected attachments through the attachment API', async () => {
    renderWithQueryClient(<ConversationsPage />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(['fake-image'], 'invoice.png', { type: 'image/png' });
    Object.defineProperty(fileInput!, 'files', { value: [file] });
    fireEvent.change(fileInput!);

    expect(await screen.findByText('invoice.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(conversationsApi.create).toHaveBeenCalledWith({
        subject: 'Shared an image: invoice.png',
      });
    });

    await waitFor(() => {
      expect(conversationsApi.sendAttachment).toHaveBeenCalledWith(
        'conversation-1',
        expect.objectContaining({
          file,
          content: '',
        }),
      );
    });
  });

  it('renders voice messages as an audio-only bubble', async () => {
    (conversationsApi.list as any).mockResolvedValue([
      {
        id: 'conversation-1',
        user_id: 'client-1',
        channel: 'CHAT',
        status: 'OPEN',
        subject: 'Voice support',
        created_at: '2026-04-02T12:00:00Z',
        updated_at: '2026-04-02T12:00:00Z',
      },
    ]);
    (conversationsApi.messages as any).mockResolvedValue([
      {
        id: 'voice-message-1',
        conversation_id: 'conversation-1',
        sender_id: 'client-1',
        content: 'This transcript should stay hidden from the chat bubble.',
        is_internal: false,
        is_read: false,
        attachment_filename: 'voice-message-1.webm',
        attachment_content_type: 'audio/webm',
        attachment_size: 42,
        created_at: '2026-04-02T12:00:01Z',
      },
    ]);

    renderWithQueryClient(<ConversationsPage />);

    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull();
    });

    expect(
      screen.queryByText('This transcript should stay hidden from the chat bubble.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('voice-message-1.webm')).not.toBeInTheDocument();

    const voiceBubble = screen.getByLabelText('Voice message');
    expect(voiceBubble.className).toContain('bg-primary');
  });

  it('renders image attachments as standalone cards with a separate caption bubble', async () => {
    (conversationsApi.list as any).mockResolvedValue([
      {
        id: 'conversation-1',
        user_id: 'client-1',
        channel: 'CHAT',
        status: 'OPEN',
        subject: 'Image support',
        created_at: '2026-04-02T12:00:00Z',
        updated_at: '2026-04-02T12:00:00Z',
      },
    ]);
    (conversationsApi.messages as any).mockResolvedValue([
      {
        id: 'image-message-1',
        conversation_id: 'conversation-1',
        sender_id: 'client-1',
        content: 'bonjour',
        is_internal: false,
        is_read: false,
        attachment_filename: 'notes.png',
        attachment_content_type: 'image/png',
        attachment_size: 42,
        created_at: '2026-04-02T12:00:01Z',
      },
      {
        id: 'file-message-1',
        conversation_id: 'conversation-1',
        sender_id: 'client-1',
        content: 'Shared a file: report.pdf',
        is_internal: false,
        is_read: false,
        attachment_filename: 'report.pdf',
        attachment_content_type: 'application/pdf',
        attachment_size: 42,
        created_at: '2026-04-02T12:00:02Z',
      },
    ]);
    (conversationsApi.attachmentBlob as any).mockImplementation((_, messageId) => {
      if (messageId === 'image-message-1') {
        return Promise.resolve(new Blob(['fake-image'], { type: 'image/png' }));
      }
      return Promise.resolve(new Blob(['fake-pdf'], { type: 'application/pdf' }));
    });

    renderWithQueryClient(<ConversationsPage />);

    await waitFor(() => {
      expect(screen.getByAltText('notes.png')).toBeInTheDocument();
    });

    expect(screen.getByText('bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Shared a file: report.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    const fileCard = screen.getByRole('link', { name: 'Download report.pdf' });
    expect(fileCard).toBeInTheDocument();
    expect(fileCard.className).toContain('bg-primary');
  });
});
