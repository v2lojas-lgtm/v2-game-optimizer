import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR'
import en   from './locales/en'
import es   from './locales/es'

export type SupportedLang = 'pt-BR' | 'en' | 'es'
export const SUPPORTED_LANGS: SupportedLang[] = ['pt-BR', 'en', 'es']

function getStoredLang(): SupportedLang {
  const stored = localStorage.getItem('v2_lang')
  if (stored === 'pt-BR' || stored === 'en' || stored === 'es') return stored
  // Try to match browser language
  const browser = navigator.language
  if (browser.startsWith('pt')) return 'pt-BR'
  if (browser.startsWith('es')) return 'es'
  return 'pt-BR'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en:      { translation: en  },
      es:      { translation: es  },
    },
    lng:           getStoredLang(),
    fallbackLng:   'pt-BR',
    interpolation: { escapeValue: false },
  })

export function setLanguage(lang: SupportedLang) {
  i18n.changeLanguage(lang)
  localStorage.setItem('v2_lang', lang)
}

export default i18n
