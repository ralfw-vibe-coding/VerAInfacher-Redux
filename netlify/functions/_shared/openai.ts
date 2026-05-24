import OpenAI from 'openai'
import { getEnv, requireEnv } from './env'
import { getStateProvider } from './state'
import type { AssistantResponsePackage, ChatPackage, UploadImage } from './types'

const MODEL = getEnv('OPENAI_MODEL') ?? 'gpt-4.1-mini'

const chatPackageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceText', 'summary', 'difficultWords', 'followUpQuestions', 'quiz'],
  properties: {
    sourceText: { type: 'string' },
    summary: {
      type: 'array',
      minItems: 4,
      maxItems: 8,
      items: { type: 'string' },
    },
    difficultWords: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'shortExplanation'],
        properties: {
          word: { type: 'string' },
          shortExplanation: { type: 'string' },
        },
      },
    },
    followUpQuestions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string' },
    },
    quiz: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answers', 'correctAnswerIndex'],
        properties: {
          question: { type: 'string' },
          answers: {
            type: 'array',
            minItems: 2,
            items: { type: 'string' },
          },
          correctAnswerIndex: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
} as const

const responsePackageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'difficultWords', 'followUpQuestions', 'quiz'],
  properties: {
    answer: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: { type: 'string' },
    },
    difficultWords: chatPackageSchema.properties.difficultWords,
    followUpQuestions: chatPackageSchema.properties.followUpQuestions,
    quiz: chatPackageSchema.properties.quiz,
  },
} as const

function client() {
  return new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
}

export async function createInitialPackage(images: UploadImage[]): Promise<ChatPackage> {
  const prompts = await getStateProvider().getPromptConfigs()
  const response = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: 'developer',
        content: prompts.startDeveloperPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompts.startUserPrompt,
          },
          ...images.map((image) => ({
            type: 'input_image' as const,
            image_url: image.dataUrl,
            detail: 'high' as const,
          })),
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'vair_chat_package',
        strict: true,
        schema: chatPackageSchema,
      },
    },
  })

  return JSON.parse(response.output_text) as ChatPackage
}

export async function createFollowUpAnswer(input: {
  sourceText: string
  initialPackage: ChatPackage
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  prompt: string
}): Promise<AssistantResponsePackage> {
  const prompts = await getStateProvider().getPromptConfigs()
  const response = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: 'developer',
        content: prompts.continueDeveloperPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: interpolatePrompt(prompts.continueUserPrompt, {
              sourceText: input.sourceText,
              initialSummary: input.initialPackage.summary.join(' '),
              history: input.history.map((message) => `${message.role}: ${message.content}`).join('\n'),
              prompt: input.prompt,
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'vair_follow_up_package',
        strict: true,
        schema: responsePackageSchema,
      },
    },
  })

  return JSON.parse(response.output_text) as AssistantResponsePackage
}

function interpolatePrompt(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '')
}
