import {
  DEFAULT_USD_TO_BRL_RATE,
  SANDBOX_REFERENCE_DATE,
  buildFxDeclaration,
} from './sandboxData.ts';
import type {
  AccountSummary,
  CategoryBreakdown,
  ClassifiedTransaction,
  CurrencyMode,
  PeriodDays,
  PlaidAccount,
  PlaidTransaction,
  PurchaseEvaluation,
  SpendingAnalysis,
  SpendingPattern,
  WebhookAlertEvent,
  WebhookScenario,
} from './types.ts';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function convertUsdToBrl(
  amountUsd: number,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): number {
  return round2(amountUsd * fxRate);
}

export function convertBrlToUsd(
  amountBrl: number,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): number {
  return round2(amountBrl / fxRate);
}

export function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(value)
    .replace(/\u00A0/g, ' ');
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatMoney(
  amountUsd: number,
  currency: CurrencyMode,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): string {
  return currency === 'BRL'
    ? formatBrl(convertUsdToBrl(amountUsd, fxRate))
    : formatUsd(amountUsd);
}

/**
 * Regra oficial de sinal da Plaid:
 * - amount > 0 => outflow (saída / gasto / débito)
 * - amount < 0 => inflow (entrada / salário / estorno / crédito)
 * - amount === 0 => neutral
 */
export function classifyPlaidTransaction(
  tx: PlaidTransaction,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): ClassifiedTransaction {
  const direction: ClassifiedTransaction['direction'] =
    tx.amount > 0 ? 'outflow' : tx.amount < 0 ? 'inflow' : 'neutral';
  const absoluteUsd = round2(Math.abs(tx.amount));
  const absoluteBrl = convertUsdToBrl(absoluteUsd, fxRate);

  return {
    ...tx,
    direction,
    absoluteUsd,
    absoluteBrl,
  };
}

/**
 * Consolida contas Plaid respeitando a semântica contábil:
 * - Contas depository (checking / savings) => ativos líquidos.
 * - Contas credit (credit card) => `balances.current` é fatura/dívida (passivo), NUNCA caixa!
 */
export function summarizeAccounts(
  accounts: PlaidAccount[],
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): AccountSummary {
  let checkingUsd = 0;
  let savingsUsd = 0;
  let creditCardDebtUsd = 0;
  let creditCardLimitUsd = 0;

  for (const account of accounts) {
    if (account.type === 'depository' && account.subtype === 'checking') {
      checkingUsd += account.balances.available ?? account.balances.current;
    } else if (account.type === 'depository' && account.subtype === 'savings') {
      savingsUsd += account.balances.available ?? account.balances.current;
    } else if (account.type === 'credit') {
      // Na Plaid, saldo positivo em conta credit = valor devido (fatura atual)
      creditCardDebtUsd += Math.max(0, account.balances.current);
      creditCardLimitUsd += Math.max(0, account.balances.limit ?? 0);
    }
  }

  checkingUsd = round2(checkingUsd);
  savingsUsd = round2(savingsUsd);
  const liquidTotalUsd = round2(checkingUsd + savingsUsd);
  creditCardDebtUsd = round2(creditCardDebtUsd);
  creditCardLimitUsd = round2(creditCardLimitUsd);
  const creditCardAvailableUsd = round2(
    Math.max(0, creditCardLimitUsd - creditCardDebtUsd),
  );
  const creditUtilizationPct =
    creditCardLimitUsd > 0
      ? round2((creditCardDebtUsd / creditCardLimitUsd) * 100)
      : 0;
  const netPositionUsd = round2(liquidTotalUsd - creditCardDebtUsd);

  return {
    checkingUsd,
    checkingBrl: convertUsdToBrl(checkingUsd, fxRate),
    savingsUsd,
    savingsBrl: convertUsdToBrl(savingsUsd, fxRate),
    liquidTotalUsd,
    liquidTotalBrl: convertUsdToBrl(liquidTotalUsd, fxRate),
    creditCardDebtUsd,
    creditCardDebtBrl: convertUsdToBrl(creditCardDebtUsd, fxRate),
    creditCardLimitUsd,
    creditCardLimitBrl: convertUsdToBrl(creditCardLimitUsd, fxRate),
    creditCardAvailableUsd,
    creditCardAvailableBrl: convertUsdToBrl(creditCardAvailableUsd, fxRate),
    creditUtilizationPct,
    netPositionUsd,
    netPositionBrl: convertUsdToBrl(netPositionUsd, fxRate),
    fxRate,
    fxDeclaration: buildFxDeclaration(fxRate),
  };
}

