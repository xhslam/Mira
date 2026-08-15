import { createContext, useContext, useMemo } from "react";
import { translate, type AppLocale, type TranslationKey } from "./i18n";

/** Mira 当前发布版本固定使用简体中文界面。 */
export const LocaleContext = createContext<AppLocale>("zh-CN");

export function useLocale(): AppLocale {
  return useContext(LocaleContext);
}

export type Translator = (
  key: TranslationKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

export function useTranslate(): Translator {
  const locale = useLocale();
  return useMemo(() => (key, values) => translate(locale, key, values), [locale]);
}
