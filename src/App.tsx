import {
  ArrowLeft,
  Camera,
  Check,
  FileImage,
  Loader2,
  MessageCircle,
  Save,
  Sparkles,
  Trophy,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

type ActiveQuiz = {
  originalQuestions: QuizQuestion[]
  questions: QuizQuestion[]
}

type ChatPackage = {
  sourceText: string
  summary: string[]
  difficultWords: DifficultWord[]
  followUpQuestions: string[]
  quiz: QuizQuestion[]
}

type AssistantResponsePackage = {
  answer: string[]
  difficultWords: DifficultWord[]
  followUpQuestions: string[]
  quiz: QuizQuestion[]
}

type UserChatMessage = {
  id: string
  role: 'user'
  text: string
}

type AssistantChatMessage = {
  id: string
  role: 'assistant'
  package: AssistantResponsePackage
}

type ChatMessage = UserChatMessage | AssistantChatMessage

type StartResponse = {
  sessionId: string
  package: ChatPackage
}

type ContinueResponse = {
  package: AssistantResponsePackage
}

type UploadImage = {
  name: string
  type: string
  dataUrl: string
}

type ChoiceKind = 'sentence' | 'word' | 'question'
type PromptConfigKey =
  | 'startDeveloperPrompt'
  | 'startUserPrompt'
  | 'continueDeveloperPrompt'
  | 'continueUserPrompt'

type PromptConfigs = Record<PromptConfigKey, string>

const promptConfigFields: Array<{ key: PromptConfigKey; title: string; help: string }> = [
  {
    key: 'startDeveloperPrompt',
    title: 'Start: Developer Prompt',
    help: 'Grundregeln fuer Texterkennung, Zusammenfassung und Hilfen nach dem Foto-Upload.',
  },
  {
    key: 'startUserPrompt',
    title: 'Start: User Prompt',
    help: 'Auftrag fuer den ersten KI-Schritt mit den Bildern.',
  },
  {
    key: 'continueDeveloperPrompt',
    title: 'Chat: Developer Prompt',
    help: 'Grundregeln fuer jede weitere Antwort im Chat.',
  },
  {
    key: 'continueUserPrompt',
    title: 'Chat: User Prompt',
    help: 'Template fuer Folgefragen. Platzhalter: {{sourceText}}, {{initialSummary}}, {{history}}, {{prompt}}.',
  },
]

const MAX_IMAGE_EDGE = 1400
const JPEG_QUALITY = 0.78
const confettiPieces = Array.from({ length: 42 }, (_, index) => index)

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

function packageFromInitial(chatPackage: ChatPackage): AssistantResponsePackage {
  return {
    answer: chatPackage.summary,
    difficultWords: chatPackage.difficultWords,
    followUpQuestions: chatPackage.followUpQuestions,
    quiz: chatPackage.quiz,
  }
}

function shuffleQuizAnswers(quiz: QuizQuestion[]) {
  return quiz.map((question) => {
    const answers = question.answers.map((answer, index) => ({
      answer,
      wasCorrect: index === question.correctAnswerIndex,
    }))

    for (let index = answers.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      const current = answers[index]
      answers[index] = answers[swapIndex]
      answers[swapIndex] = current
    }

    return {
      ...question,
      answers: answers.map((item) => item.answer),
      correctAnswerIndex: answers.findIndex((item) => item.wasCorrect),
    }
  })
}

function App() {
  return window.location.pathname === '/prompts' ? <PromptsPage /> : <ChatApp />
}

function ChatApp() {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const latestMessageRef = useRef<HTMLElement>(null)
  const [images, setImages] = useState<UploadImage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [chatPackage, setChatPackage] = useState<ChatPackage | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz>({ originalQuestions: [], questions: [] })

  const canStart = images.length > 0 && !busyLabel
  const score = useMemo(
    () =>
      activeQuiz.questions.reduce(
        (total, question, index) =>
          quizAnswers[index] === question.correctAnswerIndex ? total + 1 : total,
        0,
      ),
    [activeQuiz, quizAnswers],
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
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (uploadInputRef.current) uploadInputRef.current.value = ''
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
          package: packageFromInitial(data.package),
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
        { id: makeId(), role: 'assistant', package: data.package },
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
    setActiveQuiz({ originalQuestions: [], questions: [] })
  }

  function answerQuiz(answerIndex: number) {
    const nextAnswers = [...quizAnswers]
    nextAnswers[quizIndex] = answerIndex
    setQuizAnswers(nextAnswers)
  }

  function openQuiz(quiz: QuizQuestion[]) {
    setActiveQuiz({
      originalQuestions: quiz,
      questions: shuffleQuizAnswers(quiz),
    })
    setQuizIndex(0)
    setQuizAnswers([])
    setQuizOpen(true)
  }

  function restartQuiz() {
    setActiveQuiz((current) => ({
      originalQuestions: current.originalQuestions,
      questions: shuffleQuizAnswers(current.originalQuestions),
    }))
    setQuizAnswers([])
    setQuizIndex(0)
  }

  const currentQuiz = activeQuiz.questions[quizIndex]
  const answeredQuizCount = activeQuiz.questions.filter((_, index) => quizAnswers[index] !== undefined).length
  const quizDone = activeQuiz.questions.length > 0 && answeredQuizCount === activeQuiz.questions.length

  useEffect(() => {
    if (!chatPackage || messages.length === 0) return

    latestMessageRef.current?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    })
  }, [busyLabel, chatPackage, messages.length])

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={26} />
        </div>
        <div>
          <h1>VerAInfacher Redux</h1>
          <p className="claim">Fotografieren. Fragen. Verstehen. Ganz einfach!</p>
        </div>
        {chatPackage ? (
          <Button className="new-chat-button" onClick={resetChat}>
            Neuer Chat
          </Button>
        ) : null}
      </header>

      <section className="workspace">
        {!chatPackage ? (
          <div className="upload-panel">
            <input
              ref={cameraInputRef}
              className="file-input-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void handleFiles(event.target.files)}
            />

            <input
              ref={uploadInputRef}
              className="file-input-hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void handleFiles(event.target.files)}
            />

            <div className="capture-actions" aria-label="Fotos aufnehmen oder hochladen">
              <Button className="camera-button" onClick={() => cameraInputRef.current?.click()} aria-label="Foto machen">
                <Camera size={52} />
              </Button>
              <Button className="upload-round-button" onClick={() => uploadInputRef.current?.click()} aria-label="Bild hochladen">
                <Upload size={46} />
                <span>Bild hochladen</span>
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

            <Button className="start-chat-button" onClick={startChat} disabled={!canStart}>
              <MessageCircle size={26} />
              Chat starten
            </Button>
          </div>
        ) : (
          <div className="chat-layout">
            <section className="messages" aria-label="Chat">
              {messages.map((message, index) => (
                <article
                  className={`message ${message.role}${message.role === 'assistant' ? ' interactive-answer' : ''}`}
                  key={message.id}
                  ref={index === messages.length - 1 ? latestMessageRef : undefined}
                >
                  {message.role === 'user' ? (
                    <p>{message.text}</p>
                  ) : (
                    <>
                      <div className="summary-list" aria-label="Antwort">
                        {message.package.answer.map((sentence) => (
                          <Button
                            className="summary-sentence"
                            key={sentence}
                            onClick={() => void askChoice('sentence', sentence)}
                          >
                            {sentence}
                          </Button>
                        ))}
                      </div>

                      <section className="answer-section">
                        <h2>Erkläre mir das:</h2>
                        <div className="word-chips">
                          {message.package.difficultWords.map((item) => (
                            <Button
                              className="word-chip"
                              key={`${message.id}-${item.word}`}
                              onClick={() => void askChoice('word', item.word)}
                            >
                              {item.word}
                            </Button>
                          ))}
                        </div>
                      </section>

                      <section className="answer-section">
                        <h2>Ich will wissen:</h2>
                        <ul className="question-list">
                          {message.package.followUpQuestions.map((question) => (
                            <li key={`${message.id}-${question}`}>
                              <Button
                                className="question-link"
                                onClick={() => void askChoice('question', question)}
                              >
                                {question}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </section>

                      <Button className="quiz-button inline-quiz-button" onClick={() => openQuiz(message.package.quiz)}>
                        <Trophy size={24} />
                        Quizfragen
                      </Button>
                    </>
                  )}
                </article>
              ))}
              {busyLabel ? (
                <article className="message assistant loading-message">
                  <Loader2 className="spin" size={22} />
                  <p>{busyLabel}</p>
                </article>
              ) : null}
            </section>
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

      {quizOpen && (currentQuiz || quizDone) ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Quiz">
          {quizDone ? (
            <div className="confetti-rain" aria-hidden="true">
              {confettiPieces.map((piece) => (
                <span
                  key={piece}
                  style={{
                    left: `${(piece * 37) % 100}%`,
                    animationDelay: `${(piece % 14) * 0.12}s`,
                    animationDuration: `${2.2 + (piece % 7) * 0.18}s`,
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className="quiz-modal">
            <div className="quiz-header">
              {!quizDone ? (
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
              ) : (
                <span />
              )}
              <p>{quizDone ? 'Quiz-Ergebnis' : `Frage ${quizIndex + 1} von ${activeQuiz.questions.length}`}</p>
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
                    if (quizIndex < activeQuiz.questions.length - 1) {
                      setQuizIndex((current) => current + 1)
                    } else {
                      setQuizAnswers((current) => [...current])
                    }
                  }}
                >
                  {quizIndex < activeQuiz.questions.length - 1 ? 'Weiter' : 'Auswerten'}
                </Button>
              </>
            ) : (
              <div className="quiz-result">
                <Trophy size={54} />
                <h2>{score} von {activeQuiz.questions.length} richtig</h2>
                <div className="quiz-review-list" aria-label="Quiz-Auswertung">
                  {activeQuiz.questions.map((question, index) => {
                    const selectedAnswerIndex = quizAnswers[index]
                    const selectedAnswer =
                      selectedAnswerIndex === undefined ? 'Keine Antwort' : question.answers[selectedAnswerIndex]
                    const correctAnswer = question.answers[question.correctAnswerIndex]
                    const isCorrect = selectedAnswerIndex === question.correctAnswerIndex

                    return (
                      <section className={`quiz-review-item ${isCorrect ? 'correct' : 'wrong'}`} key={`${question.question}-${index}`}>
                        <h3>{question.question}</h3>
                        <p className={isCorrect ? 'answer-correct-text' : 'answer-wrong-text'}>
                          <strong>Deine Antwort:</strong> {selectedAnswer}
                        </p>
                        {!isCorrect ? (
                          <p className="answer-correct-text">
                            <strong>Richtig ist:</strong> {correctAnswer}
                          </p>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
                <Button
                  className="primary-button full-width"
                  onClick={() => {
                    restartQuiz()
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

function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptConfigs | null>(null)
  const [busyLabel, setBusyLabel] = useState('Prompts werden geladen')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadPrompts() {
      try {
        const response = await fetch('/api/prompts')
        if (!response.ok) throw new Error(await response.text())
        const data = (await response.json()) as { prompts: PromptConfigs }
        if (isMounted) {
          setPrompts(data.prompts)
          setError('')
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : 'Die Prompts konnten nicht geladen werden.')
        }
      } finally {
        if (isMounted) setBusyLabel('')
      }
    }

    void loadPrompts()
    return () => {
      isMounted = false
    }
  }, [])

  async function savePrompts() {
    if (!prompts) return

    setBusyLabel('Prompts werden gespeichert')
    setStatus('')
    setError('')

    try {
      const response = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompts }),
      })

      if (!response.ok) throw new Error(await response.text())

      const data = (await response.json()) as { prompts: PromptConfigs }
      setPrompts(data.prompts)
      setStatus('Prompts gespeichert.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Die Prompts konnten nicht gespeichert werden.')
    } finally {
      setBusyLabel('')
    }
  }

  return (
    <main className="app-shell prompt-admin-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={26} />
        </div>
        <div>
          <h1>Prompts</h1>
          <p className="claim">KI-Schritte ansehen, ändern und speichern.</p>
        </div>
        <Button className="new-chat-button" onClick={() => window.location.assign('/')}>
          Chat
        </Button>
      </header>

      <section className="prompt-admin">
        {prompts ? (
          <div className="prompt-grid">
            {promptConfigFields.map((field) => (
              <label className="prompt-field" key={field.key}>
                <span>{field.title}</span>
                <small>{field.help}</small>
                <textarea
                  value={prompts[field.key]}
                  onChange={(event) =>
                    setPrompts((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                />
              </label>
            ))}
          </div>
        ) : null}

        <div className="prompt-actions">
          <Button className="primary-button" onClick={() => void savePrompts()} disabled={!prompts || Boolean(busyLabel)}>
            {busyLabel ? <Loader2 className="spin" size={22} /> : <Save size={22} />}
            Speichern
          </Button>
          {busyLabel ? <p>{busyLabel}</p> : null}
          {status ? <p className="status-text">{status}</p> : null}
          {error ? <p className="prompt-error">{error}</p> : null}
        </div>
      </section>
    </main>
  )
}
