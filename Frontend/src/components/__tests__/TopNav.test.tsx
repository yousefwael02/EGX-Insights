import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopNav from '../TopNav';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../data', () => ({
  fetchMarketSummary: vi.fn().mockResolvedValue({
    index_value: 30000,
    change: 110,
    changePercent: 0.5,
    timestamp: '2026-04-19 11:00',
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

describe('TopNav', () => {
  it('renders brand and sign in action', async () => {
    render(
      <MemoryRouter>
        <TopNav stocks={[]} onSelectStock={vi.fn()} onShowAuth={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('EGX')).toBeInTheDocument();
    expect(screen.getByText('Insight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
