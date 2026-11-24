export type CurrencyMode = 'BRL' | 'USD';

export type PeriodDays = 30 | 60 | 90;

export type McpServerName = 'plaid-sandbox' | 'pluggy-docs' | 'webhook-simulator';

export type McpTransport = 'stdio' | 'streamable-http' | 'internal-event';

export type McpExecutionMode = 'live-mcp' | 'live-plaid-sandbox' | 'sandbox-deterministic';

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string;
  mask: string;
  type: 'depository' | 'credit';
  subtype: 'checking' | 'savings' | 'credit card';
  balances: {
    available: number | null;
    current: number;
    limit: number | null;
    iso_currency_code: 'USD';
  };
  institution_name: string;
  sign_note_pt: string;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name: string;
  /**
   * Convenção oficial Plaid:
   * amount > 0 => saída de dinheiro (débito / gasto)
   * amount < 0 => entrada de dinheiro (crédito / salário / estorno)
   */
  amount: number;
  iso_currency_code: 'USD';
  category: string;
  category_pt: string;
  payment_channel: 'online' | 'in store' | 'other';
  pending: boolean;
}

export interface ClassifiedTransaction extends PlaidTransaction {
  direction: 'outflow' | 'inflow' | 'neutral';
  absoluteUsd: number;
  absoluteBrl: number;
}

export interface AccountSummary {
  checkingUsd: number;
  checkingBrl: number;
  savingsUsd: number;
  savingsBrl: number;
  liquidTotalUsd: number;
  liquidTotalBrl: number;
  creditCardDebtUsd: number;
  creditCardDebtBrl: number;
  creditCardLimitUsd: number;
  creditCardLimitBrl: number;
  creditCardAvailableUsd: number;
  creditCardAvailableBrl: number;
  creditUtilizationPct: number;
  netPositionUsd: number;
  netPositionBrl: number;
  fxRate: number;
  fxDeclaration: string;
}

export interface CategoryBreakdown {
  category: string;
  categoryPt: string;
  transactionCount: number;
  totalUsd: number;
  totalBrl: number;
  sharePct: number;
  averageTicketUsd: number;
  averageTicketBrl: number;
  topMerchant: string;
}

export interface SpendingPattern {
  rank: 1 | 2 | 3;
  category: string;
  categoryPt: string;
  transactionCount: number;
  totalUsd: number;
  totalBrl: number;
  sharePct: number;
  insightPt: string;
}

export interface SpendingAnalysis {
  periodDays: PeriodDays;
  referenceDate: string;
  outflowCount: number;
  inflowCount: number;
  totalOutflowUsd: number;
  totalOutflowBrl: number;
  totalInflowUsd: number;
  totalInflowBrl: number;
  categories: CategoryBreakdown[];
  top3Patterns: SpendingPattern[];
  fxRate: number;
  fxDeclaration: string;
}

export interface PurchaseEvaluation {
  itemLabel: string;
  amountBrl: number;
  amountUsd: number;
  verdict: 'APROVADO_COM_FOLGA' | 'APROVADO_COM_CAUTELA' | 'NAO_RECOMENDADO';
  verdictLabelPt: string;
  recommendedMethodPt: string;
  postPurchaseCheckingBrl: number;
  postPurchaseLiquidBrl: number;
  projectedCreditUtilizationPct: number;
  canPayCashFromChecking: boolean;
  canPayWithinCreditLimit: boolean;
  rationalePt: string[];
  fxRate: number;
  fxDeclaration: string;
}

export type WebhookScenario =
  | 'high_spend_transaction'
  | 'credit_statement_closing'
  | 'travel_budget_alert';

export interface WebhookAlertEvent {
  event_id: string;
  event_type: 'transactions/created' | 'credit_card/statement_closing' | 'budget/threshold_exceeded';
  provider: 'pluggy-webhook-simulator';
  created_at: string;
  channel: 'WhatsApp + Push';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  whatsappMessage: string;
  pushMessage: string;
  payload: Record<string, unknown>;
}

export interface McpTraceEvent {
  id: string;
  timestamp: string;
  server: McpServerName;
  transport: McpTransport;
  tool: string;
  mode: McpExecutionMode;
  latencyMs: number;
  status: 'ok' | 'fallback';
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
}

export type ChatIntent =
  | 'balances_and_debt'
  | 'spending_patterns'
  | 'purchase_decision'
  | 'pluggy_open_finance'
  | 'webhook_simulation'
  | 'general_overview';

export interface ChatResponsePayload {
  intent: ChatIntent;
  replyMarkdown: string;
  traces: McpTraceEvent[];
  webhookEvent?: WebhookAlertEvent;
  fxRate: number;
  fxDeclaration: string;
  sandboxNotice: string;
}

export interface FinancialSummaryPayload {
  sandboxNotice: string;
  fxRate: number;
  fxDeclaration: string;
  periodDays: PeriodDays;
  accounts: PlaidAccount[];
  accountSummary: AccountSummary;
  spendingAnalysis: SpendingAnalysis;
  recentTransactions: ClassifiedTransaction[];
  initialTraces: McpTraceEvent[];
}
