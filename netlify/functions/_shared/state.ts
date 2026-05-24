import { neon } from '@neondatabase/serverless'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getEnv, requireEnv } from './env'
import { defaultPromptConfigs, promptConfigKeys, type PromptConfigs } from './prompt-configs'
import type { ChatPackage } from './types'

type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

type StoredSession = {
  id: string
  sourceText: string
  initialPackage: ChatPackage
  messages: StoredMessage[]
  createdAt: string
}

type StateProvider = {
  createSession(chatPackage: ChatPackage): Promise<string>
  getSession(sessionId: string): Promise<StoredSession | undefined>
  getMessages(sessionId: string): Promise<StoredMessage[]>
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void>
  getPromptConfigs(): Promise<PromptConfigs>
  savePromptConfigs(prompts: PromptConfigs): Promise<void>
}

let provider: StateProvider | undefined

export function getStateProvider() {
  provider ??= createStateProvider()
  return provider
}

function createStateProvider(): StateProvider {
  const selectedProvider = (getEnv('STATE_PROVIDER') ?? 'postgres').toLowerCase()

  if (selectedProvider === 'filesystem') {
    return new FileSystemStateProvider(getEnv('DATABASE_PATH') ?? './data')
  }

  if (selectedProvider === 'postgres') {
    return new PostgresStateProvider()
  }

  throw new Error(`STATE_PROVIDER muss "postgres" oder "filesystem" sein. Aktuell: ${selectedProvider}`)
}

class PostgresStateProvider implements StateProvider {
  private didInit = false

  private sql() {
    return neon(requireEnv('DATABASE_URL'))
  }

  private async ensureSchema() {
    if (this.didInit) return

    const query = this.sql()

    await query`
      create table if not exists prompt_configs (
        key text primary key,
        value text not null,
        updated_at timestamptz not null default now()
      )
    `

    await query`
      create table if not exists chat_sessions (
        id uuid primary key,
        source_text text not null,
        initial_package jsonb not null,
        created_at timestamptz not null default now()
      )
    `

    await query`
      create table if not exists chat_messages (
        id bigserial primary key,
        session_id uuid not null references chat_sessions(id) on delete cascade,
        role text not null check (role in ('user', 'assistant')),
        content text not null,
        created_at timestamptz not null default now()
      )
    `

    for (const key of promptConfigKeys) {
      await query`
        insert into prompt_configs (key, value)
        values (${key}, ${defaultPromptConfigs[key]})
        on conflict (key) do nothing
      `
    }

    this.didInit = true
  }

  async createSession(chatPackage: ChatPackage) {
    await this.ensureSchema()
    const id = crypto.randomUUID()
    const query = this.sql()

    await query`
      insert into chat_sessions (id, source_text, initial_package)
      values (${id}, ${chatPackage.sourceText}, ${JSON.stringify(chatPackage)}::jsonb)
    `

    await this.addMessage(id, 'assistant', chatPackage.summary.join(' '))
    return id
  }

  async getSession(sessionId: string) {
    await this.ensureSchema()
    const query = this.sql()
    const rows = await query`
      select source_text, initial_package, created_at
      from chat_sessions
      where id = ${sessionId}
      limit 1
    `
    const row = rows[0] as
      | { source_text: string; initial_package: ChatPackage; created_at: string }
      | undefined

    if (!row) return undefined

    return {
      id: sessionId,
      sourceText: row.source_text,
      initialPackage: row.initial_package,
      messages: await this.getMessages(sessionId),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }
  }

  async getMessages(sessionId: string) {
    await this.ensureSchema()
    const query = this.sql()
    const rows = await query`
      select role, content, created_at
      from chat_messages
      where session_id = ${sessionId}
      order by id asc
      limit 20
    `

    return rows.map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: String(row.content),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }))
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
    await this.ensureSchema()
    const query = this.sql()

    await query`
      insert into chat_messages (session_id, role, content)
      values (${sessionId}, ${role}, ${content})
    `
  }

  async getPromptConfigs() {
    await this.ensureSchema()
    const query = this.sql()
    const rows = await query`
      select key, value
      from prompt_configs
      where key = any(${promptConfigKeys})
    `
    const prompts = { ...defaultPromptConfigs }

    for (const row of rows) {
      const key = String(row.key)
      if (isPromptConfigKey(key)) {
        prompts[key] = String(row.value)
      }
    }

    return prompts
  }

  async savePromptConfigs(prompts: PromptConfigs) {
    await this.ensureSchema()
    const query = this.sql()

    for (const key of promptConfigKeys) {
      await query`
        insert into prompt_configs (key, value, updated_at)
        values (${key}, ${prompts[key]}, now())
        on conflict (key) do update set
          value = excluded.value,
          updated_at = now()
      `
    }
  }
}

class FileSystemStateProvider implements StateProvider {
  private readonly rootPath: string

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  async createSession(chatPackage: ChatPackage) {
    await this.ensureRoot()
    const id = crypto.randomUUID()
    const session: StoredSession = {
      id,
      sourceText: chatPackage.sourceText,
      initialPackage: chatPackage,
      messages: [
        {
          role: 'assistant',
          content: chatPackage.summary.join(' '),
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    }

    await this.writeSession(session)
    return id
  }

  async getSession(sessionId: string) {
    await this.ensureRoot()

    try {
      const raw = await readFile(this.sessionPath(sessionId), 'utf8')
      return JSON.parse(raw) as StoredSession
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined
      }
      throw error
    }
  }

  async getMessages(sessionId: string) {
    const session = await this.getSession(sessionId)
    return session?.messages.slice(-20) ?? []
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
    const session = await this.getSession(sessionId)

    if (!session) {
      throw new Error('Diese Unterhaltung wurde nicht gefunden.')
    }

    session.messages.push({ role, content, createdAt: new Date().toISOString() })
    await this.writeSession(session)
  }

  async getPromptConfigs() {
    await this.ensureRoot()
    const raw = await readFile(this.promptConfigPath(), 'utf8')
    const savedPrompts = JSON.parse(raw) as Partial<PromptConfigs>

    return {
      ...defaultPromptConfigs,
      ...Object.fromEntries(
        promptConfigKeys.map((key) => [key, savedPrompts[key] ?? defaultPromptConfigs[key]]),
      ),
    } as PromptConfigs
  }

  async savePromptConfigs(prompts: PromptConfigs) {
    await this.ensureRoot()
    await writeFile(this.promptConfigPath(), `${JSON.stringify(prompts, null, 2)}\n`, 'utf8')
  }

  private async ensureRoot() {
    await mkdir(this.rootPath, { recursive: true })
    await this.ensurePromptConfig()
  }

  private sessionPath(sessionId: string) {
    return join(this.rootPath, `${sessionId}.json`)
  }

  private async writeSession(session: StoredSession) {
    await writeFile(this.sessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`, 'utf8')
  }

  private async ensurePromptConfig() {
    try {
      await readFile(this.promptConfigPath(), 'utf8')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }

      await writeFile(
        this.promptConfigPath(),
        `${JSON.stringify(defaultPromptConfigs, null, 2)}\n`,
        'utf8',
      )
    }
  }

  private promptConfigPath() {
    return join(this.rootPath, 'prompt-configs.json')
  }
}

function isPromptConfigKey(key: string): key is keyof PromptConfigs {
  return promptConfigKeys.includes(key as keyof PromptConfigs)
}
