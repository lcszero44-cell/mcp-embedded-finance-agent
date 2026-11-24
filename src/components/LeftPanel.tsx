import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CreditCard,
  Landmark,
  Plane,
  ShieldCheck,
  Terminal,
  Wallet,
} from 'lucide-react';
import { formatMoney } from '../core/financialEngine.ts';
import type {
  CurrencyMode,
  FinancialSummaryPayload,
  McpTraceEvent,
  PeriodDays,
  WebhookAlertEvent,
  WebhookScenario,
} from '../core/types.ts';

interface LeftPanelProps {
  summary: FinancialSummaryPayload;
  currency: CurrencyMode;
  onCurrencyChange: (c: CurrencyMode) => void;
  periodDays: PeriodDays;
  onPeriodChange: (p: PeriodDays) => void;
  traces: McpTraceEvent[];
  latestWebhook: WebhookAlertEvent | null;
  onSimulateWebhook: (scenario: WebhookScenario) => void;
  onAskPurchase: (prompt: string) => void;
  backendSource: 'backend-api' | 'sandbox-engine';
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  summary,
  currency,
  onCurrencyChange,
  periodDays,
  onPeriodChange,
  traces,
  latestWebhook,
  onSimulateWebhook,
  onAskPurchase,
  backendSource,
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'webhook'>('inspector');
  const { accountSummary, spendingAnalysis } = summary;

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto pr-0.5">
      {/* Embedded Finance Context Card (NovaPay Travel & Store) */}
      <section className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-4 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300 border border-cyan-500/30">
              <Plane className="h-3 w-3" />
              Onde o Cliente Já Está • Checkout NovaPay
            </div>
            <h2 className="mt-2 text-sm font-semibold text-slate-100">
              Passagem Aérea SP → Lisboa (Ida &amp; Volta)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Oferta relâmpago no carrinho • Consulte seu banco sem sair do app
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-base font-bold text-emerald-400">R$ 2.400,00</span>
            <p className="text-[11px] text-slate-400">≈ US$ 417.39</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onAskPurchase(
                'Posso comprar uma passagem de R$ 2.400 agora sem comprometer meu orçamento?',
              )
            }
            className="rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors cursor-pointer"
          >
            Avaliar esta passagem no Chat MCP
          </button>
          <button
            type="button"
            onClick={() =>
              onAskPurchase(
                'Posso comprar um notebook de R$ 4.500 na NovaPay Store sem comprometer meu orçamento?',
              )
            }
            className="rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            Simular Notebook R$ 4.500
          </button>
        </div>
      </section>

      {/* Currency Toggle & Declared FX Rate */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-200">
              Moeda de Exibição &amp; Câmbio Declarado
            </p>
            <p className="text-[11px] text-slate-400">{summary.fxDeclaration}</p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            {(['BRL', 'USD'] as CurrencyMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onCurrencyChange(mode)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  currency === mode
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'BRL' ? 'BRL (R$)' : 'USD ($)'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Accounts & Balances Cards */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Contas Conectadas (Plaid Sandbox)
          </h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            {backendSource === 'backend-api' ? 'Backend Etapa 2' : 'Motor Sandbox Seguro'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Checking */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                Conta Corrente
              </span>
              <span className="font-mono text-[10px] text-slate-500">•••• 0000</span>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-50">
              {formatMoney(accountSummary.checkingUsd, currency, summary.fxRate)}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-400/90">
              Ativo líquido disponível
            </p>
          </div>

          {/* Savings */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Landmark className="h-3.5 w-3.5 text-cyan-400" />
                Poupança
              </span>
              <span className="font-mono text-[10px] text-slate-500">•••• 1111</span>
            </div>
            <p className="mt-2 text-lg font-bold text-slate-50">
              {formatMoney(accountSummary.savingsUsd, currency, summary.fxRate)}
            </p>
            <p className="mt-0.5 text-[11px] text-cyan-400/90">
              Reserva de emergência
            </p>
          </div>
        </div>

        {/* Credit Card Debt Card (Plaid Sign Rule explicit) */}
        <div className="rounded-xl border border-amber-500/30 bg-slate-900/95 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-200">
              <CreditCard className="h-3.5 w-3.5 text-amber-400" />
              Cartão de Crédito • Fatura Atual (Dívida)
            </span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
              Regra Plaid: Passivo
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-lg font-bold text-amber-300">
              -{formatMoney(accountSummary.creditCardDebtUsd, currency, summary.fxRate)}
            </p>
            <span className="text-xs text-slate-400">
              Limite:{' '}
              <strong className="text-slate-200">
                {formatMoney(accountSummary.creditCardLimitUsd, currency, summary.fxRate)}
              </strong>
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400 transition-all"
              style={{ width: `${Math.min(100, accountSummary.creditUtilizationPct)}%` }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Uso do limite: {accountSummary.creditUtilizationPct.toFixed(1)}%</span>
            <span>
              Livre:{' '}
              {formatMoney(
                accountSummary.creditCardAvailableUsd,
                currency,
                summary.fxRate,
              )}
            </span>
          </div>
          <p className="mt-2 rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[11px] leading-snug text-slate-400 border border-slate-800">
            Em contas <code className="text-amber-300">type=&quot;credit&quot;</code> da
            Plaid, <code className="text-amber-300">balances.current</code> representa{' '}
            <strong className="text-slate-200">dívida/fatura</strong> e é subtraído da
            posição líquida (
            <strong className="text-emerald-300">
              {formatMoney(accountSummary.netPositionUsd, currency, summary.fxRate)}
            </strong>
            ).
          </p>
        </div>
      </section>

      {/* Period Filter & Top 3 Spending Snapshot */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-200">
              Padrões de Gasto (Saídas: amount &gt; 0)
            </h3>
            <p className="text-[11px] text-slate-400">
              Total {periodDays}d:{' '}
              <strong className="text-slate-100">
                {formatMoney(
                  spendingAnalysis.totalOutflowUsd,
                  currency,
                  summary.fxRate,
                )}
              </strong>{' '}
              ({spendingAnalysis.outflowCount} saídas • {spendingAnalysis.inflowCount}{' '}
              entradas excluídas)
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            {([30, 60, 90] as PeriodDays[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriodChange(p)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  periodDays === p
                    ? 'bg-slate-700 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {spendingAnalysis.top3Patterns.map((pattern) => (
            <div key={pattern.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">
                  #{pattern.rank} {pattern.categoryPt}
                </span>
                <span className="font-mono text-slate-300">
                  {formatMoney(pattern.totalUsd, currency, summary.fxRate)}{' '}
                  <span className="text-slate-500">({pattern.sharePct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400/80"
                  style={{ width: `${Math.min(100, pattern.sharePct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs: Real-Time MCP Inspector vs Webhook Simulator */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/95 p-3.5">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'inspector'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Inspector MCP ({traces.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'webhook'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BellRing className="h-3.5 w-3.5" />
            Webhook → WhatsApp
          </button>
        </div>

        {activeTab === 'inspector' ? (
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
            {traces.map((trace) => (
              <div
                key={trace.id}
                className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-cyan-300 truncate">
                    {trace.server}:{trace.tool}
                  </span>
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                    {trace.latencyMs}ms
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800 uppercase">
                    {trace.transport}
                  </span>
                  <span className="rounded bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 border border-emerald-500/20">
                    {trace.mode}
                  </span>
                </div>
                <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900/90 p-1.5 font-mono text-[10px] text-slate-300">
                  {JSON.stringify(trace.responseSummary, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-slate-400">
              Dispare um evento de webhook assíncrono (padrão Pluggy) para visualizar o
              alerta gerado para WhatsApp &amp; Push:
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSimulateWebhook('high_spend_transaction')}
                className="rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 cursor-pointer"
              >
                Gasto Acima da Média
              </button>
              <button
                type="button"
                onClick={() => onSimulateWebhook('credit_statement_closing')}
                className="rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 cursor-pointer"
              >
                Fechamento Fatura
              </button>
              <button
                type="button"
                onClick={() => onSimulateWebhook('travel_budget_alert')}
                className="rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 cursor-pointer"
              >
                Teto Viagens 85%
              </button>
            </div>

            {latestWebhook ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                    <span className="inline-flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" />
                      WhatsApp Alert • {latestWebhook.event_type}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400/80">
                      {latestWebhook.channel}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-200">
                    {latestWebhook.whatsappMessage}
                  </p>
                </div>
                <pre className="max-h-32 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
                  {JSON.stringify(latestWebhook.payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 p-3 text-center text-xs text-slate-400">
                <AlertTriangle className="mx-auto mb-1 h-4 w-4 text-slate-500" />
                Clique em um dos cenários acima para disparar o webhook.
              </div>
            )}
          </div>
        )}
      </section>
    </aside>
  );
};
