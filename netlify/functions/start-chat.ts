import type { Config } from '@netlify/functions'
import { json, textError } from './_shared/http'
import { createInitialPackage } from './_shared/openai'
import { getStateProvider } from './_shared/state'
import type { UploadImage } from './_shared/types'

type StartChatRequest = {
  images?: UploadImage[]
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return textError('Diese Route erlaubt nur POST.', 405)
  }

  try {
    const body = (await req.json()) as StartChatRequest
    const images = body.images ?? []

    if (!images.length) {
      return textError('Bitte lade mindestens ein Foto hoch.', 400)
    }

    const chatPackage = await createInitialPackage(images)
    const sessionId = await getStateProvider().createSession(chatPackage)

    return json({ sessionId, package: chatPackage })
  } catch (error) {
    return textError(error)
  }
}

export const config: Config = {
  path: '/api/start-chat',
  method: ['POST'],
}
