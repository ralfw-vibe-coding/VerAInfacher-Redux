# VerAInfacher Redux

Vair+ ist ein klickbarer KI-Chatbot für Menschen mit kognitiven Einschränkungen.
User laden Fotos von Texten hoch. Das Backend erkennt den Text, vereinfacht ihn
und erzeugt Verständnishilfen.

## Stack

- React, TypeScript, Vite
- Lucide Icons
- Netlify Functions
- OpenAI Responses API
- Persistenz über `STATE_PROVIDER`

## Umgebung

Lege lokal eine `.env` an:

```bash
OPENAI_API_KEY="..."
STATE_PROVIDER="postgres"
DATABASE_URL="postgres://..."
```

Oder für lokale JSON-Dateien:

```bash
OPENAI_API_KEY="..."
STATE_PROVIDER="filesystem"
DATABASE_PATH="./data"
```

Optional kann das Modell überschrieben werden:

```bash
OPENAI_MODEL="gpt-4.1-mini"
```

## Entwicklung

```bash
npm install
./run.sh
```

Die App läuft dann über Netlify Dev, damit `/api/start-chat` und
`/api/continue-chat` verfügbar sind.

Prompt-Verwaltung:

```text
http://localhost:8888/prompts
```

Dort können diese vier Prompts bearbeitet und gespeichert werden:

- Start: Developer Prompt
- Start: User Prompt
- Chat: Developer Prompt
- Chat: User Prompt

Teilstarts:

```bash
./run.sh --client
./run.sh --server
./run.sh --client --server
```

## Persistenz

Beide Provider implementieren dieselbe State-Schnittstelle:

- `postgres`: speichert Sessions, Chat-Nachrichten und Prompt-Config-Seeds in Postgres.
- `filesystem`: speichert Sessions als JSON-Dateien unter `DATABASE_PATH`.

Die Prompt-Texte sind im ersten Inkrement noch im Code verdrahtet. Die
Postgres-Struktur enthält bereits eine `prompt_configs`-Tabelle für spätere
Bearbeitung.
