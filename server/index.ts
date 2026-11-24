import cors from 'cors';
import express from 'express';
import {
  getServerFinancialSummary,
  processServerChat,
  simulateServerWebhook,
} from './mcpClient.ts';
import type { PeriodDays, WebhookScenario } from '../src/core/types.ts';

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

function parsePeriod(raw: unknown): PeriodDays {
  const num = Number(raw);
  if (num === 60 || num === 90) return num;
  return 30;
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mcp-embedded-finance-agent',
    plaidEnv: process.env.PLAID_ENV || 'sandbox',
    pluggyMcpUrl: process.env.PLUGGY_MCP_URL || 'https://mcp.pluggy.ai/mcp',
    secretsExposed: false,
  });
});

app.get('/api/financial-summary', async (req, res) => {
  try {
    const periodDays = parsePeriod(req.query.periodDays);
    const payload = await getServerFinancialSummary(periodDays);
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'Falha ao consultar resumo financeiro Sandbox.' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { message?: string; periodDays?: number };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'Campo "message" é obrigatório.' });
      return;
    }

    const periodDays = parsePeriod(body.periodDays);
    const payload = await processServerChat(message, periodDays);
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'Falha ao processar mensagem no orquestrador MCP.' });
  }
});

app.post('/api/webhook/simulate', (req, res) => {
  const body = (req.body ?? {}) as { scenario?: WebhookScenario };
  const allowed: WebhookScenario[] = [
    'high_spend_transaction',
    'credit_statement_closing',
    'travel_budget_alert',
  ];
  const scenario =
    body.scenario && allowed.includes(body.scenario)
      ? body.scenario
      : 'high_spend_transaction';

  res.json(simulateServerWebhook(scenario));
});

app.listen(port, () => {
  console.log(
    `[NovaPay MCP Backend] Rodando em http://localhost:${port} (Modo Sandbox Seguro)`,
  );
});
