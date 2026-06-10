import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

vi.mock('../config', () => ({
  config: {
    ANTHROPIC_API_KEY: 'test-key',
    NODE_ENV: 'test',
    PORT: 3016,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    ML_SERVICE_URL: 'http://localhost:8001',
    RESERVATION_SERVICE_URL: 'http://localhost:3003',
    ROOM_SERVICE_URL: 'http://localhost:3004',
    BILLING_SERVICE_URL: 'http://localhost:3005',
  },
}))

import { BiService } from '../services/bi.service'

const mockDb = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
}

describe('BiService', () => {
  let svc: BiService

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.query.mockResolvedValue({ rows: [] })
    svc = new BiService(mockDb as unknown as import('pg').Pool)
  })

  it('query — calls Anthropic and returns answer with model version', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: 'Your occupancy for December is forecast at **72%**, based on the ML model.',
        },
      ],
    })

    const result = await svc.query(
      '00000000-0000-0000-0000-000000000001',
      'manager-1',
      'What will my occupancy be in December?',
    )

    expect(result.answer).toContain('72%')
    expect(result.modelVersion).toBe('claude-sonnet-4-6')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockDb.query).toHaveBeenCalledOnce()
  })

  it('query — executes tool call when Claude requests it', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu_001',
            name: 'get_historical_revpar',
            input: {
              tenant_id: '00000000-0000-0000-0000-000000000001',
              from_date: '2026-01-01',
              to_date: '2026-06-30',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'Based on historical RevPAR data from the billing service, your RevPAR in May was $142.30.',
          },
        ],
      })

    const result = await svc.query(
      '00000000-0000-0000-0000-000000000001',
      'manager-1',
      "What's driving RevPAR decline this month?",
    )

    expect(result.toolCallsMade).toHaveLength(1)
    expect(result.toolCallsMade[0]?.tool).toBe('get_historical_revpar')
    expect(result.answer).toContain('RevPAR')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('query — handles tool error gracefully and returns partial answer', async () => {
    // Simulate Claude calling a tool that returns is_error, then Claude giving a graceful answer.
    // bi.service wraps executeTool in try/catch and sends is_error back to Claude.
    // We test this end-to-end by using an unknown tool name so executeTool throws.
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu_002',
            name: 'unknown_tool_that_does_not_exist',
            input: { tenant_id: '00000000-0000-0000-0000-000000000001' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'I encountered an issue retrieving the data. Based on available information I can offer guidance.',
          },
        ],
      })

    const result = await svc.query(
      '00000000-0000-0000-0000-000000000001',
      'manager-1',
      'Show me the occupancy forecast',
    )

    expect(result.answer).toBeTruthy()
    expect(result.answer.length).toBeGreaterThan(0)
    // toolCallsMade should be empty since the tool threw before producing a result
    expect(result.toolCallsMade).toHaveLength(0)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockDb.query).toHaveBeenCalledOnce()
  })

  it('getHistory — paginates conversation history', async () => {
    const mockRows = [
      {
        id: '1',
        user_id: 'manager-1',
        question: 'What is my occupancy?',
        answer: 'Your occupancy is 72%.',
        response_time_ms: 3200,
        created_at: new Date('2026-06-09T10:00:00Z'),
      },
      {
        id: '2',
        user_id: 'manager-1',
        question: 'How are competitor rates?',
        answer: 'Competitor rates average $183/night.',
        response_time_ms: 2800,
        created_at: new Date('2026-06-09T09:00:00Z'),
      },
    ]
    mockDb.query.mockResolvedValueOnce({ rows: mockRows })

    const history = await svc.getHistory('00000000-0000-0000-0000-000000000001', 10)

    expect(history).toHaveLength(2)
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), [
      '00000000-0000-0000-0000-000000000001',
      10,
    ])
  })
})
