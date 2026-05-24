import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronRight,
  FileImage,
  HelpCircle,
  Loader2,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from './components/ui/button'
import './App.css'

type DifficultWord = {
  word: string
  shortExplanation: string
}

type QuizQuestion = {
  question: string
  answers: string[]
  correctAnswerIndex: number
}

type ChatPackage = {
  sourceText: string
  summary: string[]
  difficultWords: DifficultWord[]
  followUpQuestions: string[]
  quiz: QuizQuestion[]
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type StartResponse = {
  sessionId: string
  package: ChatPackage
}

type ContinueResponse = {
  answer: string
}

type UploadImage = {
  name: string
  type: string
  dataUrl: string
}

type ChoiceKind = 'sentence' | 'word' | 'question'

const MAX_IMAGE_EDGE = 1400
const JPEG_QUALITY = 0.78

function makeId() {
  return crypto.randomUUID()
}

async function fileToImagePayload(file: File): Promise<UploadImage> {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height))
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Das Bild konnte nicht vorbereitet werden.')
  }

  context.drawImage(img, 0, 0, width, height)
  return {
    name: file.name,
    type: 'image/jpeg',
    dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Das Bild konnte nicht geladen werden.'))
    img.src = src
  })
}

function promptForChoice(kind: ChoiceKind, value: string) {
  if (kind === 'sentence') return `Erkläre mir diesen Satz näher: ${value}`
  if (kind === 'word') return `Erkläre mir dieses Wort näher: ${value}`
  return `Beantworte mir diese Frage: ${value}`
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<UploadImage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [chatPackage, setChatPackage] = useState<ChatPackage | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])

  const canStart = images.length > 0 && !busyLabel
  const score = useMemo(
    () =>
      chatPackage?.quiz.reduce(
        (total, question, index) =>
          quizAnswers[index] === question.correctAnswerIndex ? total + 1 : total,
        0,
      ) ?? 0,
    [chatPackage, quizAnswers],
  )

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return

    setError('')
    setBusyLabel('Bilder werden vorbereitet')
    try {
      const selectedImages = await Promise.all(
        Array.from(files)
          .filter((file) => file.type.startsWith('image/'))
          .map(fileToImagePayload),
      )
      setImages((current) => [...current, ...selectedImages].slice(0, 6))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Die Bilder konnten nicht gelesen werden.')
    } finally {
      setBusyLabel('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function startChat() {
    if (!images.length) return

    setError('')
    setBusyLabel('Text wird gelesen und vereinfacht')
    try {
      const response = await fetch('/api/start-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ images }),
      })

      if (!response.ok) throw new Error(await response.text())

      const data = (await response.json()) as StartResponse
      setSessionId(data.sessionId)
      setChatPackage(data.package)
      setMessages([
        {
          id: makeId(),
          role: 'assistant',
          text: data.package.summary.join(' '),
        },
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Chat konnte nicht gestartet werden.')
    } finally {
      setBusyLabel('')
    }
  }

  async function askChoice(kind: ChoiceKind, value: string) {
    if (!sessionId || !chatPackage || busyLabel) return

    const prompt = promptForChoice(kind, value)
    const userMessage: ChatMessage = { id: makeId(), role: 'user', text: prompt }
    setMessages((current) => [...current, userMessage])
    setBusyLabel('Antwort wird vorbereitet')
    setError('')

    try {
      const response = await fetch('/api/continue-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, kind, value, prompt }),
      })

      if (!response.ok) throw new Error(await response.text())

      const data = (await response.json()) as ContinueResponse
      setMessages((current) => [
        ...current,
        { id: makeId(), role: 'assistant', text: data.answer },
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Die Antwort konnte nicht erzeugt werden.')
    } finally {
      setBusyLabel('')
    }
  }

  function resetChat() {
    setImages([])
    setSessionId(null)
    setChatPackage(null)
    setMessages([])
    setError('')
    setQuizOpen(false)
    setQuizIndex(0)
    setQuizAnswers([])
  }

  function answerQuiz(answerIndex: number) {
    const nextAnswers = [...quizAnswers]
    nextAnswers[quizIndex] = answerIndex
    setQuizAnswers(nextAnswers)
  }

  const currentQuiz = chatPackage?.quiz[quizIndex]
  const quizDone = Boolean(chatPackage && quizAnswers.length === chatPackage.quiz.length)

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={26} />
        </div>
        <div>
          <p className="eyebrow">Vair+</p>
          <h1>VerAInfacher Redux</h1>
        </div>
        {chatPackage ? (
          <Button className="icon-button" onClick={resetChat} aria-label="Neu starten">
            <RotateCcw size={24} />
          </Button>
        ) : null}
      </header>

      <section className="workspace">
        {!chatPackage ? (
          <div className="upload-panel">
            <div className="upload-copy">
              <BookOpenText size={42} aria-hidden="true" />
              <h2>Text fotografieren. Bild hochladen. Einfach verstehen.</h2>
              <p>Du kannst ein oder mehrere Fotos auswählen. Vair+ liest den Text und erklärt ihn in sehr einfacher Sprache.</p>
            </div>

            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void handleFiles(event.target.files)}
            />

            <div className="upload-actions">
              <Button className="primary-button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={24} />
                Fotos auswählen
              </Button>
              <Button className="secondary-button" onClick={startChat} disabled={!canStart}>
                <MessageCircle size={24} />
                Text verstehen
              </Button>
            </div>

            {images.length ? (
              <ul className="image-list" aria-label="Ausgewählte Fotos">
                {images.map((image, index) => (
                  <li key={`${image.name}-${index}`}>
                    <FileImage size={22} />
                    <span>{image.name || `Foto ${index + 1}`}</span>
                    <Button
                      className="small-icon-button"
                      onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label="Foto entfernen"
                    >
                      <X size={20} />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="chat-layout">
            <section className="messages" aria-label="Chat">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <p>{message.text}</p>
                </article>
              ))}
              {busyLabel ? (
                <article className="message assistant loading-message">
                  <Loader2 className="spin" size={22} />
                  <p>{busyLabel}</p>
                </article>
              ) : null}
            </section>

            <aside className="choice-panel" aria-label="Auswahl">
              <section>
                <h2>Sätze</h2>
                <div className="choice-stack">
                  {chatPackage.summary.map((sentence) => (
                    <Button
                      className="choice-button"
                      key={sentence}
                      onClick={() => void askChoice('sentence', sentence)}
                    >
                      <span>{sentence}</span>
                      <ChevronRight size={22} />
                    </Button>
                  ))}
                </div>
              </section>

              <section>
                <h2>Schwere Wörter</h2>
                <div className="word-grid">
                  {chatPackage.difficultWords.map((item) => (
                    <Button
                      className="word-button"
                      key={item.word}
                      onClick={() => void askChoice('word', item.word)}
                    >
                      <strong>{item.word}</strong>
                      <span>{item.shortExplanation}</span>
                    </Button>
                  ))}
                </div>
              </section>

              <section>
                <h2>Fragen</h2>
                <div className="choice-stack">
                  {chatPackage.followUpQuestions.map((question) => (
                    <Button
                      className="choice-button"
                      key={question}
                      onClick={() => void askChoice('question', question)}
                    >
                      <HelpCircle size={24} />
                      <span>{question}</span>
                    </Button>
                  ))}
                </div>
              </section>

              <Button className="quiz-button" onClick={() => setQuizOpen(true)}>
                <Trophy size={24} />
                Quiz starten
              </Button>
            </aside>
          </div>
        )}
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {busyLabel && !chatPackage ? (
        <div className="busy-overlay" role="status" aria-live="polite">
          <Loader2 className="spin" size={42} />
          <p>{busyLabel}</p>
        </div>
      ) : null}

      {quizOpen && chatPackage && currentQuiz ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Quiz">
          <div className="quiz-modal">
            <div className="quiz-header">
              <Button
                className="icon-button"
                onClick={() => {
                  if (quizIndex === 0) setQuizOpen(false)
                  else setQuizIndex((current) => current - 1)
                }}
                aria-label={quizIndex === 0 ? 'Quiz schließen' : 'Zurück'}
              >
                <ArrowLeft size={24} />
              </Button>
              <p>Frage {quizIndex + 1} von {chatPackage.quiz.length}</p>
              <Button className="icon-button" onClick={() => setQuizOpen(false)} aria-label="Schließen">
                <X size={24} />
              </Button>
            </div>

            {!quizDone ? (
              <>
                <h2>{currentQuiz.question}</h2>
                <div className="answer-stack">
                  {currentQuiz.answers.map((answer, index) => (
                    <Button
                      className={`answer-button ${quizAnswers[quizIndex] === index ? 'selected' : ''}`}
                      key={answer}
                      onClick={() => answerQuiz(index)}
                    >
                      {quizAnswers[quizIndex] === index ? <Check size={24} /> : <span className="answer-dot" />}
                      <span>{answer}</span>
                    </Button>
                  ))}
                </div>
                <Button
                  className="primary-button full-width"
                  disabled={quizAnswers[quizIndex] === undefined}
                  onClick={() => {
                    if (quizIndex < chatPackage.quiz.length - 1) setQuizIndex((current) => current + 1)
                    else setQuizAnswers((current) => [...current])
                  }}
                >
                  {quizIndex < chatPackage.quiz.length - 1 ? 'Weiter' : 'Auswerten'}
                </Button>
              </>
            ) : (
              <div className="quiz-result">
                <Trophy size={54} />
                <h2>{score} von {chatPackage.quiz.length} richtig</h2>
                <p>Gut gemacht. Du hast dich mit dem Text beschäftigt.</p>
                <Button
                  className="primary-button full-width"
                  onClick={() => {
                    setQuizAnswers([])
                    setQuizIndex(0)
                  }}
                >
                  Noch einmal spielen
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
