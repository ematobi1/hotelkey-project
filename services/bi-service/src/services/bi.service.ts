import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config'
import { toolDefinitions, executeTool } from './tools'
import type { Pool } from 'pg'

const SYSTEM_PROMPT = `You are Hotel Key's AI Business Intelligence assistant. You help hotel managers make data-driven decisions about pricing, staffing, and operations.

When answering questions:
1. ALWAYS call the relevant tools to get real data before making recommendations
2. ALWAYS cite your sources: mention which tool returned which data point
3. Be specific: give concrete numbers, not vague advice
4. Keep responses concise but complete — 3-5 paragraphs maximum
5. If data is unavailable, say so explicitly rather than guessing
6. Format numbers clearly: percentages as "72%", money as "$189/night", etc.

You have access to: occupancy forecasts (ML model), current room rates, local events calendar, competitor rates, and historical RevPAR data.`

export interface BiResponse {
  answer: string
  toolCallsMade: Array<{ tool: string; result: object }>
  responseTimeMs: number
  modelVersion: string
}

export class BiService {
  private readonly anthropic: Anthropic
  private readonly db: Pool

  constructor(db: Pool) {
    this.anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
    this.db = db
  }

  async query(tenantId: string, userId: string, question: string): Promise<BiResponse> {
    const start = Date.now()
    const toolCallsMade: Array<{ tool: string; result: object }> = []

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]

    let finalAnswer = ''

    while (true) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // reason: cache_control is valid per the API but not yet typed on TextBlockParam in this SDK version
            cache_control: { type: 'ephemeral' },
          } as unknown as Anthropic.TextBlockParam,
        ],
        tools: toolDefinitions,
        messages,
      })

      if (response.stop_reason === 'end_turn') {
        finalAnswer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        break
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          try {
            const result = await executeTool(block.name, block.input as Record<string, unknown>)
            toolCallsMade.push({ tool: block.name, result })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: `Tool error: ${(err as Error).message}`,
            })
          }
        }

        messages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    const responseTimeMs = Date.now() - start

    await this.db.query(
      `INSERT INTO bi_conversation (tenant_id, user_id, question, answer, tool_calls_made, response_time_ms, model_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        userId,
        question,
        finalAnswer,
        JSON.stringify(toolCallsMade),
        responseTimeMs,
        'claude-sonnet-4-6',
      ],
    )

    return {
      answer: finalAnswer,
      toolCallsMade,
      responseTimeMs,
      modelVersion: 'claude-sonnet-4-6',
    }
  }

  async getHistory(tenantId: string, limit = 20): Promise<object[]> {
    const { rows } = await this.db.query(
      `SELECT id, user_id, question, answer, response_time_ms, created_at
       FROM bi_conversation
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    )
    return rows
  }

  async deleteHistory(tenantId: string): Promise<void> {
    await this.db.query(`DELETE FROM bi_conversation WHERE tenant_id = $1`, [tenantId])
  }
}
