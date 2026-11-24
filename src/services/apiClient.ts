import { buildWebhookNotification } from '../core/financialEngine.ts';
import {
  buildFinancialSummaryPayload,
  handleFinancialChat,
} from '../core/mcpRouter.ts';
import type {
  ChatResponsePayload,
  FinancialSummaryPayload,
  PeriodDays,
  WebhookAlertEvent,
  WebhookScenario,
} from '../core/types.ts';

async function fetchJsonWithTimeout<T>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 2200,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFinancialSummary(
  periodDays: PeriodDays,
): Promise<{ data: FinancialSummaryPayload; source: 'backend-api' | 'sandbox-engine' }> {
  const remote = await fetchJsonWithTimeout<FinancialSummaryPayload>(
    `/api/financial-summary?periodDays=${periodDays}`,
  );
  if (remote && remote.accountSummary) {
    return { data: remote, source: 'backend-api' };
  }

  return {
    data: buildFinancialSummaryPayload({ periodDays }),
    source: 'sandbox-engine',
  };
}

export async function sendChatMessage(
  message: string,
  periodDays: PeriodDays,
): Promise<{ data: ChatResponsePayload; source: 'backend-api' | 'sandbox-engine' }> {
  const remote = await fetchJsonWithTimeout<ChatResponsePayload>(
    '/api/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, periodDays }),
    },
    3500,
  );

  if (remote && remote.replyMarkdown) {
    return { data: remote, source: 'backend-api' };
  }

  return {
    data: handleFinancialChat(message, { periodDays }),
    source: 'sandbox-engine',
  };
}

export async function triggerWebhookSimulation(
  scenario: WebhookScenario,
): Promise<{ data: WebhookAlertEvent; source: 'backend-api' | 'sandbox-engine' }> {
  const remote = await fetchJsonWithTimeout<WebhookAlertEvent>(
    '/api/webhook/simulate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    },
  );

  if (remote && remote.event_id) {
    return { data: remote, source: 'backend-api' };
  }

  return {
    data: buildWebhookNotification(scenario),
    source: 'sandbox-engine',
  };
}
