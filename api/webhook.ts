import { simulateServerWebhook } from '../server/mcpClient.ts';
import type { WebhookScenario } from '../src/core/types.ts';

interface ApiRequest {
  method?: string;
  body?: { scenario?: WebhookScenario };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/webhook' });
    return;
  }

  const allowed: WebhookScenario[] = [
    'high_spend_transaction',
    'credit_statement_closing',
    'travel_budget_alert',
  ];
  const scenario =
    req.body?.scenario && allowed.includes(req.body.scenario)
      ? req.body.scenario
      : 'high_spend_transaction';

  res.status(200).json(simulateServerWebhook(scenario));
}
