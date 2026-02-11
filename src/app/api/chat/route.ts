import { query } from '@anthropic-ai/claude-agent-sdk'
import * as Sentry from '@sentry/nextjs'
import { randomUUID } from 'crypto'

const SYSTEM_PROMPT = `You are a helpful personal assistant designed to help with general research, questions, and tasks.

Your role is to:
- Answer questions on any topic accurately and thoroughly
- Help with research by searching the web for current information
- Assist with writing, editing, and brainstorming
- Provide explanations and summaries of complex topics
- Help solve problems and think through decisions

Guidelines:
- Be friendly, clear, and conversational
- Use web search when you need current information, facts you're unsure about, or real-time data
- Keep responses concise but complete - expand when the topic warrants depth
- Use markdown formatting when it helps readability (bullet points, code blocks, etc.)
- Be honest when you don't know something and offer to search for answers`

interface MessageInput {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  const requestStartTime = Date.now()
  const requestId = randomUUID()

  try {
    // Log incoming request
    Sentry.addBreadcrumb({
      category: 'chat',
      message: 'Chat request received',
      level: 'info',
      data: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    })
    Sentry.setContext('request', { request_id: requestId })

    const { messages } = await request.json() as { messages: MessageInput[] }

    if (!messages || !Array.isArray(messages)) {
      Sentry.addBreadcrumb({
        category: 'chat.validation',
        message: 'Validation error: missing messages',
        level: 'warning',
        data: {
          request_id: requestId,
          error_type: 'missing_messages',
        },
      })
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    if (!lastUserMessage) {
      Sentry.addBreadcrumb({
        category: 'chat.validation',
        message: 'Validation error: no user message',
        level: 'warning',
        data: {
          request_id: requestId,
          error_type: 'no_user_message',
        },
      })
      return new Response(
        JSON.stringify({ error: 'No user message found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build conversation context
    const conversationContext = messages
      .slice(0, -1) // Exclude the last message since we pass it as the prompt
      .map((m: MessageInput) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const fullPrompt = conversationContext
      ? `${SYSTEM_PROMPT}\n\nPrevious conversation:\n${conversationContext}\n\nUser: ${lastUserMessage.content}`
      : `${SYSTEM_PROMPT}\n\nUser: ${lastUserMessage.content}`

    // Create a streaming response
    const encoder = new TextEncoder()
    const streamStartTime = Date.now()
    let chunkCount = 0
    let textDeltaCount = 0
    let toolsUsedCount = 0
    let parseErrorCount = 0

    // Log stream start
    Sentry.addBreadcrumb({
      category: 'chat.stream',
      message: 'Chat stream started',
      level: 'info',
      data: {
        request_id: requestId,
        message_count: messages.length,
        last_message_length: lastUserMessage.content.length,
      },
    })

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use the claude-agent-sdk query function with all default tools enabled
          for await (const message of query({
            prompt: fullPrompt,
            options: {
              maxTurns: 10,
              // Use the preset to enable all Claude Code tools including WebSearch
              tools: { type: 'preset', preset: 'claude_code' },
              // Bypass all permission checks for automated tool execution
              permissionMode: 'bypassPermissions',
              allowDangerouslySkipPermissions: true,
              // Enable partial messages for real-time text streaming
              includePartialMessages: true,
              // Set working directory to the app's directory for sandboxing
              cwd: process.cwd(),
            }
          })) {
            chunkCount++

            // Handle streaming text deltas (partial messages)
            if (message.type === 'stream_event' && 'event' in message) {
              const event = message.event
              // Handle content block delta events for text streaming
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                textDeltaCount++
                try {
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`
                  ))
                } catch (encodeError) {
                  parseErrorCount++
                  Sentry.addBreadcrumb({
                    category: 'chat.stream',
                    message: 'Parse error during text delta encoding',
                    level: 'warning',
                    data: {
                      request_id: requestId,
                      error_type: 'text_delta_encoding',
                      error: encodeError instanceof Error ? encodeError.message : 'Unknown',
                    },
                  })
                }
              }
            }

            // Send tool start events from assistant messages
            if (message.type === 'assistant' && 'message' in message) {
              const content = message.message?.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'tool_use') {
                    toolsUsedCount++
                    Sentry.addBreadcrumb({
                      category: 'chat.tool',
                      message: `Tool started: ${block.name}`,
                      level: 'info',
                      data: {
                        request_id: requestId,
                        tool_name: block.name,
                        tool_id: block.id,
                      },
                    })
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ type: 'tool_start', tool: block.name })}\n\n`
                    ))
                  }
                }
              }
            }

            // Send tool progress updates
            if (message.type === 'tool_progress') {
              Sentry.addBreadcrumb({
                category: 'chat.tool',
                message: `Tool progress: ${message.tool_name}`,
                level: 'info',
                data: {
                  request_id: requestId,
                  tool_name: message.tool_name,
                  elapsed_seconds: message.elapsed_time_seconds,
                },
              })
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_progress', tool: message.tool_name, elapsed: message.elapsed_time_seconds })}\n\n`
              ))
            }

            // Signal completion
            if (message.type === 'result' && message.subtype === 'success') {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'done' })}\n\n`
              ))
            }

            // Handle errors
            if (message.type === 'result' && message.subtype !== 'success') {
              Sentry.addBreadcrumb({
                category: 'chat.stream',
                message: 'Stream result error',
                level: 'error',
                data: {
                  request_id: requestId,
                  subtype: message.subtype,
                },
              })
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Query did not complete successfully' })}\n\n`
              ))
            }
          }

          // Log [DONE] marker
          Sentry.addBreadcrumb({
            category: 'chat.stream',
            message: 'Stream [DONE] marker sent',
            level: 'info',
            data: { request_id: requestId },
          })

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()

          // Log stream completion
          const streamDuration = (Date.now() - streamStartTime) / 1000
          Sentry.addBreadcrumb({
            category: 'chat.stream',
            message: 'Chat stream completed',
            level: 'info',
            data: {
              request_id: requestId,
              chunk_count: chunkCount,
              text_delta_count: textDeltaCount,
              tools_used_count: toolsUsedCount,
              parse_error_count: parseErrorCount,
              duration_seconds: streamDuration,
            },
          })
        } catch (error) {
          Sentry.addBreadcrumb({
            category: 'chat.stream',
            message: 'Stream error',
            level: 'error',
            data: {
              request_id: requestId,
              error_name: error instanceof Error ? error.name : 'Unknown',
              error_message: error instanceof Error ? error.message : 'Unknown error',
            },
          })
          Sentry.captureException(error, {
            tags: {
              request_id: requestId,
              error_location: 'stream_processing',
            },
            contexts: {
              stream: {
                chunk_count: chunkCount,
                text_delta_count: textDeltaCount,
                tools_used_count: toolsUsedCount,
              },
            },
          })
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Stream error occurred' })}\n\n`
          ))
          controller.close()
        }
      }
    })

    // Track total request duration
    const totalDuration = (Date.now() - requestStartTime) / 1000
    Sentry.addBreadcrumb({
      category: 'chat',
      message: 'Request completed',
      level: 'info',
      data: {
        request_id: requestId,
        total_duration_seconds: totalDuration,
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    Sentry.addBreadcrumb({
      category: 'chat.api',
      message: 'API error',
      level: 'error',
      data: {
        request_id: requestId,
        error_name: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    })
    Sentry.captureException(error, {
      tags: {
        request_id: requestId,
        error_location: 'api_handler',
      },
    })

    return new Response(
      JSON.stringify({ error: 'Failed to process chat request. Check server logs for details.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
