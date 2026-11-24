import React, { useEffect, useState } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { buildFinancialSummaryPayload } from './core/mcpRouter.ts';
import { SANDBOX_NOTICE } from './core/sandboxData.ts';
import type {
  CurrencyMode,
  FinancialSummaryPayload,
  McpTraceEvent,
  PeriodDays,
  WebhookAlertEvent,
  WebhookScenario,
} from './core/types.ts';
import { ChatPanel, type ChatMessage } from './components/ChatPanel.tsx';
import { LeftPanel } from './components/LeftPanel.tsx';
import {
  fetchFinancialSummary,
  sendChatMessage,
  triggerWebhookSimulation,
} from './services/apiClient.ts';

function formatTime(): string {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  timestamp: formatTime(),
  content: [
    '### Olá! Sou o Assistente Financeiro da **NovaPay Travel & Store**',
    'Estou integrado via **Model Context Protocol (MCP)** ao **Plaid Sandbox** (saldos, cartão e transações fictícias) e à documentação oficial da **Pluggy** (Open Finance Brasil).',
    '',
    '- Consulte **saldos e dívida do cartão** com explicação da regra de sinal da Plaid e conversão **USD → BRL declarada** (`1 USD = R$ 5,75`).',
    '- Gere **tabelas dos 3 principais padrões de gasto** e categorias por período (`30d / 60d / 90d`).',
    '- Avalie na hora se você pode comprar uma **passagem de R$ 2.400** ou qualquer item sem comprometer seu orçamento.',
    '- Pergunte sobre **Pluggy Items / Open Finance Brasil** ou dispare um **Webhook → Alerta WhatsApp**.',
  ].join('\n'),
};

export const App: React.FC = () => {
  const [currency, setCurrency] = useState<CurrencyMode>('BRL');
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [summary, setSummary] = useState<FinancialSummaryPayload>(() =>
    buildFinancialSummaryPayload({ periodDays: 30 }),
  );
  const [backendSource, setBackendSource] = useState<'backend-api' | 'sandbox-engine'>(
    'sandbox-engine',
  );
  const [traces, setTraces] = useState<McpTraceEvent[]>(
    () => buildFinancialSummaryPayload({ periodDays: 30 }).initialTraces,
  );
  const [latestWebhook, setLatestWebhook] = useState<WebhookAlertEvent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let active = true;
    fetchFinancialSummary(periodDays).then(({ data, source }) => {
      if (!active) return;
      setSummary(data);
      setBackendSource(source);
      setTraces((prev) => [...data.initialTraces, ...prev].slice(0, 20));
    });
    return () => {
      active = false;
    };
  }, [periodDays]);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: formatTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const { data, source } = await sendChatMessage(text, periodDays);
      setBackendSource(source);
      if (data.traces.length > 0) {
        setTraces((prev) => [...data.traces, ...prev].slice(0, 25));
      }
      if (data.webhookEvent) {
        setLatestWebhook(data.webhookEvent);
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.replyMarkdown,
        timestamp: formatTime(),
        traces: data.traces,
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSimulateWebhook = async (scenario: WebhookScenario) => {
    const { data, source } = await triggerWebhookSimulation(scenario);
    setBackendSource(source);
    setLatestWebhook(data);
    setTraces((prev) =>
      [
        {
          id: `wh_${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          server: 'webhook-simulator' as const,
          transport: 'internal-event' as const,
          tool: `webhook:${data.event_type}`,
          mode: 'sandbox-deterministic' as const,
          latencyMs: 22,
          status: 'ok' as const,
          requestSummary: { scenario },
          responseSummary: { eventId: data.event_id, channel: data.channel },
        },
        ...prev,
      ].slice(0, 25),
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Mandatory Permanent Sandbox Banner (Header) */}
      <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center">
        <p className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{SANDBOX_NOTICE}</span>
        </p>
      </div>

      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/90 bg-slate-950/90 backdrop-blur px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/20">
              NP
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-50">
                NovaPay Travel &amp; Store{' '}
                <span className="text-cyan-400 font-semibold">• Embedded Finance MCP</span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Bootcamp Bradesco — Agentes de IA do Zero à Prática (DIO) • Etapa 2
                Arquitetura Segura
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Zero Segredos no Frontend
            </span>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5">
            <LeftPanel
              summary={summary}
              currency={currency}
              onCurrencyChange={setCurrency}
              periodDays={periodDays}
              onPeriodChange={setPeriodDays}
              traces={traces}
              latestWebhook={latestWebhook}
              onSimulateWebhook={handleSimulateWebhook}
              onAskPurchase={handleSend}
              backendSource={backendSource}
            />
          </div>
          <div className="lg:col-span-7">
            <ChatPanel messages={messages} isSending={isSending} onSend={handleSend} />
          </div>
        </div>
      </main>

      {/* Mandatory Permanent Sandbox Notice (Footer) */}
      <footer className="border-t border-slate-800/90 bg-slate-950 px-4 py-3 text-center">
        <p className="text-xs font-medium text-amber-300/90">{SANDBOX_NOTICE}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          NovaPay Travel &amp; Store Assistant • Pluggy MCP Docs (Streamable HTTP) + Plaid
          Sandbox MCP (STDIO / uvx) • Câmbio declarado: {summary.fxDeclaration}
        </p>
      </footer>
    </div>
  );
};

export default App;
