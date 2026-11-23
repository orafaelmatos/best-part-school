import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AIConsentDialog from './AIConsentDialog';
import { requestAIConsent } from '@/lib/aiConsent';
import { PRIVACY_VERSION } from '@/lib/privacy';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: { put: vi.fn() }, sessionBoundConfig: (generation: number) => ({ _authGeneration: generation }) }));
beforeEach(() => { vi.mocked(api.put).mockReset(); });
afterEach(cleanup);

it('requires an explicit checkbox and records the named provider consent before continuing', async () => {
  vi.mocked(api.put).mockResolvedValue({ data: { accepted: true } });
  render(<AIConsentDialog />);
  let decision: Promise<boolean>;
  act(() => { decision = requestAIConsent(); });
  expect(await screen.findByRole('heading', { name: 'Antes de praticar com IA' })).toBeInTheDocument();
  const confirm = screen.getByRole('button', { name: 'Autorizar e continuar' });
  expect(confirm).toBeDisabled();
  expect(api.put).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => { fireEvent.click(confirm); });
  await expect(decision!).resolves.toBe(true);
  expect(api.put).toHaveBeenCalledWith('/accounts/ai-consent/', { accepted: true, version: PRIVACY_VERSION }, expect.objectContaining({ _authGeneration: expect.any(Number) }));
});

it('allows refusal without saving or granting permission', async () => {
  render(<AIConsentDialog />);
  let decision: Promise<boolean>;
  act(() => { decision = requestAIConsent(); });
  fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
  await expect(decision!).resolves.toBe(false);
  expect(api.put).not.toHaveBeenCalled();
});

it('keeps the consent pending if the server cannot save it', async () => {
  vi.mocked(api.put).mockRejectedValue(new Error('offline'));
  render(<AIConsentDialog />);
  let decision: Promise<boolean>;
  act(() => { decision = requestAIConsent(); });
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar e continuar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos salvar');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agora não' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
  await expect(decision!).resolves.toBe(false);
});

it('cannot accept a new account prompt when an old consent request finishes after logout', async () => {
  const { clearSession } = await import('@/lib/session');
  let complete!: (value: { data: { accepted: boolean } }) => void;
  vi.mocked(api.put).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  render(<AIConsentDialog />);
  let first!: Promise<boolean>;
  act(() => { first = requestAIConsent(); });
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar e continuar' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledOnce());
  await act(async () => { await clearSession(); });
  await expect(first).resolves.toBe(false);
  let second!: Promise<boolean>;
  act(() => { second = requestAIConsent(); });
  await act(async () => { complete({ data: { accepted: true } }); });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Autorizar e continuar' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
  await expect(second).resolves.toBe(false);
});
