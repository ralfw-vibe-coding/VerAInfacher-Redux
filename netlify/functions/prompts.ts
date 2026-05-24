import type { Config } from '@netlify/functions'
import { json, textError } from './_shared/http'
import { promptConfigKeys, type PromptConfigs } from './_shared/prompt-configs'
import { getStateProvider } from './_shared/state'

type SavePromptsRequest = {
  prompts?: Partial<PromptConfigs>
}

export default async (req: Request) => {
  try {
    const state = getStateProvider()

    if (req.method === 'GET') {
      return json({
        prompts: await state.getPromptConfigs(),
      })
    }

    if (req.method === 'PUT') {
      const body = (await req.json()) as SavePromptsRequest
      const currentPrompts = await state.getPromptConfigs()
      const prompts = { ...currentPrompts }

      for (const key of promptConfigKeys) {
        const value = body.prompts?.[key]
        if (typeof value === 'string') {
          prompts[key] = value
        }
      }

      await state.savePromptConfigs(prompts)
      return json({ prompts })
    }

    return textError('Diese Route erlaubt nur GET und PUT.', 405)
  } catch (error) {
    return textError(error)
  }
}

export const config: Config = {
  path: '/api/prompts',
  method: ['GET', 'PUT'],
}
