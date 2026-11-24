import { describe, expect, it } from 'vitest';
import {
  buildFinancialSummaryPayload,
  detectChatIntent,
  extractPurchaseDetails,
  handleFinancialChat,
} from '../src/core/mcpRouter.ts';
import { SANDBOX_NOTICE } from '../src/core/sandboxData.ts';

describe('MCP Router & Orchestrator — Pluggy Docs vs Plaid Sandbox', () => {
  it('roteia corretamente perguntas sobre Pluggy/Open Finance para o servidor pluggy-docs (Streamable HTTP)', () => {
    const prompt =
      'O que é um Item na Pluggy e qual a diferença para o Open Finance Brasil?';
    expect(detectChatIntent(prompt)).toBe('pluggy_open_finance');

    const response = handleFinancialChat(prompt);
    expect(response.intent).toBe('pluggy_open_finance');
    expect(response.traces[0].server).toBe('pluggy-docs');
    expect(response.traces[0].transport).toBe('streamable-http');
    expect(response.replyMarkdown).toContain('Item');
    expect(response.replyMarkdown).toContain('Connector');
    expect(response.replyMarkdown).toContain('Banco Central');
    expect(response.replyMarkdown).toContain('https://mcp.pluggy.ai/mcp');
  });

  it('roteia consulta de saldos e dívida no cartão para plaid-sandbox:accounts/balance/get', () => {
    const prompt = 'Qual é o meu saldo atual e quanto tenho de dívida no cartão?';
    const response = handleFinancialChat(prompt);

    expect(response.intent).toBe('balances_and_debt');
    expect(response.traces[0].server).toBe('plaid-sandbox');
    expect(response.traces[0].tool).toBe('accounts/balance/get');
    expect(response.replyMarkdown).toContain('Fatura atual / Dívida');
    expect(response.replyMarkdown).toContain('1 USD = R$ 5,75');
    expect(response.sandboxNotice).toBe(SANDBOX_NOTICE);
  });

  it('gera tabela Markdown com os 3 principais padrões de gasto via plaid-sandbox:transactions/get', () => {
    const prompt =
      'Mostre uma tabela com meus 3 principais padrões de gasto e gastos por categoria.';
    const response = handleFinancialChat(prompt);

    expect(response.intent).toBe('spending_patterns');
    expect(response.traces[0].server).toBe('plaid-sandbox');
    expect(response.traces[0].tool).toBe('transactions/get');
    expect(response.replyMarkdown).toContain('| Ranking | Categoria |');
    expect(response.replyMarkdown).toContain('#1');
    expect(response.replyMarkdown).toContain('#2');
    expect(response.replyMarkdown).toContain('#3');
    expect(response.replyMarkdown).toContain('amount > 0');
  });

  it('extrai valor dinâmico de compra e aciona saldo + transações para decisão Embedded Finance', () => {
    const details = extractPurchaseDetails(
      'Posso comprar uma passagem de R$ 2.400 agora sem comprometer meu orçamento?',
    );
    expect(details.amountBrl).toBe(2400);
    expect(details.itemLabel).toContain('Passagem');

    const response = handleFinancialChat(
      'Posso comprar uma passagem de R$ 2.400 agora sem comprometer meu orçamento?',
    );
    expect(response.intent).toBe('purchase_decision');
    expect(response.traces.map((t) => t.tool)).toEqual([
      'accounts/balance/get',
      'transactions/get',
    ]);
    expect(response.replyMarkdown).toContain('R$ 2.400,00');
  });

  it('simula alerta de webhook no WhatsApp e não expõe nenhuma credencial na resposta', () => {
    const response = handleFinancialChat(
      'Simular alerta de webhook de nova transação no WhatsApp.',
    );

    expect(response.intent).toBe('webhook_simulation');
    expect(response.webhookEvent).toBeDefined();
    expect(response.traces[0].server).toBe('webhook-simulator');

    const summaryPayload = buildFinancialSummaryPayload({ periodDays: 30 });
    const serializedAll = JSON.stringify({ response, summaryPayload });

    expect(serializedAll).not.toMatch(/PLAID_SECRET/i);
    expect(serializedAll).not.toMatch(/PLAID_CLIENT_ID/i);
    expect(serializedAll).not.toMatch(/access-sandbox-/i);
  });
});
