import {
  analyzeSpendingByCategory,
  buildWebhookNotification,
  classifyPlaidTransaction,
  convertUsdToBrl,
  evaluatePurchaseAffordability,
  formatBrl,
  formatUsd,
  sanitizeResponsePayload,
  summarizeAccounts,
} from './financialEngine.ts';
import {
  DEFAULT_USD_TO_BRL_RATE,
  PLUGGY_OPEN_FINANCE_KNOWLEDGE,
  SANDBOX_ACCOUNTS,
  SANDBOX_NOTICE,
  SANDBOX_TRANSACTIONS,
  buildFxDeclaration,
} from './sandboxData.ts';
import type {
  ChatIntent,
  ChatResponsePayload,
  FinancialSummaryPayload,
  McpExecutionMode,
  McpTraceEvent,
  PeriodDays,
  PlaidAccount,
  PlaidTransaction,
  WebhookScenario,
} from './types.ts';

export interface OrchestratorContext {
  accounts?: PlaidAccount[];
  transactions?: PlaidTransaction[];
  fxRate?: number;
  periodDays?: PeriodDays;
  plaidExecutionMode?: McpExecutionMode;
  pluggyLiveExcerpt?: string | null;
  pluggyExecutionMode?: McpExecutionMode;
}

function createTrace(
  params: Omit<McpTraceEvent, 'id' | 'timestamp'>,
): McpTraceEvent {
  return {
    id: `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...params,
  };
}

export function detectChatIntent(message: string): ChatIntent {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    normalized.includes('webhook') ||
    normalized.includes('whatsapp') ||
    normalized.includes('alerta') ||
    normalized.includes('notifica')
  ) {
    return 'webhook_simulation';
  }

  if (
    normalized.includes('pluggy') ||
    normalized.includes('open finance') ||
    normalized.includes('bacen') ||
    normalized.includes('connector') ||
    normalized.includes('consentimento') ||
    normalized.includes('o que e um item')
  ) {
    return 'pluggy_open_finance';
  }

  if (
    normalized.includes('posso comprar') ||
    normalized.includes('passagem') ||
    normalized.includes('notebook') ||
    normalized.includes('viagem') && normalized.includes('r$') ||
    normalized.includes('compromet') ||
    normalized.includes('orcamento')
  ) {
    return 'purchase_decision';
  }

  if (
    normalized.includes('padroes') ||
    normalized.includes('padrao') ||
    normalized.includes('categoria') ||
    normalized.includes('tabela') ||
    normalized.includes('gasto') ||
    normalized.includes('extrato') ||
    normalized.includes('transac')
  ) {
    return 'spending_patterns';
  }

  if (
    normalized.includes('saldo') ||
    normalized.includes('divida') ||
    normalized.includes('fatura') ||
    normalized.includes('cartao') ||
    normalized.includes('conta')
  ) {
    return 'balances_and_debt';
  }

  return 'general_overview';
}

export function extractPurchaseDetails(message: string): {
  amountBrl: number;
  itemLabel: string;
} {
  const brlMatch = message.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  let amountBrl = 2400;

  if (brlMatch && brlMatch[1]) {
    const cleaned = brlMatch[1].replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isNaN(parsed) && parsed > 0) {
      amountBrl = parsed;
    }
  } else {
    const plainNumber = message.match(/\b(\d{3,6})\b/);
    if (plainNumber && plainNumber[1]) {
      const parsed = Number.parseFloat(plainNumber[1]);
      if (!Number.isNaN(parsed) && parsed >= 50) {
        amountBrl = parsed;
      }
    }
  }

  const lower = message.toLowerCase();
  let itemLabel = 'Compra na NovaPay Travel & Store';
  if (lower.includes('passagem') || lower.includes('voo') || lower.includes('viagem')) {
    itemLabel = 'Passagem Aérea (NovaPay Travel)';
  } else if (lower.includes('notebook') || lower.includes('macbook') || lower.includes('laptop')) {
    itemLabel = 'Notebook (NovaPay Store)';
  } else if (lower.includes('hotel') || lower.includes('hospedagem')) {
    itemLabel = 'Hospedagem (NovaPay Travel)';
  } else if (lower.includes('celular') || lower.includes('iphone') || lower.includes('smartphone')) {
    itemLabel = 'Smartphone (NovaPay Store)';
  }

  return { amountBrl, itemLabel };
}

export function extractPeriodDays(
  message: string,
  fallback: PeriodDays = 30,
): PeriodDays {
  if (message.includes('90')) return 90;
  if (message.includes('60')) return 60;
  if (message.includes('30')) return 30;
  return fallback;
}

export function buildFinancialSummaryPayload(
  ctx: OrchestratorContext = {},
): FinancialSummaryPayload {
  const accounts = ctx.accounts ?? SANDBOX_ACCOUNTS;
  const transactions = ctx.transactions ?? SANDBOX_TRANSACTIONS;
  const fxRate = ctx.fxRate ?? DEFAULT_USD_TO_BRL_RATE;
  const periodDays = ctx.periodDays ?? 30;
  const plaidMode = ctx.plaidExecutionMode ?? 'sandbox-deterministic';

  const accountSummary = summarizeAccounts(accounts, fxRate);
  const spendingAnalysis = analyzeSpendingByCategory(transactions, periodDays, fxRate);
  const recentTransactions = transactions
    .slice(0, 12)
    .map((tx) => classifyPlaidTransaction(tx, fxRate));

  const initialTraces: McpTraceEvent[] = [
    createTrace({
      server: 'plaid-sandbox',
      transport: 'stdio',
      tool: 'accounts/balance/get',
      mode: plaidMode,
      latencyMs: 38,
      status: 'ok',
      requestSummary: { env: 'sandbox', accountsRequested: 'all' },
      responseSummary: {
        accountsCount: accounts.length,
        liquidTotalBrl: accountSummary.liquidTotalBrl,
        creditCardDebtBrl: accountSummary.creditCardDebtBrl,
      },
    }),
    createTrace({
      server: 'plaid-sandbox',
      transport: 'stdio',
      tool: 'transactions/get',
      mode: plaidMode,
      latencyMs: 52,
      status: 'ok',
      requestSummary: { env: 'sandbox', periodDays },
      responseSummary: {
        outflowsCount: spendingAnalysis.outflowCount,
        inflowsExcludedFromSpend: spendingAnalysis.inflowCount,
        totalOutflowBrl: spendingAnalysis.totalOutflowBrl,
      },
    }),
  ];

  return sanitizeResponsePayload({
    sandboxNotice: SANDBOX_NOTICE,
    fxRate,
    fxDeclaration: buildFxDeclaration(fxRate),
    periodDays,
    accounts,
    accountSummary,
    spendingAnalysis,
    recentTransactions,
    initialTraces,
  });
}

export function handleFinancialChat(
  message: string,
  ctx: OrchestratorContext = {},
): ChatResponsePayload {
  const accounts = ctx.accounts ?? SANDBOX_ACCOUNTS;
  const transactions = ctx.transactions ?? SANDBOX_TRANSACTIONS;
  const fxRate = ctx.fxRate ?? DEFAULT_USD_TO_BRL_RATE;
  const periodDays = extractPeriodDays(message, ctx.periodDays ?? 30);
  const fxDeclaration = buildFxDeclaration(fxRate);
  const plaidMode = ctx.plaidExecutionMode ?? 'sandbox-deterministic';
  const pluggyMode = ctx.pluggyExecutionMode ?? 'sandbox-deterministic';

  const intent = detectChatIntent(message);
  const summary = summarizeAccounts(accounts, fxRate);
  const spending = analyzeSpendingByCategory(transactions, periodDays, fxRate);
  const traces: McpTraceEvent[] = [];

  if (intent === 'balances_and_debt') {
    traces.push(
      createTrace({
        server: 'plaid-sandbox',
        transport: 'stdio',
        tool: 'accounts/balance/get',
        mode: plaidMode,
        latencyMs: 41,
        status: 'ok',
        requestSummary: { env: 'sandbox', includeCreditCardSignRule: true },
        responseSummary: {
          checkingUsd: summary.checkingUsd,
          savingsUsd: summary.savingsUsd,
          creditDebtUsd: summary.creditCardDebtUsd,
          netPositionBrl: summary.netPositionBrl,
        },
      }),
    );

    const replyMarkdown = [
      `### Resumo de Contas, Saldos e Fatura do Cartão`,
      `Consulta executada via **\`plaid-sandbox:accounts/balance/get\`** com conversão declarada (**${fxDeclaration}**):`,
      ``,
      `| Conta (Plaid Sandbox) | Tipo | Valor em USD | Valor em BRL | Leitura Contábil |`,
      `| --- | --- | ---: | ---: | --- |`,
      `| **Plaid Checking** (final 0000) | Conta Corrente | ${formatUsd(summary.checkingUsd)} | ${formatBrl(summary.checkingBrl)} | Ativo líquido disponível |`,
      `| **Plaid Saving** (final 1111) | Poupança | ${formatUsd(summary.savingsUsd)} | ${formatBrl(summary.savingsBrl)} | Reserva líquida |`,
      `| **Plaid Credit Card** (final 3333) | Cartão de Crédito | **-${formatUsd(summary.creditCardDebtUsd)}** | **-${formatBrl(summary.creditCardDebtBrl)}** | **Fatura atual / Dívida (passivo)** |`,
      ``,
      `- **Liquidez Total (Corrente + Poupança):** **${formatBrl(summary.liquidTotalBrl)}** (${formatUsd(summary.liquidTotalUsd)})`,
      `- **Dívida Atual no Cartão:** **${formatBrl(summary.creditCardDebtBrl)}** (${formatUsd(summary.creditCardDebtUsd)}) — **${summary.creditUtilizationPct.toFixed(1)}%** do limite de ${formatBrl(summary.creditCardLimitBrl)} (limite livre: **${formatBrl(summary.creditCardAvailableBrl)}**)`,
      `- **Posição Líquida Real (Ativos - Dívida):** **${formatBrl(summary.netPositionBrl)}** (${formatUsd(summary.netPositionUsd)})`,
      ``,
      `> **Por que o saldo do cartão aparece como dívida?** Pela convenção oficial da **Plaid**, em contas do tipo \`credit\`, o campo \`balances.current\` (US$ 410.00) representa **o valor devido na fatura**, e não saldo positivo em caixa. Por isso o agente subtrai a fatura ao calcular sua posição líquida real.`,
    ].join('\n');

    return sanitizeResponsePayload({
      intent,
      replyMarkdown,
      traces,
      fxRate,
      fxDeclaration,
      sandboxNotice: SANDBOX_NOTICE,
    });
  }

  if (intent === 'spending_patterns') {
    traces.push(
      createTrace({
        server: 'plaid-sandbox',
        transport: 'stdio',
        tool: 'transactions/get',
        mode: plaidMode,
        latencyMs: 56,
        status: 'ok',
        requestSummary: { env: 'sandbox', periodDays, signConvention: 'amount > 0 = outflow' },
        responseSummary: {
          outflowCount: spending.outflowCount,
          inflowCountExcluded: spending.inflowCount,
          topCategories: spending.top3Patterns.map((p) => p.categoryPt),
        },
      }),
    );

    const top3Rows = spending.top3Patterns.map(
      (p) =>
        `| #${p.rank} | **${p.categoryPt}** | ${p.transactionCount} | ${formatUsd(p.totalUsd)} | **${formatBrl(p.totalBrl)}** | ${p.sharePct.toFixed(1)}% |`,
    );

    const allCategoryRows = spending.categories.map(
      (c) =>
        `| ${c.categoryPt} | ${c.topMerchant} | ${c.transactionCount} | ${formatUsd(c.totalUsd)} | ${formatBrl(c.totalBrl)} | ${c.sharePct.toFixed(1)}% |`,
    );

    const replyMarkdown = [
      `### Top 3 Padrões de Gasto & Análise por Categoria (${spending.periodDays} dias)`,
      `Dados obtidos via **\`plaid-sandbox:transactions/get\`** (${fxDeclaration}).`,
      ``,
      `#### 1) Seus 3 Principais Padrões de Gasto`,
      `| Ranking | Categoria | Lançamentos | Total USD | Total BRL | Participação |`,
      `| :---: | --- | ---: | ---: | ---: | ---: |`,
      ...top3Rows,
      ``,
      `#### 2) Quebra Completa por Categoria (Somente Saídas)`,
      `| Categoria | Principal Estabelecimento | Qtd. | Total USD | Total BRL | % Saídas |`,
      `| --- | --- | ---: | ---: | ---: | ---: |`,
      ...allCategoryRows,
      ``,
      `**Resumo do Período (${spending.periodDays}d):**`,
      `- **Total de Saídas (\`amount > 0\`):** **${formatBrl(spending.totalOutflowBrl)}** (${formatUsd(spending.totalOutflowUsd)}) em ${spending.outflowCount} transações.`,
      `- **Entradas / Créditos (\`amount < 0\`, excluídos dos gastos):** **${formatBrl(spending.totalInflowBrl)}** (${formatUsd(spending.totalInflowUsd)}) em ${spending.inflowCount} lançamentos (salário + cashback/estorno).`,
      ``,
      `> **Regra de Sinal da Plaid aplicada:** Na Plaid, valores **positivos** (\`amount > 0\`) representam **saídas/gastos** e valores **negativos** (\`amount < 0\`) representam **entradas/créditos**. O agente filtra apenas \`amount > 0\` para não distorcer seus padrões de consumo.`,
    ].join('\n');

    return sanitizeResponsePayload({
      intent,
      replyMarkdown,
      traces,
      fxRate,
      fxDeclaration,
      sandboxNotice: SANDBOX_NOTICE,
    });
  }

  if (intent === 'purchase_decision') {
    const { amountBrl, itemLabel } = extractPurchaseDetails(message);
    const evaluation = evaluatePurchaseAffordability(
      amountBrl,
      itemLabel,
      summary,
      spending,
      fxRate,
    );

    traces.push(
      createTrace({
        server: 'plaid-sandbox',
        transport: 'stdio',
        tool: 'accounts/balance/get',
        mode: plaidMode,
        latencyMs: 39,
        status: 'ok',
        requestSummary: { context: 'NovaPay Checkout Decision', targetBrl: amountBrl },
        responseSummary: {
          checkingBrl: summary.checkingBrl,
          creditAvailableBrl: summary.creditCardAvailableBrl,
        },
      }),
      createTrace({
        server: 'plaid-sandbox',
        transport: 'stdio',
        tool: 'transactions/get',
        mode: plaidMode,
        latencyMs: 49,
        status: 'ok',
        requestSummary: { periodDays: spending.periodDays, evaluateAffordability: true },
        responseSummary: {
          verdict: evaluation.verdict,
          postPurchaseCheckingBrl: evaluation.postPurchaseCheckingBrl,
          projectedCreditUtilizationPct: evaluation.projectedCreditUtilizationPct,
        },
      }),
    );

    const replyMarkdown = [
      `### Análise de Decisão de Compra — ${evaluation.itemLabel}`,
      `**Veredito Embedded Finance:** **${evaluation.verdictLabelPt}** (${formatBrl(evaluation.amountBrl)} ≈ ${formatUsd(evaluation.amountUsd)} | ${fxDeclaration})`,
      ``,
      `| Indicador Financeiro | Antes da Compra | Após a Compra |`,
      `| --- | ---: | ---: |`,
      `| Conta Corrente Disponível | ${formatBrl(summary.checkingBrl)} | **${formatBrl(evaluation.postPurchaseCheckingBrl)}** |`,
      `| Liquidez Total (Corrente + Poupança) | ${formatBrl(summary.liquidTotalBrl)} | **${formatBrl(evaluation.postPurchaseLiquidBrl)}** |`,
      `| Uso do Limite do Cartão (se passar no crédito) | ${summary.creditUtilizationPct.toFixed(1)}% | **${evaluation.projectedCreditUtilizationPct.toFixed(1)}%** |`,
      ``,
      `**Diagnóstico Contextual (NovaPay Travel & Store):**`,
      ...evaluation.rationalePt.map((line) => `- ${line}`),
      ``,
      `**Forma de Pagamento Recomendada:** ${evaluation.recommendedMethodPt}`,
    ].join('\n');

    return sanitizeResponsePayload({
      intent,
      replyMarkdown,
      traces,
      fxRate,
      fxDeclaration,
      sandboxNotice: SANDBOX_NOTICE,
    });
  }

  if (intent === 'pluggy_open_finance') {
    traces.push(
      createTrace({
        server: 'pluggy-docs',
        transport: 'streamable-http',
        tool: 'search_docs',
        mode: pluggyMode,
        latencyMs: ctx.pluggyLiveExcerpt ? 215 : 44,
        status: ctx.pluggyLiveExcerpt ? 'ok' : 'fallback',
        requestSummary: {
          endpoint: 'https://mcp.pluggy.ai/mcp',
          query: 'Pluggy Item Connector Open Finance Brasil consentimento webhooks',
        },
        responseSummary: {
          source: ctx.pluggyLiveExcerpt
            ? 'Live Pluggy MCP Streamable HTTP'
            : 'Pluggy Official Docs Knowledge Base',
          topicsMatched: ['Item', 'Connector', 'Open Finance Brasil', 'Webhooks'],
        },
      }),
    );

    const liveNote = ctx.pluggyLiveExcerpt
      ? `\n> **Trecho consultado ao vivo no servidor \`pluggy-docs\` (Streamable HTTP):** ${ctx.pluggyLiveExcerpt}\n`
      : '';

    const replyMarkdown = [
      `### O que é um \`Item\` na Pluggy e a diferença para o Open Finance Brasil`,
      `Consulta roteada para o servidor MCP **\`pluggy-docs\`** (\`https://mcp.pluggy.ai/mcp\` — Streamable HTTP sem necessidade de API key).`,
      liveNote,
      `#### 1) Conceito de \`Item\` e \`Connector\` na Pluggy`,
      `- **Item:** ${PLUGGY_OPEN_FINANCE_KNOWLEDGE.itemDefinition}`,
      `- **Connector:** ${PLUGGY_OPEN_FINANCE_KNOWLEDGE.connectorDefinition}`,
      ``,
      `#### 2) Plaid Sandbox vs Open Finance Brasil (Pluggy)`,
      `| Dimensão | Plaid Sandbox (Dados da Demo) | Open Finance Brasil via Pluggy |`,
      `| --- | --- | --- |`,
      `| **Regulação** | Dados sintéticos em Sandbox EUA | Regulado pelo **Banco Central (Bacen)** com FAPI/OAuth 2.0 |`,
      `| **Consentimento** | Token fixo de teste sem cliente real | Consentimento explícito, granular por escopo e revogável pelo usuário |`,
      `| **Entidades Principais** | \`Item\` + \`Account\` + \`Transaction\` | \`Connector\` (instituição BR) + \`Item\` (conexão) + \`Webhook\` |`,
      `| **Moeda** | USD (exige conversão declarada para BRL) | BRL nativo + PIX, faturas e investimentos brasileiros |`,
      ``,
      `#### 3) Pontos-Chave de Arquitetura em Produção no Brasil`,
      ...PLUGGY_OPEN_FINANCE_KNOWLEDGE.openFinanceBrasilDiff.map((item) => `- ${item}`),
      ``,
      `**Fontes Oficiais:**`,
      ...PLUGGY_OPEN_FINANCE_KNOWLEDGE.officialSources.map((src) => `- ${src}`),
    ].join('\n');

    return sanitizeResponsePayload({
      intent,
      replyMarkdown,
      traces,
      fxRate,
      fxDeclaration,
      sandboxNotice: SANDBOX_NOTICE,
    });
  }

  if (intent === 'webhook_simulation') {
    let scenario: WebhookScenario = 'high_spend_transaction';
    const lower = message.toLowerCase();
    if (lower.includes('fatura') || lower.includes('fechamento')) {
      scenario = 'credit_statement_closing';
    } else if (lower.includes('viagem') || lower.includes('teto')) {
      scenario = 'travel_budget_alert';
    }

    const webhookEvent = buildWebhookNotification(scenario, fxRate);

    traces.push(
      createTrace({
        server: 'webhook-simulator',
        transport: 'internal-event',
        tool: `webhook:${webhookEvent.event_type}`,
        mode: 'sandbox-deterministic',
        latencyMs: 24,
        status: 'ok',
        requestSummary: { scenario, deliveryChannel: webhookEvent.channel },
        responseSummary: {
          eventId: webhookEvent.event_id,
          severity: webhookEvent.severity,
          dispatched: true,
        },
      }),
    );

    const replyMarkdown = [
      `### Simulação de Webhook → Alerta WhatsApp / Push Disparado`,
      `O backend simulou um evento assíncrono **\`${webhookEvent.event_type}\`** (padrão Pluggy Webhooks) e encaminhou a notificação para **${webhookEvent.channel}**.`,
      ``,
      `**Preview da Mensagem WhatsApp:**`,
      `> ${webhookEvent.whatsappMessage.split('\n').join('\n> ')}`,
      ``,
      `- **ID do Evento:** \`${webhookEvent.event_id}\``,
      `- **Notificação Push:** ${webhookEvent.pushMessage}`,
      `- **Dica:** Você também pode disparar outros gatilhos (Fechamento de Fatura ou Teto de Viagens) no painel **Simulador de Webhook** à esquerda.`,
    ].join('\n');

    return sanitizeResponsePayload({
      intent,
      replyMarkdown,
      traces,
      webhookEvent,
      fxRate,
      fxDeclaration,
      sandboxNotice: SANDBOX_NOTICE,
    });
  }

  // Fallback general overview
  traces.push(
    createTrace({
      server: 'plaid-sandbox',
      transport: 'stdio',
      tool: 'accounts/balance/get',
      mode: plaidMode,
      latencyMs: 36,
      status: 'ok',
      requestSummary: { env: 'sandbox', mode: 'overview' },
      responseSummary: {
        liquidTotalBrl: summary.liquidTotalBrl,
        creditCardDebtBrl: summary.creditCardDebtBrl,
      },
    }),
  );

  const replyMarkdown = [
    `### Assistente Financeiro NovaPay Travel & Store (MCP Ativo)`,
    `Estou conectado ao **Plaid Sandbox MCP** (contas e transações fictícias) e ao **Pluggy Docs MCP** (Open Finance Brasil).`,
    ``,
    `- **Liquidez Atual:** ${formatBrl(summary.liquidTotalBrl)} (${formatUsd(summary.liquidTotalUsd)})`,
    `- **Fatura Atual do Cartão (Dívida):** ${formatBrl(summary.creditCardDebtBrl)} (${formatUsd(summary.creditCardDebtUsd)})`,
    `- **Gastos nos últimos ${spending.periodDays} dias:** ${formatBrl(spending.totalOutflowBrl)} (${formatUsd(spending.totalOutflowUsd)}) — taxa declarada: **${fxDeclaration}**.`,
    ``,
    `Experimente perguntar sobre seu **saldo e dívida do cartão**, **3 principais padrões de gasto**, **se pode comprar uma passagem de R$ 2.400**, **o que é um Item na Pluggy** ou **simular um alerta de webhook no WhatsApp**!`,
  ].join('\n');

  return sanitizeResponsePayload({
    intent,
    replyMarkdown,
    traces,
    fxRate,
    fxDeclaration,
    sandboxNotice: SANDBOX_NOTICE,
  });
}

// Helper exported for tests verifying USD->BRL consistency
export { convertUsdToBrl };
