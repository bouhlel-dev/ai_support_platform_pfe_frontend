import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { TicketsPage } from '@/features/tickets/TicketsPage';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'client' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/shared/api/tickets', () => ({
  ticketsApi: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    assign: vi.fn(),
  },
}));

import { ticketsApi } from '@/shared/api/tickets';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Tickets page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ticketsApi.list as any).mockResolvedValue({ tickets: [], total: 0 });
    (ticketsApi.create as any).mockResolvedValue({
      id: 'ticket-1',
      subject: 'Need billing help',
      description: 'My invoice total looks incorrect',
      status: 'OPEN',
      priority: 'MEDIUM',
      channel_source: 'TICKET',
      escalation_flag: false,
      creator_id: 'client-1',
      created_at: '2026-04-05T10:00:00Z',
      updated_at: '2026-04-05T10:00:00Z',
    });
  });

  it('creates a new ticket from the dialog', async () => {
    renderWithQueryClient(<TicketsPage />);

    fireEvent.click(await screen.findByText('New Ticket'));

    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Need billing help' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'My invoice total looks incorrect' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Ticket' }));

    await waitFor(() => {
      expect(ticketsApi.create).toHaveBeenCalledWith({
        subject: 'Need billing help',
        description: 'My invoice total looks incorrect',
        priority: 'medium',
      });
    });
  });
});
