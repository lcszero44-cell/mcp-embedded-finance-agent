import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, User, Wrench } from 'lucide-react';
import type { McpTraceEvent } from '../core/types.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  traces?: McpTraceEvent[];
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (text: string) => void;
}

export const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'Saldo & Dívida no Cartão',
    prompt: 'Qual é o meu saldo atual e quanto tenho de dívida no cartão?',
  },
  {
    label: 'Top 3 Padrões & Categorias',
    prompt:
      'Mostre uma tabela com meus 3 principais padrões de gasto e gastos por categoria.',
  },
  {
    label: 'Comprar Passagem R$ 2.400?',
    prompt:
      'Posso comprar uma passagem de R$ 2.400 agora sem comprometer meu orçamento?',
  },
  {
    label: 'Item Pluggy & Open Finance BR',
    prompt:
      'O que é um Item na Pluggy e qual a diferença para o Open Finance Brasil?',
  },
  {
    label: 'Simular Webhook WhatsApp',
    prompt: 'Simular alerta de webhook de nova transação no WhatsApp.',
  },
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isSending,
  onSend,
}) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    onSend(trimmed);
  };

  return (
    <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl shadow-black/30 overflow-hidden h-[calc(100vh-12.5rem)] min-h-[600px]">
      {/* Chat Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-50">
              NovaPay Embedded Finance Assistant
            </h2>
            <p className="text-[11px] text-slate-400">
              Roteamento inteligente: Plaid Sandbox MCP + Pluggy Docs MCP
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            plaid-sandbox (STDIO)
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            pluggy-docs (HTTP)
          </span>
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="border-b border-slate-800/80 bg-slate-950/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          Perguntas Rápidas (Cobertura 100% dos Cenários DIO):
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isSending}
              onClick={() => onSend(item.prompt)}
              className="rounded-lg border border-slate-700/80 bg-slate-900 hover:border-cyan-500/60 hover:bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-cyan-600/25 border border-cyan-500/40 text-slate-50 rounded-tr-sm'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-100 rounded-tl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                <p className="text-[13px] leading-relaxed">{msg.content}</p>
              )}

              {msg.traces && msg.traces.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-2">
                  <Wrench className="h-3 w-3 text-slate-500" />
                  {msg.traces.map((t) => (
                    <span
                      key={t.id}
                      className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 border border-slate-800"
                    >
                      {t.server}:{t.tool} ({t.latencyMs}ms)
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-1.5 text-[10px] text-slate-500 text-right">
                {msg.timestamp}
              </p>
            </div>

            {msg.role === 'user' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-cyan-300 px-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            Consultando servidores MCP e consolidando resposta em português...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 bg-slate-950/80 p-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre saldos, gastos por categoria, compra em R$ ou Pluggy Open Finance..."
          className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors cursor-pointer"
        >
          <Send className="h-4 w-4" />
          Enviar
        </button>
      </form>
    </section>
  );
};
