export type UploadImage = {
  name: string
  type: string
  dataUrl: string
}

export type DifficultWord = {
  word: string
  shortExplanation: string
}

export type QuizQuestion = {
  question: string
  answers: string[]
  correctAnswerIndex: number
}

export type ChatPackage = {
  sourceText: string
  summary: string[]
  difficultWords: DifficultWord[]
  followUpQuestions: string[]
  quiz: QuizQuestion[]
}

export type ChoiceKind = 'sentence' | 'word' | 'question'
