'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, getTenantId, getManagerId } from '@/lib/auth'

const BI_URL = process.env['NEXT_PUBLIC_BI_SERVICE_URL'] ?? 'http://localhost:3016'

const SUGGESTED_QUESTIONS = [
  'What will my occupancy be in December?',
  'How should I price suites this weekend?',
  'Am I understaffed for next Friday?',
  "What's driving RevPAR decline this month?",
]

interface ToolCall {
  tool: string
  result: object
}

interface BiMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  timestamp: Date
  toolCalls?: ToolCall[]
  responseTimeMs?: number
  error?: boolean
}

function formatBoldText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function SourceCitations({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [open, setOpen] = useState(false)

  const labels: Record<string, string> = {
    get_occupancy_forecast: 'Occupancy forecast (ML model)',
    get_current_rates: 'Current room rates',
    get_events_calendar: 'Local events calendar',
    get_competitor_rates: 'Competitor rate data',
    get_historical_revpar: 'Historical RevPAR (billing)',
  }

  return (
    <div className="bi-sources">
      <button
        type="button"
        className="bi-sources-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Data sources used ({toolCalls.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul className="bi-sources-list" role="list">
          {toolCalls.map((tc, i) => (
            <li key={i} className="bi-source-item">
              <span aria-hidden="true">—</span>
              {labels[tc.tool] ?? tc.tool}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function BiPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<BiMessage[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
    }
  }, [router])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function adjustTextarea() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }

  async function sendQuestion(q: string) {
    const trimmed = q.trim()
    if (!trimmed || loading) return

    setQuestion('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setError(null)

    const userMsg: BiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const tenantId = getTenantId() ?? 'demo-tenant'
      const userId = getManagerId() ?? 'demo-manager'

      const res = await fetch(`${BI_URL}/v1/bi/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({ tenantId, userId, question: trimmed }),
      })

      if (res.status === 408) {
        throw new Error('The AI took too long to respond. Please try a simpler question.')
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ?? `Server error ${res.status}`,
        )
      }

      const { data } = (await res.json()) as {
        data: {
          answer: string
          toolCallsMade: ToolCall[]
          responseTimeMs: number
        }
      }

      const aiMsg: BiMessage = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: data.answer,
        timestamp: new Date(),
        toolCalls: data.toolCallsMade,
        responseTimeMs: data.responseTimeMs,
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      const errMsg: BiMessage = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: (err as Error).message,
        timestamp: new Date(),
        error: true,
      }
      setMessages((prev) => [...prev, errMsg])
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void sendQuestion(question)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendQuestion(question)
    }
  }

  return (
    <div className="bi-page">
      <header className="page-header">
        <h1 className="page-title">AI Business Intelligence</h1>
        <p className="page-subtitle">Ask questions about your hotel in plain English</p>
      </header>

      <section
        className="bi-chat-area"
        aria-label="Conversation"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.length === 0 && !loading && (
          <p className="loading-text" style={{ paddingTop: '3rem' }}>
            Ask a question below to get started.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`bi-message ${msg.role === 'user' ? 'bi-message-user' : 'bi-message-ai'}`}
          >
            <div
              className={`bi-bubble ${msg.role === 'user' ? 'bi-bubble-user' : 'bi-bubble-ai'}`}
              style={msg.error ? { borderColor: 'rgba(192,57,43,0.4)', color: 'var(--color-danger)' } : undefined}
            >
              {formatBoldText(msg.text)}

              {msg.role === 'ai' && msg.toolCalls && msg.toolCalls.length > 0 && (
                <SourceCitations toolCalls={msg.toolCalls} />
              )}
            </div>
            <div className="bi-message-meta">
              <span>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {msg.responseTimeMs !== undefined && (
                <span className="bi-response-time" aria-label={`Response time: ${(msg.responseTimeMs / 1000).toFixed(1)} seconds`}>
                  {(msg.responseTimeMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="bi-typing" aria-label="AI is thinking" role="status">
            <div className="bi-typing-dot" aria-hidden="true" />
            <div className="bi-typing-dot" aria-hidden="true" />
            <div className="bi-typing-dot" aria-hidden="true" />
          </div>
        )}

        <div ref={chatEndRef} aria-hidden="true" />
      </section>

      <div className="bi-input-area">
        {messages.length === 0 && (
          <div className="bi-chips" role="list" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="bi-chip"
                role="listitem"
                onClick={() => void sendQuestion(q)}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="alert alert-error">
            {error}{' '}
            <button
              type="button"
              onClick={() => {
                setError(null)
                const last = messages.findLast((m) => m.role === 'user')
                if (last) void sendQuestion(last.text)
              }}
              style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bi-input-row">
          <label htmlFor="bi-question" className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
            Ask a question
          </label>
          <textarea
            id="bi-question"
            ref={textareaRef}
            className="form-textarea"
            rows={1}
            placeholder="e.g. What will my occupancy be next weekend?"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              adjustTextarea()
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            aria-label="Type your question"
          />
          <button
            type="submit"
            className="bi-send-btn"
            disabled={!question.trim() || loading}
            aria-label="Send question"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
