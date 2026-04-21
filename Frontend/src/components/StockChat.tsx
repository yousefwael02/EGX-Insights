import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, RefreshCw, Send, Sparkles } from 'lucide-react';
import { sendStockChatMessage } from '../data';
import { cn } from '../lib/utils';
import { Stock, StockChatMessage } from '../types';
import StockLogo from './StockLogo';

interface StockChatProps {
  stocks: Stock[];
  loading: boolean;
  onSelectStock: (stock: Stock) => void;
}

interface ChatUiMessage extends StockChatMessage {
  id: string;
  usedFallback?: boolean;
}

const STARTER_PROMPTS = [
  'What stocks look strongest this week?',
  'What are the key EGX30 names?',
  'Which stocks look overvalued right now?',
  'Compare COMI and ETEL for me.',
];

const FEATURED_TICKERS = ['COMI', 'ETEL', 'FWRY', 'HRHO', 'ABUK', 'TMGH'];

function cleanMessageContent(content: string): string {
  let cleaned = content.trim();

  if (cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\t/g, ' ')
    .trim();

  return cleaned;
}

function renderInlineFormatting(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function renderMessageContent(content: string) {
  const cleaned = cleanMessageContent(content);
  const blocks = cleaned.split(/\n\s*\n/).filter(Boolean);

  return blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const isBulletList = lines.length > 0 && lines.every((line) => /^[-*•]/.test(line));

    if (isBulletList) {
      return (
        <ul key={`${index}-${block.slice(0, 12)}`} className="list-disc pl-5 space-y-2 marker:text-slate-400">
          {lines.map((line, lineIndex) => (
            <li key={`${index}-${lineIndex}`} className="leading-relaxed">
              {renderInlineFormatting(line.replace(/^[-*•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={`${index}-${block.slice(0, 12)}`} className="leading-relaxed">
        {renderInlineFormatting(lines.join(' '))}
      </p>
    );
  });
}

export default function StockChat({ stocks, loading, onSelectStock }: StockChatProps) {
  const [messages, setMessages] = useState<ChatUiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask me about EGX stocks, likely risers, valuation ideas, or the main EGX30 names. I can answer in plain language using the current market snapshot.',
    },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState(STARTER_PROMPTS);
  const endRef = useRef<HTMLDivElement | null>(null);

  const featuredStocks = useMemo(() => {
    const preferred = FEATURED_TICKERS
      .map((ticker) => stocks.find((stock) => stock.ticker === ticker))
      .filter(Boolean) as Stock[];

    if (preferred.length > 0) return preferred.slice(0, 6);

    return [...stocks]
      .sort((a, b) => b.upside - a.upside)
      .slice(0, 6);
  }, [stocks]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  const submitQuestion = async (rawQuestion?: string) => {
    const question = (rawQuestion ?? input).trim();
    if (!question || pending) return;

    const userMessage: ChatUiMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPending(true);

    try {
      const response = await sendStockChatMessage(question, history);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          usedFallback: response.usedFallback,
        },
      ]);
      setSuggestedQuestions(
        response.suggestedQuestions?.length ? response.suggestedQuestions : STARTER_PROMPTS,
      );
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content:
            'I could not reach the stock assistant just now. Please try again in a moment.',
          usedFallback: true,
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitQuestion();
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await submitQuestion();
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-xs font-bold border border-violet-200">
          <Sparkles className="w-3.5 h-3.5" />
          New AI feature
        </div>
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter mb-2">
            Stock AI Chat
          </h1>
          <p className="text-slate-500 max-w-2xl">
            Ask natural questions about EGX stocks, market tone, likely risers, and key blue-chip names.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-[11px] font-semibold border border-slate-200">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Gemini reply
            <span className="mx-1 text-slate-300">•</span>
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> Local fallback reply
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.7fr]">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">EGX Market Assistant</h2>
                <p className="text-xs text-slate-400">Conversational stock help powered by live market context</p>
              </div>
            </div>
            <button
              onClick={() => {
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content:
                      'Ask me about EGX stocks, likely risers, valuation ideas, or the main EGX30 names. I can answer in plain language using the current market snapshot.',
                  },
                ]);
                setSuggestedQuestions(STARTER_PROMPTS);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70">
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => submitQuestion(prompt)}
                  disabled={pending}
                  className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[520px] overflow-y-auto bg-slate-50/60 px-4 py-5 space-y-4">
            {messages.map((message) => {
              const isAssistant = message.role === 'assistant';
              const showSourceBadge = isAssistant && message.id !== 'welcome';
              return (
                <div
                  key={message.id}
                  className={cn('flex gap-3', isAssistant ? 'justify-start' : 'justify-end')}
                >
                  {isAssistant && (
                    <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border text-sm leading-relaxed whitespace-pre-wrap',
                      isAssistant
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-slate-900 border-slate-900 text-white',
                    )}
                  >
                    <div className="space-y-3">
                      {renderMessageContent(message.content)}
                    </div>
                    {showSourceBadge && (
                      message.usedFallback ? (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          Local fallback reply
                        </div>
                      ) : (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                          <Sparkles className="w-3 h-3" />
                          Gemini reply
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {pending && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-500 shadow-sm">
                  Thinking through the market snapshot…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 bg-white">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask about EGX stocks, sectors, likely risers, or a specific ticker…"
                className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-black text-white px-4 py-3 text-sm font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-900 mb-3">What you can ask</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• What stocks may rise this week?</li>
              <li>• What are the key EGX30 names?</li>
              <li>• Which shares look overvalued now?</li>
              <li>• Compare two tickers for me.</li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-900 mb-3">Popular tracked stocks</h3>
            <div className="space-y-2">
              {loading ? (
                <p className="text-sm text-slate-400">Loading stocks…</p>
              ) : (
                featuredStocks.map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => onSelectStock(stock)}
                    className="w-full flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50 text-left"
                  >
                    <StockLogo ticker={stock.ticker} logo={stock.logo} size="w-9 h-9" textSize="text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900">{stock.ticker}</p>
                      <p className="text-xs text-slate-500 truncate">{stock.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-slate-700">EGP {stock.currentPrice.toFixed(2)}</p>
                      <p className={cn(
                        'text-[10px] font-bold',
                        stock.upside >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}>
                        {stock.upside >= 0 ? '+' : ''}{stock.upside.toFixed(1)}%
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
