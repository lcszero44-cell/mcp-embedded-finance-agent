import { processServerChat } from '../server/mcpClient.ts';
import type { PeriodDays } from '../src/core/types.ts';

interface ApiRequest {
  method?: string;
  body?: { message?: string; periodDays?: number };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST /api/chat' });
    return;
  }

  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'Campo "message" é obrigatório.' });
    return;
  }

  const rawPeriod = Number(req.body?.periodDays);
  const periodDays: PeriodDays =
    rawPeriod === 60 || rawPeriod === 90 ? rawPeriod : 30;

  const payload = await processServerChat(message, periodDays);
  res.status(200).json(payload);
}
