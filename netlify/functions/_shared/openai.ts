import OpenAI from 'openai'
import { getEnv, requireEnv } from './env'
import type { ChatPackage, UploadImage } from './types'

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
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answers', 'correctAnswerIndex'],
        properties: {
          question: { type: 'string' },
          answers: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'string' },
          },
          correctAnswerIndex: { type: 'integer', minimum: 0, maximum: 2 },
        },
      },
    },
  },
} as const

const answerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: {
    answer: { type: 'string' },
  },
} as const

function client() {
  return new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
}

export async function createInitialPackage(images: UploadImage[]): Promise<ChatPackage> {
  const response = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: 'developer',
        content:
          'Du bist Vair+. Du hilfst Menschen mit kognitiven Einschränkungen. Lies den Text auf den Bildern. Antworte auf Deutsch. Schreibe sehr einfache Sprache. Schreibe kurze Sätze. Vermeide Nebensätze. Bewahre wichtige Fakten. Erfinde nichts.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              'Erkenne den Text auf diesen Bildern. Fasse ihn danach sehr einfach zusammen. Erzeuge schwere Wörter, Folgefragen und ein Quiz. Jede Quizfrage hat 3 Antworten. Genau eine Antwort ist richtig. Zwei Antworten sind lustig und offensichtlich falsch.',
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
}) {
  const response = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: 'developer',
        content:
          'Du bist Vair+. Antworte auf Deutsch. Nutze sehr einfache Sprache. Schreibe kurze Sätze. Vermeide Nebensätze. Erkläre freundlich und erwachsen. Bleibe beim Ausgangstext.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Ausgangstext:\n${input.sourceText}`,
              `Erste Zusammenfassung:\n${input.initialPackage.summary.join(' ')}`,
              `Bisheriger Chat:\n${input.history.map((message) => `${message.role}: ${message.content}`).join('\n')}`,
              `Neue Anfrage:\n${input.prompt}`,
            ].join('\n\n'),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'vair_follow_up_answer',
        strict: true,
        schema: answerSchema,
      },
    },
  })

  return JSON.parse(response.output_text) as { answer: string }
}
