import {
  buildWebhookNotification,
  sanitizeResponsePayload,
} from '../src/core/financialEngine.ts';
import {
  buildFinancialSummaryPayload,
  detectChatIntent,
  handleFinancialChat,
} from '../src/core/mcpRouter.ts';
import {
  DEFAULT_USD_TO_BRL_RATE,
  SANDBOX_ACCOUNTS,
  SANDBOX_TRANSACTIONS,
} from '../src/core/sandboxData.ts';
import type {
  ChatResponsePayload,
  FinancialSummaryPayload,
  McpExecutionMode,
  PeriodDays,
  PlaidAccount,
  PlaidTransaction,
  WebhookAlertEvent,
  WebhookScenario,
} from '../src/core/types.ts';

function getConfiguredFxRate(): number {
  const raw = process.env.USD_TO_BRL_RATE;
  if (!raw) return DEFAULT_USD_TO_BRL_RATE;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_USD_TO_BRL_RATE;
}

function hasRealPlaidSandboxCredentials(): boolean {
  const clientId = process.env.PLAID_CLIENT_ID?.trim() ?? '';
  const secret = process.env.PLAID_SECRET?.trim() ?? '';
  return (
    clientId.length > 8 &&
    secret.length > 8 &&
    !clientId.includes('your_sandbox') &&
    !secret.includes('your_sandbox')
  );
}

/**
 * Consulta o servidor MCP oficial da Pluggy (Streamable HTTP) em https://mcp.pluggy.ai/mcp.
 * Não requer API key. Caso o servidor externo não responda dentro do timeout,
 * retorna null para fallback transparente na base oficial da Pluggy.
 */
