export const LANGUAGES = Object.freeze({
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
  ru: "Русский",
  tr: "Türkçe",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
});

export const SCHOLAR_HOSTS = Object.freeze([
  "scholar.google.com",
  "scholar.google.ca",
  "scholar.google.co.in",
  "scholar.google.co.jp",
  "scholar.google.co.kr",
  "scholar.google.co.uk",
  "scholar.google.com.au",
  "scholar.google.com.br",
  "scholar.google.com.hk",
  "scholar.google.com.tw",
  "scholar.google.de",
  "scholar.google.es",
  "scholar.google.fr",
  "scholar.google.it",
  "scholar.google.nl",
  "scholar.google.pl",
]);

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, language: "en" });

const DYNAMIC_FIRST_ID = 11;
const DYNAMIC_FIRST_PRIORITY = 4;
const DISABLED_RULE_ID = 14;
export const DYNAMIC_RULE_IDS = Object.freeze([11, 12, 13, DISABLED_RULE_ID]);

// Use requestDomains for the host list to keep the query regexes within Chrome's memory limit.
const scholarUrl = "^https?://scholar\\.google\\.[a-z]+(?:\\.[a-z]+)?(?::[0-9]+)?/";
const query = `${scholarUrl}[^?#]*\\?(?:[^#]*&)?`;

function condition(regexFilter) {
  return {
    regexFilter,
    isUrlFilterCaseSensitive: true,
    requestDomains: [...SCHOLAR_HOSTS],
    requestMethods: ["get"],
    resourceTypes: ["main_frame"],
  };
}

function redirect(queryTransform) {
  return { type: "redirect", redirect: { transform: { queryTransform } } };
}

export function normalizeSettings(settings) {
  const { enabled, language } = settings ?? {};
  return {
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_SETTINGS.enabled,
    language: typeof language === "string" && Object.hasOwn(LANGUAGES, language)
      ? language
      : DEFAULT_SETTINGS.language,
  };
}

export function buildLanguageRules(language, { firstId = 1, firstPriority = 1 } = {}) {
  const { language: supportedLanguage } = normalizeSettings({ language });
  return [
    {
      id: firstId,
      priority: firstPriority,
      action: redirect({ addOrReplaceParams: [{ key: "hl", value: supportedLanguage }] }),
      condition: condition(scholarUrl),
    },
    {
      id: firstId + 1,
      priority: firstPriority + 1,
      action: { type: "allow" },
      condition: condition(`${query}hl=${supportedLanguage}(?:[&#]|$)`),
    },
    {
      id: firstId + 2,
      priority: firstPriority + 2,
      // Remove all copies first. The next request triggers the general rule to add one hl value.
      action: redirect({ removeParams: ["hl"] }),
      condition: condition(`${query}hl(?:=[^&#]*)?&(?:[^#]*&)?hl(?:=|[&#]|$)`),
    },
  ];
}

export function buildDynamicRules(settings) {
  const { enabled, language } = normalizeSettings(settings);
  // The packaged English rules are active as soon as the extension is loaded.
  if (enabled && language === DEFAULT_SETTINGS.language) {
    return [];
  }

  const rules = buildLanguageRules(language, {
    firstId: DYNAMIC_FIRST_ID,
    firstPriority: DYNAMIC_FIRST_PRIORITY,
  });
  if (!enabled) {
    rules.push({
      id: DISABLED_RULE_ID,
      priority: DYNAMIC_FIRST_PRIORITY + 3,
      action: { type: "allow" },
      condition: condition(scholarUrl),
    });
  }
  return rules;
}

export function readDynamicSettings(rules) {
  // Dynamic rules persist across browser restarts. Reading them keeps the popup and browser in sync.
  const queryTransform = rules.find((rule) => rule.id === DYNAMIC_FIRST_ID)
    ?.action?.redirect?.transform?.queryTransform;
  return normalizeSettings({
    enabled: !rules.some((rule) => rule.id === DISABLED_RULE_ID),
    language: queryTransform?.addOrReplaceParams?.[0]?.value,
  });
}
