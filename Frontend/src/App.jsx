import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Clock,
  TrendingUp,
  RefreshCw,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
  CheckCircle2,
  Bot,
  User,
} from 'lucide-react';

// Simple Markdown Formatter with Table support (Sharp borders, white bg, black text)
function SimpleMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let tableRows = [];
  let inTable = false;

  const renderFormattedText = (text) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIdx = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(renderBoldItalic(text.substring(lastIdx, match.index)));
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-black font-semibold underline hover:text-gray-600 inline-flex items-center gap-0.5 ml-0.5"
        >
          {match[1]}
          <ExternalLink className="w-3 h-3 inline opacity-70" />
        </a>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      parts.push(renderBoldItalic(text.substring(lastIdx)));
    }
    return parts.length > 0 ? parts : text;
  };

  const renderBoldItalic = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-bold text-black">{part.slice(2, -2)}</strong>;
      }
      const codeParts = part.split(/(`[^`]+`)/g);
      return codeParts.map((cp, cidx) => {
        if (cp.startsWith('`') && cp.endsWith('`')) {
          return (
            <code key={cidx} className="bg-gray-100 text-black px-1.5 py-0.5 rounded-none text-xs font-mono border border-gray-200">
              {cp.slice(1, -1)}
            </code>
          );
        }
        return cp;
      });
    });
  };

  const flushTable = (key) => {
    if (tableRows.length === 0) return;
    const headerRow = tableRows[0];
    const bodyRows = tableRows.slice(1);
    elements.push(
      <div key={`table-${key}`} className="my-3 overflow-x-auto rounded-none border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {headerRow.map((cell, cidx) => (
                <th key={cidx} className="px-3.5 py-2.5 text-left font-bold text-black border-r border-gray-200 last:border-r-0">
                  {renderFormattedText(cell.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bodyRows.map((row, ridx) => (
              <tr key={ridx} className="hover:bg-gray-50/80 transition">
                {row.map((cell, cidx) => (
                  <td key={cidx} className="px-3.5 py-2.5 text-black border-r border-gray-200 last:border-r-0">
                    {renderFormattedText(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!cells.every((c) => /^:?-+:?$/.test(c))) {
        tableRows.push(cells);
      }
      return;
    } else if (inTable) {
      flushTable(index);
      inTable = false;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={index} className="text-sm font-bold text-black mt-4 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
          {renderFormattedText(trimmed.slice(4))}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={index} className="text-base font-bold text-black mt-5 mb-2.5 flex items-center gap-1.5">
          {renderFormattedText(trimmed.slice(3))}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={index} className="text-lg font-extrabold text-black mt-6 mb-3">
          {renderFormattedText(trimmed.slice(2))}
        </h1>
      );
    } else if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={index} className="border-l-2 border-black bg-gray-50 px-3.5 py-2 my-2.5 rounded-none text-sm text-gray-800">
          {renderFormattedText(trimmed.slice(2))}
        </blockquote>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={index} className="text-sm text-black ml-4 list-disc my-1 leading-relaxed">
          {renderFormattedText(trimmed.slice(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+\.)\s(.*)/);
      elements.push(
        <li key={index} className="text-sm text-black ml-4 list-decimal my-1 leading-relaxed">
          {renderFormattedText(match ? match[2] : trimmed)}
        </li>
      );
    } else if (trimmed.length > 0) {
      elements.push(
        <p key={index} className="text-sm text-black my-1.5 leading-relaxed">
          {renderFormattedText(trimmed)}
        </p>
      );
    }
  });

  if (inTable) {
    flushTable('end');
  }

  return <div className="space-y-1">{elements}</div>;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [sessionId] = useState('demo-session-temporal-01');
  const [showToolDetails, setShowToolDetails] = useState({});

  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessionMessages();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStep]);

  const fetchSessionMessages = async () => {
    try {
      console.log('[CLIENT API TRIGGER] Fetching past messages for session:', sessionId);
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        console.log('[CLIENT API RESPONSE] Loaded past messages:', data.messages?.length || 0);
        setMessages(
          (data.messages || []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            recordedDate: m.recorded_date,
            createdAt: m.created_at,
          }))
        );
      }
    } catch (err) {
      console.warn('[CLIENT API ERROR] Failed to load past messages:', err);
    }
  };

  const handleReset = async () => {
    if (!confirm('Clear all conversation messages?')) return;
    try {
      console.log('[CLIENT API TRIGGER] Resetting conversation via POST /api/reset');
      const res = await fetch('/api/reset', { method: 'POST' });
      const data = await res.json();
      console.log('[CLIENT API RESPONSE] Reset result:', data);
      setMessages([]);
    } catch (err) {
      console.error('[CLIENT API ERROR] Reset error:', err);
    }
  };

  const handleSend = async (queryText) => {
    const textToSend = typeof queryText === 'string' ? queryText : input;
    if (!textToSend || !textToSend.trim() || isStreaming) return;

    console.log('[CLIENT API TRIGGER] POST /api/chat with message:', textToSend);
    setInput('');
    setIsStreaming(true);
    setCurrentStep({ step: 'router', message: 'Checking memory...' });

    // User Message
    const tempUserId = `user-${Date.now()}`;
    const userMsg = {
      id: tempUserId,
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Assistant Message Placeholder
    const tempAssistantId = `assistant-${Date.now()}`;
    const assistantMsg = {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      memoryTrace: null,
      searchTrace: null,
      deltaDetected: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          sessionId,
        }),
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('ReadableStream not supported');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          let eventName = 'message';
          let eventDataStr = '';

          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventDataStr = line.slice(6);
            }
          }

          if (!eventDataStr) continue;
          try {
            const data = JSON.parse(eventDataStr);
            if (eventName !== 'token') {
              console.log(`[CLIENT API EVENT] Received "${eventName}":`, data);
            }
            handleSSEEvent(eventName, data, tempAssistantId);
          } catch (e) {
            console.warn('[CLIENT API ERROR] SSE Parse error:', e, eventDataStr);
          }
        }
      }
      console.log('[CLIENT API RESPONSE] Stream read fully completed.');
    } catch (err) {
      console.error('[CLIENT API ERROR] Chat error:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? { ...m, content: `Error during turn: ${err.message}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setCurrentStep(null);
    }
  };

  const handleSSEEvent = (event, data, assistantId) => {
    if (event === 'memory_trace') {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, memoryTrace: data } : m))
      );
      if (data.needsWebSearch) {
        setCurrentStep({ step: 'web_search', message: 'Searching live sources...' });
      } else {
        setCurrentStep({ step: 'pure_recall', message: 'Recalling from memory...' });
      }
    } else if (event === 'search_start') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, searchTrace: { queries: data.queries, count: data.count, status: 'searching' } }
            : m
        )
      );
    } else if (event === 'search_done') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          return {
            ...m,
            searchTrace: {
              ...(m.searchTrace || {}),
              latencyMs: data.latencyMs,
              resultsCount: data.resultsCount,
              output: data.output,
              status: 'done',
            },
          };
        })
      );
      setCurrentStep({ step: 'synthesis', message: 'Generating response...' });
    } else if (event === 'token') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + data.text } : m
        )
      );
    } else if (event === 'delta_detected') {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, deltaDetected: data } : m))
      );
    } else if (event === 'done') {
      setCurrentStep(null);
    }
  };

  return (
    <div className="flex h-screen w-full bg-white text-black flex-col overflow-hidden font-sans rounded-none">
      {/* 1. Sharp Minimal Header (No Caveman toggle, no Memory button) */}
      <header className="h-14 border-b border-gray-200 bg-white px-4 sm:px-6 flex items-center justify-between z-20 shrink-0 rounded-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-none bg-black text-white flex items-center justify-center font-bold text-sm">
            <span className="font-mono text-xs font-bold">B</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-black tracking-tight">
                Block AI
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear / Reset Chat Button */}
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-none bg-white hover:bg-gray-50 border border-gray-200 text-black text-xs font-medium transition flex items-center gap-1.5"
            title="Clear conversation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Clear Chat</span>
          </button>
        </div>
      </header>

      {/* 2. Main Chat Area */}
      <div className="flex-1 flex overflow-hidden relative bg-white rounded-none">
        <main className="flex-1 flex flex-col bg-white overflow-hidden relative rounded-none">
          {/* Subtle Live Step Banner */}
          {currentStep && (
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-black rounded-none">
              <div className="flex items-center gap-2 max-w-3xl mx-auto w-full">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                <span className="font-mono text-xs">{currentStep.message}</span>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-white">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.length === 0 ? (
                /* Pure Minimal Empty State (No hardcoded benchmarks) */
                <div className="py-24 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-none bg-gray-50 border border-gray-200 flex items-center justify-center mb-5 text-black">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-black mb-2 tracking-tight">
                    Block AI
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                    Type a message below to start chatting. Memories and facts will be stored automatically as you talk.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {/* Bot Avatar */}
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-none bg-white border border-gray-200 flex items-center justify-center text-black shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    {/* Message Bubble (Sharp borders, white bg / black text) */}
                    <div
                      className={`rounded-none p-4 transition ${
                        msg.role === 'user'
                          ? 'bg-black text-white max-w-xl border border-black shadow-none'
                          : 'bg-white text-black border border-gray-200 w-full max-w-2xl shadow-none'
                      }`}
                    >
                      {/* Telemetry Bar (Subtle, sharp, light gray) */}
                      {msg.role === 'assistant' && (msg.memoryTrace || msg.searchTrace) && (
                        <div className="mb-3 pb-2.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-black">
                          <div className="flex items-center gap-2">
                            {msg.memoryTrace && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-none text-black">
                                <Zap className="w-3 h-3 text-black" />
                                {msg.memoryTrace.latencyMs}ms Memory
                              </span>
                            )}
                            {msg.searchTrace && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-none text-black">
                                <Search className="w-3 h-3 text-black" />
                                {msg.searchTrace.latencyMs || 500}ms Web Search
                              </span>
                            )}
                            {msg.memoryTrace && !msg.memoryTrace.needsWebSearch && (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-none text-black">
                                <CheckCircle2 className="w-3 h-3 text-black" /> 0ms Tool Skip
                              </span>
                            )}
                          </div>

                          {/* Expandable Source Details Toggle */}
                          {(() => {
                            const allResults = (msg.searchTrace?.output || []).flatMap((o) => o.results || []);
                            const sourceCount = msg.searchTrace?.resultsCount || allResults.length;
                            if (sourceCount === 0) return null;
                            return (
                              <button
                                onClick={() =>
                                  setShowToolDetails((prev) => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id],
                                  }))
                                }
                                className="text-[11px] text-gray-600 hover:text-black font-mono flex items-center gap-1 transition"
                              >
                                <span>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'}</span>
                                {showToolDetails[msg.id] ? (
                                  <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronRight className="w-3 h-3" />
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      )}

                      {/* Expandable Source Details */}
                      {msg.role === 'assistant' &&
                        showToolDetails[msg.id] &&
                        msg.searchTrace?.output && (
                          <div className="mb-3 p-3 rounded-none bg-gray-50 border border-gray-200 space-y-2 text-xs">
                            {msg.searchTrace.output.map((out, oidx) => (
                              <div key={oidx} className="space-y-1">
                                {out.query && (
                                  <div className="font-mono text-black text-[10px] font-bold">
                                    Query: {out.query}
                                  </div>
                                )}
                                <div className="space-y-1.5 pl-2">
                                  {(out.results || []).map((item, iidx) => (
                                    <div key={iidx} className="flex items-center justify-between text-[11px]">
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-black underline hover:text-gray-600 truncate max-w-md flex items-center gap-1 font-medium"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                                        <span className="truncate">{item.title || item.url}</span>
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Content */}
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <SimpleMarkdown content={msg.content} />
                      )}
                    </div>

                    {/* User Avatar */}
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-none bg-black text-white border border-black flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sharp Floating Input Area (White bg, light gray border, sharp corners) */}
          <div className="p-4 sm:p-5 border-t border-gray-200 bg-white shrink-0 rounded-none">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="max-w-3xl mx-auto flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything or teach a fact..."
                className="flex-1 bg-white border border-gray-300 focus:border-black rounded-none px-4 py-3 text-sm text-black placeholder-gray-400 focus:outline-none transition shadow-none"
                disabled={isStreaming}
              />

              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="h-11 px-5 rounded-none bg-black hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center border border-black transition shadow-none"
              >
                {isStreaming ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
