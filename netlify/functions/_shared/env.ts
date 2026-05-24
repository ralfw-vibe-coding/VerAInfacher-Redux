export function getEnv(name: string) {
  const netlify = globalThis.Netlify as
    | { env: { get(name: string): string | undefined } }
    | undefined

  return netlify?.env.get(name) ?? process.env[name]
}

export function requireEnv(name: string) {
  const value = getEnv(name)

  if (!value) {
    throw new Error(`Die Umgebungsvariable ${name} fehlt.`)
  }

  return value
}
