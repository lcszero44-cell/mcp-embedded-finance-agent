import { describe, expect, it } from 'vitest';
import {
  analyzeSpendingByCategory,
  buildWebhookNotification,
  classifyPlaidTransaction,
  convertUsdToBrl,
  evaluatePurchaseAffordability,
  sanitizeResponsePayload,
  summarizeAccounts,
} from '../src/core/financialEngine.ts';
import {
  DEFAULT_USD_TO_BRL_RATE,
  SANDBOX_ACCOUNTS,
  SANDBOX_TRANSACTIONS,
} from '../src/core/sandboxData.ts';

describe('Financial Engine — Regra de Sinal da Plaid & Conversão USD/BRL', () => {
  it('classifica corretamente transações pela convenção de sinal da Plaid (positivo = saída, negativo = entrada)', () => {
    const outflowTx = classifyPlaidTransaction({
      transaction_id: 'tx_pos',
      account_id: 'acc_plaid_credit_003',
      date: '2026-11-22',
      name: 'United Airlines',
      merchant_name: 'United Airlines',
      amount: 248.5,
      iso_currency_code: 'USD',
      category: 'Travel',
      category_pt: 'Viagens & Transporte',
      payment_channel: 'online',
      pending: false,
    });

    const inflowTx = classifyPlaidTransaction({
      transaction_id: 'tx_neg',
      account_id: 'acc_plaid_checking_001',
      date: '2026-11-05',
      name: 'TechCorp Payroll',
      merchant_name: 'TechCorp Payroll',
      amount: -2850.0,
      iso_currency_code: 'USD',
      category: 'Income',
      category_pt: 'Receitas & Estornos',
      payment_channel: 'other',
      pending: false,
    });

    expect(outflowTx.direction).toBe('outflow');
    expect(outflowTx.absoluteUsd).toBe(248.5);
    expect(outflowTx.absoluteBrl).toBe(convertUsdToBrl(248.5, DEFAULT_USD_TO_BRL_RATE));

    expect(inflowTx.direction).toBe('inflow');
    expect(inflowTx.absoluteUsd).toBe(2850.0);
    expect(inflowTx.absoluteBrl).toBe(convertUsdToBrl(2850.0, DEFAULT_USD_TO_BRL_RATE));
  });

  it('trata saldo de cartão de crédito como dívida/fatura (passivo) e subtrai da posição líquida', () => {
    const summary = summarizeAccounts(SANDBOX_ACCOUNTS, 5.75);

    // Checking 1240 + Savings 2450 = 3690 USD
    expect(summary.checkingUsd).toBe(1240);
    expect(summary.savingsUsd).toBe(2450);
    expect(summary.liquidTotalUsd).toBe(3690);

    // Credit card current balance = 410 USD (dívida, NÃO somado ao caixa!)
    expect(summary.creditCardDebtUsd).toBe(410);
    expect(summary.creditCardLimitUsd).toBe(2000);
    expect(summary.creditCardAvailableUsd).toBe(1590);
    expect(summary.creditUtilizationPct).toBe(20.5);

    // Posição líquida = 3690 - 410 = 3280 USD
    expect(summary.netPositionUsd).toBe(3280);
    expect(summary.netPositionBrl).toBe(convertUsdToBrl(3280, 5.75));
    expect(summary.fxDeclaration).toContain('1 USD = R$ 5,75');
  });

  it('converte USD para BRL com precisão de 2 casas decimais e taxa declarada', () => {
    expect(convertUsdToBrl(100, 5.75)).toBe(575);
    expect(convertUsdToBrl(410, 5.75)).toBe(2357.5);
    expect(convertUsdToBrl(248.5, 5.75)).toBe(1428.88);
  });

  it('calcula Top 3 padrões de gasto excluindo entradas negativas (salário/estornos) e respeitando período', () => {
    const analysis30 = analyzeSpendingByCategory(SANDBOX_TRANSACTIONS, 30, 5.75);
    const analysis90 = analyzeSpendingByCategory(SANDBOX_TRANSACTIONS, 90, 5.75);

    expect(analysis30.top3Patterns).toHaveLength(3);
    expect(analysis30.inflowCount).toBe(2); // salário + cashback excluídos dos gastos
    expect(analysis30.totalInflowUsd).toBe(2892);
    expect(analysis30.categories.some((c) => c.category === 'Income')).toBe(false);
    expect(analysis30.categories.some((c) => c.category === 'Refund')).toBe(false);

    // Top 1 nos últimos 30 dias deve ser Viagens & Transporte
    expect(analysis30.top3Patterns[0].category).toBe('Travel');
    expect(analysis30.top3Patterns[0].rank).toBe(1);

    // Janela de 90 dias acumula mais saídas do que 30 dias
    expect(analysis90.totalOutflowUsd).toBeGreaterThan(analysis30.totalOutflowUsd);
  });

  it('avalia compra contextualizada de R$ 2.400 na NovaPay Travel & Store', () => {
    const summary = summarizeAccounts(SANDBOX_ACCOUNTS, 5.75);
    const spending = analyzeSpendingByCategory(SANDBOX_TRANSACTIONS, 30, 5.75);

    const evalTicket = evaluatePurchaseAffordability(
      2400,
      'Passagem Aérea (NovaPay Travel)',
      summary,
      spending,
      5.75,
    );

    expect(evalTicket.verdict).toBe('APROVADO_COM_FOLGA');
    expect(evalTicket.canPayCashFromChecking).toBe(true);
    expect(evalTicket.postPurchaseCheckingBrl).toBe(4730);
    expect(evalTicket.canPayWithinCreditLimit).toBe(true);
  });

  it('gera evento de webhook realista e higieniza qualquer chave sensível de payloads', () => {
    const webhook = buildWebhookNotification('high_spend_transaction', 5.75);
    expect(webhook.event_type).toBe('transactions/created');
    expect(webhook.whatsappMessage).toContain('United Airlines');

    const dirtyPayload = {
      status: 'ok',
      plaid_secret: 'super-secret-value-123',
      client_id: 'my-client-id-xyz',
      nested: {
        access_token: 'access-sandbox-abc123def456',
        note: 'token vazado access-sandbox-9999-test nao deve aparecer',
      },
    };

    const sanitized = sanitizeResponsePayload(dirtyPayload);
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('super-secret-value-123');
    expect(serialized).not.toContain('my-client-id-xyz');
    expect(serialized).not.toContain('access-sandbox-abc123def456');
    expect(serialized).not.toContain('access-sandbox-9999-test');
    expect(sanitized.plaid_secret).toBe('[REDACTED]');
    expect(sanitized.client_id).toBe('[REDACTED]');
  });
});
