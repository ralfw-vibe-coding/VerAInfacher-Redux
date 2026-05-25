# VerAInfacher Redux

VerAInfacher Redux, kurz **Vair+**, ist ein klickbarer KI-Chatbot für Menschen
mit kognitiven Einschränkungen.

User fotografieren oder laden Bilder von Texten hoch, zum Beispiel ein Plakat,
einen Brief oder einen Aushang. Das Backend erkennt den Text, vereinfacht ihn
und erzeugt Verständnishilfen:

- Antwort in sehr einfacher Sprache
- schwere Wörter zum Anklicken
- Folgefragen zum Anklicken
- Quizfragen mit Auswertung

Die User tippen keine eigenen Prompts. Sie klicken auf Sätze, Wörter,
Folgefragen oder Quiz-Antworten. Dadurch bleibt die Bedienung einfach.

## Stack

- React, TypeScript, Vite
- Lucide Icons
- Netlify Functions
- OpenAI Responses API
- Neon Postgres oder lokales JSON-Dateisystem als State Provider

## Architektur

Das Frontend läuft als Vite/React-App.

Das Backend liegt in `netlify/functions/`:

- `/api/start-chat`
  - nimmt Bilder entgegen
  - ruft OpenAI mit Bildinput auf
  - extrahiert den Text
  - erzeugt das erste Antwortpaket

- `/api/continue-chat`
  - nimmt einen angeklickten Satz, ein Wort oder eine Folgefrage entgegen
  - nutzt den gespeicherten Chat-Kontext
  - erzeugt wieder ein vollständiges Antwortpaket

- `/api/prompts`
  - lädt und speichert die Prompt-Konfiguration

Die Persistenz läuft über `STATE_PROVIDER`:

- `postgres`: Sessions, Chat-Nachrichten und Prompts in Postgres
- `filesystem`: Sessions und Prompts als JSON-Dateien unter `DATABASE_PATH`

Für Produktion auf Netlify sollte `postgres` genutzt werden. Das Dateisystem in
Serverless-Umgebungen ist nicht als dauerhafte Persistenz gedacht.

## Lokale Entwicklung

Abhängigkeiten installieren:

```bash
npm install
```

Lokale `.env` anlegen:

```bash
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5.4-mini"

STATE_PROVIDER="postgres"
DATABASE_URL="postgresql://..."
```

Alternative ohne Datenbank, nur lokal:

```bash
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5.4-mini"

STATE_PROVIDER="filesystem"
DATABASE_PATH="./data"
```

App komplett starten:

```bash
./run.sh
```

Danach:

- App: `http://localhost:8888`
- Prompt-Verwaltung: `http://localhost:8888/prompts`

Teilstarts:

```bash
./run.sh --client
./run.sh --server
./run.sh --client --server
```

Ports können überschrieben werden:

```bash
CLIENT_PORT=5179 SERVER_PORT=8888 ./run.sh
```

## Prompt-Verwaltung

Die Prompt-Seite liegt hier:

```text
http://localhost:8888/prompts
```

Dort können vier Prompts bearbeitet und gespeichert werden:

- Start: Developer Prompt
- Start: User Prompt
- Chat: Developer Prompt
- Chat: User Prompt

Der Chat-User-Prompt unterstützt diese Platzhalter:

```text
{{sourceText}}
{{initialSummary}}
{{history}}
{{prompt}}
```

Die Prompts werden in der gewählten Persistenz gespeichert:

- Postgres: Tabelle `prompt_configs`
- Filesystem: `DATABASE_PATH/prompt-configs.json`

Die dokumentierten Ausgangsprompts liegen zusätzlich unter `prompts/`.

## Tests und Build

Lint:

```bash
npm run lint
```

Produktionsbuild:

```bash
npm run build
```

Der Build erzeugt `dist/`.

## Neon Postgres einrichten

1. In Neon ein neues Projekt anlegen.
2. Eine Datenbank und Rolle verwenden oder anlegen.
3. Im Neon Dashboard den Connection String kopieren.
4. Für Netlify Functions am besten den **pooled connection string** verwenden.
   Der Host enthält dann typischerweise `-pooler`.
5. Connection String als `DATABASE_URL` setzen.

Die App legt die benötigten Tabellen beim ersten Zugriff selbst an:

- `prompt_configs`
- `chat_sessions`
- `chat_messages`

Lokal:

```bash
STATE_PROVIDER="postgres"
DATABASE_URL="postgresql://..."
```

Auf Netlify dieselben Variablen als Environment Variables setzen.

Neon-Doku:

- [Connect Neon](https://neon.com/docs/get-started-with-neon/connect-neon)
- [Neon mit Netlify Functions](https://neon.com/docs/guides/netlify-functions)
- [Connection Pooling](https://neon.com/docs/connect/connection-pooling)

## Netlify Deployment

Die Netlify-Konfiguration liegt in `netlify.toml`:

```toml
[build]
command = "npm run build"
publish = "dist"
```

Die Functions liegen unter:

```text
netlify/functions/
```

### Environment Variables auf Netlify

In Netlify müssen mindestens diese Variablen gesetzt werden:

```bash
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5.4-mini"
STATE_PROVIDER="postgres"
DATABASE_URL="postgresql://..."
```

Wichtig:

- `OPENAI_API_KEY` und `DATABASE_URL` sind Secrets.
- Diese Werte dürfen nicht mit `VITE_` beginnen.
- Sie werden nur in Netlify Functions verwendet.
- Environment Variables müssen für Functions verfügbar sein.
- Nach Änderungen an Environment Variables muss neu deployed werden.

Netlify-Doku:

- [Environment Variables and Functions](https://docs.netlify.com/build/functions/environment-variables/)
- [Vite on Netlify](https://docs.netlify.com/frameworks/vite/)

### Deployment per Git

1. Repository zu GitHub, GitLab oder Bitbucket pushen.
2. In Netlify ein neues Site-Projekt aus dem Git-Repository anlegen.
3. Build-Einstellungen prüfen:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Environment Variables setzen.
5. Deploy starten.

Bei Git-basiertem Deployment baut Netlify automatisch bei Pushes auf den
konfigurierten Production Branch.

### Deployment per Netlify CLI

Einmal anmelden:

```bash
npx netlify login
```

Site verknüpfen oder erstellen:

```bash
npx netlify link
```

Preview Deploy:

```bash
npx netlify deploy
```

Production Deploy:

```bash
npx netlify deploy --prod
```

Netlify CLI-Doku:

- [Netlify CLI deploy](https://cli.netlify.com/commands/deploy/)

## Wichtige Dateien

- `src/App.tsx`: Chat-UI, Upload, Quiz, Prompt-Seite
- `src/App.css`: UI-Styling
- `netlify/functions/start-chat.ts`: Start mit Bildern
- `netlify/functions/continue-chat.ts`: weitere Chat-Antworten
- `netlify/functions/prompts.ts`: Prompt-Verwaltung
- `netlify/functions/_shared/openai.ts`: OpenAI-Aufrufe
- `netlify/functions/_shared/state.ts`: Persistenz-Provider
- `netlify/functions/_shared/prompt-configs.ts`: Prompt-Defaults
- `prompts/`: dokumentierte Ausgangsprompts
- `run.sh`: lokaler Start
