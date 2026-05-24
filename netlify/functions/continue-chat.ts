import type { Config } from '@netlify/functions'
import { json, textError } from './_shared/http'
import { createFollowUpAnswer } from './_shared/openai'
import { getStateProvider } from './_shared/state'
import type { ChoiceKind } from './_shared/types'

type ContinueChatRequest = {
  sessionId?: string
  kind?: ChoiceKind
  value?: string
  prompt?: string
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return textError('Diese Route erlaubt nur POST.', 405)
  }

  try {
    const body = (await req.json()) as ContinueChatRequest

    if (!body.sessionId || !body.prompt || !body.value || !body.kind) {
      return textError('Die Anfrage ist unvollständig.', 400)
    }

    const state = getStateProvider()
    const session = await state.getSession(body.sessionId)

    if (!session) {
      return textError('Diese Unterhaltung wurde nicht gefunden.', 404)
    }

    await state.addMessage(body.sessionId, 'user', body.prompt)

    const result = await createFollowUpAnswer({
      sourceText: session.sourceText,
      initialPackage: session.initialPackage,
      history: await state.getMessages(body.sessionId),
      prompt: body.prompt,
    })

    await state.addMessage(body.sessionId, 'assistant', result.answer.join(' '))

    return json({ package: result })
  } catch (error) {
    return textError(error)
  }
}

export const config: Config = {
  path: '/api/continue-chat',
  method: ['POST'],
}