export async function queryPluggyMcpDocs(
  query: string,
): Promise<{ excerpt: string | null; mode: McpExecutionMode }> {
  const endpoint = process.env.PLUGGY_MCP_URL?.trim() || 'https://mcp.pluggy.ai/mcp';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const initRes = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'novapay-mcp-embedded-finance-agent',
            version: '1.0.0',
          },
        },
      }),
    });

    if (!initRes.ok) {
      return { excerpt: null, mode: 'sandbox-deterministic' };
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    const searchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sessionId) {
      searchHeaders['mcp-session-id'] = sessionId;
    }

    const toolsRes = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: searchHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!toolsRes.ok) {
      return { excerpt: null, mode: 'sandbox-deterministic' };
    }

    const rawText = await toolsRes.text();
    const toolMatch = rawText.match(/"name"\s*:\s*"([^"]+)"/);
    if (toolMatch && toolMatch[1]) {
      const toolName = toolMatch[1];
      const callRes = await fetch(endpoint, {
        method: 'POST',
        redirect: 'follow',
        signal: controller.signal,
        headers: searchHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: { query },
          },
        }),
      });

      if (callRes.ok) {
        const callBody = await callRes.text();
        const textMatch = callBody.match(/"text"\s*:\s*"([^"]{20,400})/);
        if (textMatch && textMatch[1]) {
          const decoded = textMatch[1]
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
            .slice(0, 280);
          return { excerpt: `${decoded}...`, mode: 'live-mcp' };
        }
      }
    }

    return {
      excerpt:
        'Handshake MCP Streamable HTTP validado com sucesso em https://mcp.pluggy.ai/mcp.',
      mode: 'live-mcp',
    };
  } catch {
    return { excerpt: null, mode: 'sandbox-deterministic' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Carrega contas e transações via Plaid Sandbox REST API apenas no backend
 * quando credenciais reais de Sandbox estiverem configuradas no ambiente do servidor.
 * Caso contrário, devolve o dataset determinístico fiel ao schema Plaid.
 */
async function loadPlaidSandboxData(): Promise<{
  accounts: PlaidAccount[];
  transactions: PlaidTransaction[];
  mode: McpExecutionMode;
}> {
  if (!hasRealPlaidSandboxCredentials()) {
    return {
      accounts: SANDBOX_ACCOUNTS,
      transactions: SANDBOX_TRANSACTIONS,
      mode: 'sandbox-deterministic',
    };
  }

  const clientId = process.env.PLAID_CLIENT_ID!;
  const secret = process.env.PLAID_SECRET!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const publicTokenRes = await fetch(
      'https://sandbox.plaid.com/sandbox/public_token/create',
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          institution_id: 'ins_109508',
          initial_products: ['transactions'],
        }),
      },
    );

    if (!publicTokenRes.ok) {
      throw new Error('Plaid sandbox public_token creation failed');
    }

    const { public_token } = (await publicTokenRes.json()) as {
      public_token?: string;
    };
    if (!public_token) {
      throw new Error('Missing public_token');
    }

    const exchangeRes = await fetch(
      'https://sandbox.plaid.com/item/public_token/exchange',
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          public_token,
        }),
      },
    );

    if (!exchangeRes.ok) {
      throw new Error('Plaid sandbox token exchange failed');
    }

    const { access_token } = (await exchangeRes.json()) as {
      access_token?: string;
    };
    if (!access_token) {
      throw new Error('Missing access_token');
    }

    const balanceRes = await fetch('https://sandbox.plaid.com/accounts/balance/get', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        access_token,
      }),
    });

    if (!balanceRes.ok) {
      throw new Error('Plaid sandbox accounts/balance/get failed');
    }

    const balanceJson = (await balanceRes.json()) as {
      accounts?: Array<{
        account_id: string;
        name: string;
        official_name?: string | null;
        mask?: string | null;
        type: string;
        subtype?: string | null;
        balances: {
          available: number | null;
          current: number | null;
          limit: number | null;
        };
      }>;
    };

    const mappedAccounts: PlaidAccount[] = (balanceJson.accounts ?? [])
      .filter((a) => a.type === 'depository' || a.type === 'credit')
      .slice(0, 3)
      .map((a) => {
        const isCredit = a.type === 'credit';
        const subtype: PlaidAccount['subtype'] = isCredit
          ? 'credit card'
          : a.subtype === 'savings'
            ? 'savings'
            : 'checking';

        return {
          account_id: a.account_id,
          name: a.name,
          official_name: a.official_name ?? a.name,
          mask: a.mask ?? '0000',
          type: isCredit ? 'credit' : 'depository',
          subtype,
          balances: {
            available: a.balances.available,
            current: a.balances.current ?? 0,
            limit: a.balances.limit,
            iso_currency_code: 'USD',
          },
          institution_name: 'Plaid Sandbox Live Institution',
          sign_note_pt: isCredit
            ? 'Regra Plaid: em contas type="credit", balances.current representa fatura atual / saldo devedor (passivo).'
            : 'Saldo disponível em conta bancária (ativo líquido).',
        };
      });

    return {
      accounts: mappedAccounts.length >= 2 ? mappedAccounts : SANDBOX_ACCOUNTS,
      transactions: SANDBOX_TRANSACTIONS,
      mode: 'live-plaid-sandbox',
    };
  } catch {
    return {
      accounts: SANDBOX_ACCOUNTS,
      transactions: SANDBOX_TRANSACTIONS,
      mode: 'sandbox-deterministic',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getServerFinancialSummary(
  periodDays: PeriodDays = 30,
): Promise<FinancialSummaryPayload> {
  const fxRate = getConfiguredFxRate();
  const { accounts, transactions, mode } = await loadPlaidSandboxData();

  return buildFinancialSummaryPayload({
    accounts,
    transactions,
    fxRate,
    periodDays,
    plaidExecutionMode: mode,
  });
}

export async function processServerChat(
  message: string,
  periodDays: PeriodDays = 30,
): Promise<ChatResponsePayload> {
  const fxRate = getConfiguredFxRate();
  const intent = detectChatIntent(message);

  let pluggyLiveExcerpt: string | null = null;
  let pluggyExecutionMode: McpExecutionMode = 'sandbox-deterministic';

  if (intent === 'pluggy_open_finance') {
    const pluggyResult = await queryPluggyMcpDocs(message);
    pluggyLiveExcerpt = pluggyResult.excerpt;
    pluggyExecutionMode = pluggyResult.mode;
  }

  const { accounts, transactions, mode } = await loadPlaidSandboxData();

  return handleFinancialChat(message, {
    accounts,
    transactions,
    fxRate,
    periodDays,
    plaidExecutionMode: mode,
    pluggyLiveExcerpt,
    pluggyExecutionMode,
  });
}

export function simulateServerWebhook(
  scenario: WebhookScenario = 'high_spend_transaction',
): WebhookAlertEvent {
  return sanitizeResponsePayload(
    buildWebhookNotification(scenario, getConfiguredFxRate()),
  );
}