export function filterTransactionsByPeriod(
  transactions: PlaidTransaction[],
  periodDays: PeriodDays,
  referenceDate: string = SANDBOX_REFERENCE_DATE,
): PlaidTransaction[] {
  const refTime = new Date(`${referenceDate}T23:59:59Z`).getTime();
  const cutoffMs = periodDays * 24 * 60 * 60 * 1000;

  return transactions.filter((tx) => {
    const txTime = new Date(`${tx.date}T12:00:00Z`).getTime();
    return refTime - txTime <= cutoffMs && txTime <= refTime;
  });
}

/**
 * Analisa gastos por categoria considerando SOMENTE saídas (`amount > 0`),
 * excluindo entradas (`amount < 0`) conforme a convenção oficial da Plaid.
 */
export function analyzeSpendingByCategory(
  transactions: PlaidTransaction[],
  periodDays: PeriodDays = 30,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
  referenceDate: string = SANDBOX_REFERENCE_DATE,
): SpendingAnalysis {
  const inPeriod = filterTransactionsByPeriod(transactions, periodDays, referenceDate);
  const classified = inPeriod.map((tx) => classifyPlaidTransaction(tx, fxRate));

  const outflows = classified.filter((tx) => tx.direction === 'outflow');
  const inflows = classified.filter((tx) => tx.direction === 'inflow');

  const totalOutflowUsd = round2(
    outflows.reduce((sum, tx) => sum + tx.absoluteUsd, 0),
  );
  const totalInflowUsd = round2(
    inflows.reduce((sum, tx) => sum + tx.absoluteUsd, 0),
  );

  const grouped = new Map<
    string,
    {
      category: string;
      categoryPt: string;
      count: number;
      totalUsd: number;
      merchantTotals: Map<string, number>;
    }
  >();

  for (const tx of outflows) {
    const existing = grouped.get(tx.category) ?? {
      category: tx.category,
      categoryPt: tx.category_pt,
      count: 0,
      totalUsd: 0,
      merchantTotals: new Map<string, number>(),
    };
    existing.count += 1;
    existing.totalUsd = round2(existing.totalUsd + tx.absoluteUsd);
    const prevMerchant = existing.merchantTotals.get(tx.merchant_name) ?? 0;
    existing.merchantTotals.set(
      tx.merchant_name,
      round2(prevMerchant + tx.absoluteUsd),
    );
    grouped.set(tx.category, existing);
  }

  const categories: CategoryBreakdown[] = Array.from(grouped.values())
    .map((entry) => {
      let topMerchant = 'Diversos';
      let topMerchantAmount = -1;
      for (const [merchant, amount] of entry.merchantTotals.entries()) {
        if (amount > topMerchantAmount) {
          topMerchantAmount = amount;
          topMerchant = merchant;
        }
      }

      const sharePct =
        totalOutflowUsd > 0
          ? round2((entry.totalUsd / totalOutflowUsd) * 100)
          : 0;
      const avgUsd = round2(entry.totalUsd / entry.count);

      return {
        category: entry.category,
        categoryPt: entry.categoryPt,
        transactionCount: entry.count,
        totalUsd: entry.totalUsd,
        totalBrl: convertUsdToBrl(entry.totalUsd, fxRate),
        sharePct,
        averageTicketUsd: avgUsd,
        averageTicketBrl: convertUsdToBrl(avgUsd, fxRate),
        topMerchant,
      };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const top3Patterns: SpendingPattern[] = categories.slice(0, 3).map((cat, idx) => {
    const rank = (idx + 1) as 1 | 2 | 3;
    let insightPt = `Ticket médio de ${formatBrl(cat.averageTicketBrl)} com destaque em ${cat.topMerchant}.`;
    if (rank === 1) {
      insightPt = `Principal vetor de saída (${cat.sharePct.toFixed(1)}% dos gastos), liderado por ${cat.topMerchant}.`;
    } else if (rank === 2) {
      insightPt = `Segunda maior concentração (${cat.transactionCount} lançamentos), puxada por ${cat.topMerchant}.`;
    } else if (rank === 3) {
      insightPt = `Terceiro padrão recorrente (${cat.sharePct.toFixed(1)}%), ticket médio de ${formatBrl(cat.averageTicketBrl)}.`;
    }

    return {
      rank,
      category: cat.category,
      categoryPt: cat.categoryPt,
      transactionCount: cat.transactionCount,
      totalUsd: cat.totalUsd,
      totalBrl: cat.totalBrl,
      sharePct: cat.sharePct,
      insightPt,
    };
  });

  return {
    periodDays,
    referenceDate,
    outflowCount: outflows.length,
    inflowCount: inflows.length,
    totalOutflowUsd,
    totalOutflowBrl: convertUsdToBrl(totalOutflowUsd, fxRate),
    totalInflowUsd,
    totalInflowBrl: convertUsdToBrl(totalInflowUsd, fxRate),
    categories,
    top3Patterns,
    fxRate,
    fxDeclaration: buildFxDeclaration(fxRate),
  };
}

/**
 * Avalia viabilidade de uma compra no app NovaPay Travel & Store
 * cruzando conta corrente, poupança, fatura de cartão e ritmo de gastos.
 */
export function evaluatePurchaseAffordability(
  amountBrl: number,
  itemLabel: string,
  summary: AccountSummary,
  spending: SpendingAnalysis,
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): PurchaseEvaluation {
  const normalizedBrl = round2(Math.max(1, amountBrl));
  const amountUsd = convertBrlToUsd(normalizedBrl, fxRate);
  const postPurchaseCheckingBrl = round2(summary.checkingBrl - normalizedBrl);
  const postPurchaseLiquidBrl = round2(summary.liquidTotalBrl - normalizedBrl);

  const projectedCreditDebtUsd = round2(summary.creditCardDebtUsd + amountUsd);
  const projectedCreditUtilizationPct =
    summary.creditCardLimitUsd > 0
      ? round2((projectedCreditDebtUsd / summary.creditCardLimitUsd) * 100)
      : 100;

  const canPayCashFromChecking = postPurchaseCheckingBrl >= 1500;
  const canPayWithinCreditLimit =
    normalizedBrl <= summary.creditCardAvailableBrl;

  let verdict: PurchaseEvaluation['verdict'];
  let verdictLabelPt: string;
  let recommendedMethodPt: string;

  if (canPayCashFromChecking && projectedCreditUtilizationPct <= 55) {
    verdict = 'APROVADO_COM_FOLGA';
    verdictLabelPt = 'Viável com folga no orçamento';
    recommendedMethodPt =
      'PIX/Débito à vista pela Conta Corrente (preservando 100% da Poupança e mantendo a fatura do cartão baixa) ou até 3x sem juros no cartão com alerta de limite.';
  } else if (postPurchaseLiquidBrl >= 4000 && canPayWithinCreditLimit) {
    verdict = 'APROVADO_COM_CAUTELA';
    verdictLabelPt = 'Viável com cautela e planejamento';
    recommendedMethodPt =
      'Parcelamento sem juros no cartão de crédito ou uso parcial da conta corrente sem drenar a reserva de emergência.';
  } else {
    verdict = 'NAO_RECOMENDADO';
    verdictLabelPt = 'Não recomendado no momento';
    recommendedMethodPt =
      'Aguardar fechamento do ciclo ou reforçar o saldo em conta corrente antes de assumir a despesa.';
  }

  const topCat = spending.top3Patterns[0];
  const rationalePt: string[] = [
    `Saldo disponível atual em Conta Corrente: ${formatBrl(summary.checkingBrl)} (${formatUsd(summary.checkingUsd)}). Após uma compra de ${formatBrl(normalizedBrl)}, restariam ${formatBrl(postPurchaseCheckingBrl)} na conta corrente.`,
    `Sua Poupança de ${formatBrl(summary.savingsBrl)} (${formatUsd(summary.savingsUsd)}) permanece intacta se você pagar pela conta corrente, mantendo liquidez total de ${formatBrl(postPurchaseLiquidBrl)}.`,
    `No Cartão de Crédito, sua fatura atual já está em ${formatBrl(summary.creditCardDebtBrl)} (${summary.creditUtilizationPct.toFixed(1)}% do limite de ${formatBrl(summary.creditCardLimitBrl)}). Passar ${formatBrl(normalizedBrl)} no cartão elevaria o uso do limite para ${projectedCreditUtilizationPct.toFixed(1)}%.`,
    topCat
      ? `Nos últimos ${spending.periodDays} dias, sua categoria líder já é ${topCat.categoryPt} (${formatBrl(topCat.totalBrl)} — ${topCat.sharePct.toFixed(1)}% das saídas). Considere definir um teto de alerta via webhook.`
      : `Mantenha alertas automáticos ativos para acompanhar o impacto no fluxo mensal.`,
  ];

  return {
    itemLabel,
    amountBrl: normalizedBrl,
    amountUsd,
    verdict,
    verdictLabelPt,
    recommendedMethodPt,
    postPurchaseCheckingBrl,
    postPurchaseLiquidBrl,
    projectedCreditUtilizationPct,
    canPayCashFromChecking,
    canPayWithinCreditLimit,
    rationalePt,
    fxRate,
    fxDeclaration: buildFxDeclaration(fxRate),
  };
}

/**
 * Gera evento de webhook realista (inspirado em Pluggy Webhooks)
 * e traduz em alerta acionável de WhatsApp + Push Notification.
 */
export function buildWebhookNotification(
  scenario: WebhookScenario = 'high_spend_transaction',
  fxRate: number = DEFAULT_USD_TO_BRL_RATE,
): WebhookAlertEvent {
  const nowIso = new Date().toISOString();
  const eventId = `evt_${scenario}_${Date.now().toString(36)}`;

  if (scenario === 'credit_statement_closing') {
    const debtBrl = convertUsdToBrl(410, fxRate);
    return {
      event_id: eventId,
      event_type: 'credit_card/statement_closing',
      provider: 'pluggy-webhook-simulator',
      created_at: nowIso,
      channel: 'WhatsApp + Push',
      severity: 'warning',
      title: 'Fechamento de Fatura em 3 dias',
      whatsappMessage:
        `💳 *NovaPay Assistente Financeiro (Alerta Automático)*\n` +
        `Sua fatura do *Plaid Credit Card (final 3333)* fecha em 3 dias.\n` +
        `• Fatura atual (dívida): *${formatBrl(debtBrl)}* (US$ 410.00)\n` +
        `• Uso do limite: *20,5%* de ${formatBrl(convertUsdToBrl(2000, fxRate))}\n` +
        `• Saldo em Conta Corrente: *${formatBrl(convertUsdToBrl(1240, fxRate))}*\n` +
        `✅ Você tem saldo suficiente para quitação integral sem juros.`,
      pushMessage: `Fatura final 3333 fecha em 3 dias: ${formatBrl(debtBrl)} (20,5% do limite). Saldo em conta cobre 100%.`,
      payload: {
        event: 'credit_card/statement_closing',
        itemId: 'item_pluggy_sandbox_94a1',
        accountId: 'acc_plaid_credit_003',
        statementBalanceUsd: 410.0,
        statementBalanceBrl: debtBrl,
        daysToClose: 3,
        fxDeclaration: buildFxDeclaration(fxRate),
        triggeredAt: nowIso,
      },
    };
  }

  if (scenario === 'travel_budget_alert') {
    const travelUsd = 480.3;
    const travelBrl = convertUsdToBrl(travelUsd, fxRate);
    return {
      event_id: eventId,
      event_type: 'budget/threshold_exceeded',
      provider: 'pluggy-webhook-simulator',
      created_at: nowIso,
      channel: 'WhatsApp + Push',
      severity: 'warning',
      title: 'Teto da Categoria Viagens atingiu 85%',
      whatsappMessage:
        `✈️ *NovaPay Travel Guard (Webhook Ativo)*\n` +
        `Seus gastos em *Viagens & Transporte* nos últimos 30 dias atingiram *${formatBrl(travelBrl)}* (US$ ${travelUsd.toFixed(2)}).\n` +
        `• Representatividade: *42,5%* das saídas do mês\n` +
        `• Dica: Antes de emitir uma nova passagem, simule no chat NovaPay se vale pagar via PIX ou parcelar sem juros.`,
      pushMessage: `Alerta Viagens: ${formatBrl(travelBrl)} acumulados nos últimos 30d (85% do teto configurado).`,
      payload: {
        event: 'budget/threshold_exceeded',
        category: 'Travel',
        categoryPt: 'Viagens & Transporte',
        spentUsd: travelUsd,
        spentBrl: travelBrl,
        thresholdPct: 85,
        fxDeclaration: buildFxDeclaration(fxRate),
        triggeredAt: nowIso,
      },
    };
  }

  // Default: high_spend_transaction
  const amountUsd = 248.5;
  const amountBrl = convertUsdToBrl(amountUsd, fxRate);
  return {
    event_id: eventId,
    event_type: 'transactions/created',
    provider: 'pluggy-webhook-simulator',
    created_at: nowIso,
    channel: 'WhatsApp + Push',
    severity: 'critical',
    title: 'Nova transação acima da média detectada',
    whatsappMessage:
      `🔔 *NovaPay Alerta de Transação (Webhook em Tempo Real)*\n` +
      `Detectamos uma nova saída no *Plaid Credit Card (final 3333)*:\n` +
      `• Estabelecimento: *United Airlines — Trecho Nacional*\n` +
      `• Valor: *${formatBrl(amountBrl)}* (US$ ${amountUsd.toFixed(2)} | sinal Plaid: +248.50 = saída)\n` +
      `• Categoria: *Viagens & Transporte* (+68% acima do seu ticket médio)\n` +
      `Responda *1* para confirmar ou *2* para revisar no app NovaPay.`,
    pushMessage: `Nova compra: United Airlines ${formatBrl(amountBrl)} no cartão final 3333 (acima da média).`,
    payload: {
      event: 'transactions/created',
      itemId: 'item_pluggy_sandbox_94a1',
      transactionId: 'tx_webhook_live_001',
      merchant: 'United Airlines',
      plaidAmountUsd: amountUsd,
      plaidSignRule: 'amount > 0 => outflow/debit',
      convertedBrl: amountBrl,
      fxDeclaration: buildFxDeclaration(fxRate),
      triggeredAt: nowIso,
    },
  };
}

const SENSITIVE_KEY_PATTERN =
  /(secret|client_id|access_token|api_key|apikey|authorization|password|private_key)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /plaid[_-]?(secret|client[_-]?id)\s*[:=]\s*[^\s"']+/gi,
  /access-sandbox-[a-z0-9-]+/gi,
  /ghp_[a-zA-Z0-9]+/g,
  /sk-[a-zA-Z0-9]{16,}/g,
];

/**
 * Sanitizador defensivo para garantir que NENHUMA chave, token ou segredo
 * vaze acidentalmente em payloads devolvidos pela API ou pelo Inspector MCP.
 */
export function sanitizeResponsePayload<T>(input: T): T {
  if (typeof input === 'string') {
    let scrubbed: string = input;
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, '[REDACTED_SECRET]');
    }
    return scrubbed as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeResponsePayload(item)) as unknown as T;
  }

  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeResponsePayload(value);
      }
    }
    return out as T;
  }

  return input;
}
