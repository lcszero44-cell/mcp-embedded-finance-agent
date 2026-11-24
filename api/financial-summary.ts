import { getServerFinancialSummary } from '../server/mcpClient.ts';
import type { PeriodDays } from '../src/core/types.ts';

interface ApiRequest {
  query?: { periodDays?: string | string[] };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const raw = Array.isArray(req.query?.periodDays)
    ? req.query?.periodDays[0]
    : req.query?.periodDays;
  const num = Number(raw);
  const periodDays: PeriodDays = num === 60 || num === 90 ? num : 30;

  const payload = await getServerFinancialSummary(periodDays);
  res.status(200).json(payload);
}
