export type AppLang = "uz-Cyrl" | "uz-Latn" | "ru" | "en";

export function getLang(): AppLang {
  if (typeof window === "undefined") return "uz-Cyrl";
  return (localStorage.getItem("app_lang") as AppLang) || "uz-Cyrl";
}
//src\utils\translate.ts
// Универсальная функция перевода по порядку аргументов:
// 1: узбекский (кириллица)
// 2: узбекский (латиница)
// 3: русский
// 4: английский
export function tr(cyrl: string, latn: string, ru: string, en: string): string {
  const lang = getLang();
  switch (lang) {
    case "uz-Cyrl": return cyrl;
    case "uz-Latn": return latn;
    case "ru": return ru;
    case "en": return en;
    default: return cyrl;
  }
}