---
name: mcp-financial-connector
description: Configura, valida e opera servidores MCP financeiros (Pluggy Docs via Streamable HTTP e Plaid Sandbox via STDIO/uvx) com regras de segurança, convenção de sinal Plaid, conversão USD/BRL declarada e mapeamento para Open Finance Brasil.
---

# Skill: MCP Financial Connector (Pluggy Docs + Plaid Sandbox)

Esta skill padroniza a configuração, operação segura e interpretação financeira de dois servidores **Model Context Protocol (MCP)** usados em cenários de **Embedded Finance**:

1. **`pluggy-docs` (Streamable HTTP — sem chave):** Documentação oficial da Pluggy sobre Open Finance Brasil (`Item`, `Connector`, `Account`, `Transaction`, `Webhook`, consentimento Bacen).
2. **`plaid-sandbox` (STDIO via `uvx`):** Consulta de contas bancárias, saldos, cartões de crédito e transações no ambiente **Plaid Sandbox** com dados fictícios.

---

## 1. Regras Invioláveis de Segurança

- **NUNCA** escreva `PLAID_CLIENT_ID`, `PLAID_SECRET` ou `access_token` em código-fonte, Markdown, JSON versionado, prompts salvos ou logs.
- Use **apenas** placeholders (`${PLAID_CLIENT_ID}`, `${PLAID_SECRET}`) em arquivos versionados como `mcp/mcp_servers.json` e `.env.example`.
- Sempre mantenha `PLAID_ENV=sandbox` em demonstrações e exiba o aviso explícito:
  > **"Ambiente de Demonstração Sandbox — Dados Fictícios (Plaid Sandbox & Pluggy MCP Docs)"**
- Em aplicações web (Etapa 2), toda chamada autenticada à Plaid DEVE passar por um **backend seguro** (`/api/chat`, `/api/financial-summary`), nunca diretamente pelo navegador.

---

## 2. Pré-requisitos e Setup por Sistema Operacional

### Windows (PowerShell)
```powershell
# 1. Instalar uv / uvx (Astral) se ainda não estiver instalado
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
uvx --version

# 2. Definir credenciais Plaid Sandbox apenas na sessão local (ou .env não versionado)
$env:PLAID_CLIENT_ID = "your_sandbox_client_id"
$env:PLAID_SECRET    = "your_sandbox_secret"
$env:PLAID_ENV       = "sandbox"

# 3. Testar conectividade com Pluggy MCP (Streamable HTTP)
curl.exe -iL https://mcp.pluggy.ai/mcp
```

### macOS / Linux (Bash/Zsh)
```bash
# 1. Instalar uv / uvx
curl -LsSf https://astral.sh/uv/install.sh | sh
uvx --version

# 2. Exportar credenciais localmente (nunca commitar)
export PLAID_CLIENT_ID="your_sandbox_client_id"
export PLAID_SECRET="your_sandbox_secret"
export PLAID_ENV="sandbox"

# 3. Testar Pluggy MCP
curl -iL https://mcp.pluggy.ai/mcp
```

---

## 3. Configuração Padrão MCP (`mcp/mcp_servers.json`)

Aponte seu cliente MCP (Codex, Claude Desktop/Code, Cursor ou Antigravity) para `mcp/mcp_servers.json`:

```json
{
  "mcpServers": {
    "pluggy-docs": {
      "transport": "streamable-http",
      "type": "http",
      "url": "https://mcp.pluggy.ai/mcp"
    },
    "plaid-sandbox": {
      "transport": "stdio",
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-plaid"],
      "env": {
        "PLAID_CLIENT_ID": "${PLAID_CLIENT_ID}",
        "PLAID_SECRET": "${PLAID_SECRET}",
        "PLAID_ENV": "sandbox"
      }
    }
  }
}
```

---

## 4. Protocolo de Roteamento de Ferramentas MCP

Ao receber uma pergunta do usuário, classifique a intenção antes de invocar ferramentas:

| Intenção do Usuário | Servidor MCP | Ferramenta / Endpoint | Objetivo |
|---|---|---|---|
| Saldo, contas, fatura de cartão | `plaid-sandbox` | `accounts/balance/get` | Listar conta corrente, poupança e cartão de crédito |
| Extrato, categorias, 3 maiores gastos | `plaid-sandbox` | `transactions/get` | Agrupar saídas (`amount > 0`) por categoria e período |
| Decisão de compra (Embedded Finance) | `plaid-sandbox` | `accounts/balance/get` + `transactions/get` | Avaliar liquidez, margem pós-compra e uso de limite |
| Open Finance Brasil / Conceitos Pluggy | `pluggy-docs` | `search_docs` (Streamable HTTP) | Consultar conceitos oficiais (`Item`, `Connector`, consentimento Bacen, webhooks) |
| Notificação em tempo real | `webhook-simulator` | `POST /api/webhook/simulate` | Simular evento de webhook → alerta WhatsApp / Push |

---

## 5. Regras Contábeis & Conversão Monetária Obrigatórias

### 5.1 Convenção de Sinal da Plaid (CRÍTICO)
A API da Plaid adota convenção inversa à de alguns extratos bancários tradicionais:
- **`amount > 0` (Positivo):** **Saída de dinheiro** (débito, compra no cartão, pagamento, tarifa).
- **`amount < 0` (Negativo):** **Entrada de dinheiro** (salário, estorno/reembolso, transferência recebida, pagamento de fatura).
- **Contas `type: "credit"` (Cartão de Crédito):** `balances.current` representa **fatura atual / saldo devedor (passivo)** — **NUNCA** deve ser somado ao saldo disponível em conta corrente! O limite livre é `balances.limit - balances.current`.

### 5.2 Conversão USD → BRL Declarada
Como os dados fictícios do Plaid Sandbox são denominados em **USD**, toda conversão para **BRL** DEVE declarar explicitamente a taxa aplicada na resposta:
- Taxa de referência padrão configurável via `USD_TO_BRL_RATE`: **`1 USD = R$ 5,75 — câmbio comercial de referência declarado`**.
- Exiba sempre ambos os valores (`USD` e `BRL`) ou permita alternância clara na UI.

---

## 6. Diferença Estrutural: Plaid Sandbox vs Open Finance Brasil (Pluggy)

Sempre esclareça ao usuário quando a pergunta cruzar dados de demonstração com o ecossistema brasileiro:
- **Plaid Sandbox:** Dados sintéticos em USD no modelo de agregação norte-americano (`Item` + `access_token`), ideal para prototipagem segura sem dados reais.
- **Open Finance Brasil via Pluggy:** Regulado pelo **Banco Central do Brasil (Bacen)**, com **consentimento explícito, granular e revogável** (OAuth/FAPI), redirecionamento autenticado na instituição financeira, **Connectors** (instituições participantes) e **Items** (vínculo ativo do usuário a um Connector com status de sincronização e suporte a **Webhooks** assíncronos).

---

## 7. Checklist de Verificação Antes de Responder

1. Confirme que nenhuma credencial foi ecoada na resposta ou no log do Inspector MCP.
2. Verifique se entradas (`amount < 0`) foram excluídas do somatório de gastos por categoria.
3. Verifique se o saldo de cartão de crédito foi rotulado como **dívida / fatura** e subtraído (não somado) da posição líquida.
4. Declare a taxa de câmbio ao apresentar valores em `R$`.
5. Responda em português claro, estruturado e orientado à decisão no contexto do app do cliente.
