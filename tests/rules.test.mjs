import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  DYNAMIC_RULE_IDS,
  LANGUAGES,
  SCHOLAR_HOSTS,
  buildDynamicRules,
  buildLanguageRules,
  normalizeSettings,
  readDynamicSettings,
} from "../extension/rules.mjs";

const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url)));
const staticRules = manifest.declarative_net_request.rule_resources
  .filter(({ enabled }) => enabled)
  .flatMap(({ path }) => JSON.parse(readFileSync(new URL(`../extension/${path}`, import.meta.url))));

function matchingRule(rules, url, { method = "get", resourceType = "main_frame" } = {}) {
  const host = new URL(url).hostname;
  return rules
    .filter(({ condition }) =>
      condition.requestMethods.includes(method) &&
      condition.resourceTypes.includes(resourceType) &&
      (!condition.requestDomains || condition.requestDomains.some((domain) =>
        host === domain || host.endsWith(`.${domain}`))) &&
      new RegExp(condition.regexFilter, condition.isUrlFilterCaseSensitive ? "" : "i").test(url)
    )
    .sort((left, right) => right.priority - left.priority)[0];
}

const profileUrl = "https://scholar.google.com/citations?user=W9Ag9CkAAAAJ";

test("the default English rules are packaged and enabled", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { enabled: true, language: "en" });
  assert.deepEqual(staticRules, buildLanguageRules("en"));
  assert.deepEqual(buildDynamicRules(DEFAULT_SETTINGS), []);
});

test("permissions and redirects are confined to the supported Scholar hosts", () => {
  assert.ok(SCHOLAR_HOSTS.includes("scholar.google.com"));
  assert.ok(SCHOLAR_HOSTS.includes("scholar.google.de"));
  assert.deepEqual(
    new Set(manifest.host_permissions),
    new Set(SCHOLAR_HOSTS.map((host) => `*://${host}/*`)),
  );
  for (const host of SCHOLAR_HOSTS) {
    assert.equal(matchingRule(staticRules, `https://${host}/citations`)?.action.type, "redirect", host);
  }
  for (const url of [
    "https://www.google.com/search?q=scholar",
    "https://google.com/citations",
    "https://scholar.google.invalid/citations",
    "https://scholar.google.com.example.com/citations",
    "https://sub.scholar.google.com/citations",
    "https://scholar.google.com@evil.example/citations",
    "https://evil.example/?url=https://scholar.google.com/citations",
  ]) {
    assert.equal(matchingRule(staticRules, url), undefined, url);
  }
});

test("redirects apply to GET document navigations", () => {
  assert.equal(matchingRule(staticRules, profileUrl)?.action.type, "redirect");
  for (const method of ["post", "head", "put"]) {
    assert.equal(matchingRule(staticRules, profileUrl, { method }), undefined, method);
  }
  for (const resourceType of ["sub_frame", "xmlhttprequest", "image", "script", "stylesheet"]) {
    assert.equal(matchingRule(staticRules, profileUrl, { resourceType }), undefined, resourceType);
  }
});

test("language changes use a query transform, with a higher-priority allow for the chosen language", () => {
  for (const suffix of ["", "&hl=de", "&hl", "&other_hl=en", "&q=hl%3Den"]) {
    const rule = matchingRule(staticRules, profileUrl + suffix);
    assert.deepEqual(
      rule?.action,
      { type: "redirect", redirect: { transform: { queryTransform: {
        addOrReplaceParams: [{ key: "hl", value: "en" }],
      } } } },
      suffix,
    );
  }

  for (const url of [profileUrl + "&hl=en", profileUrl + "&hl=en&view_op=list_works", profileUrl + "&hl=en#papers"]) {
    assert.equal(matchingRule(staticRules, url)?.action.type, "allow", url);
  }
});

test("duplicate exact language keys are removed even when one value already matches", () => {
  for (const suffix of ["&hl=en&hl=de", "&hl=de&x=1&hl=en", "&hl&hl", "&hl=&hl=de"]) {
    const { action } = matchingRule(staticRules, profileUrl + suffix);
    assert.equal(action.type, "redirect", suffix);
    assert.deepEqual(action.redirect.transform.queryTransform, {
      removeParams: ["hl"],
    }, suffix);
  }
});

test("every language and enabled state round-trips through persisted dynamic rules", () => {
  for (const language of Object.keys(LANGUAGES)) {
    for (const enabled of [true, false]) {
      const settings = { enabled, language };
      const dynamicRules = buildDynamicRules(settings);
      assert.deepEqual(readDynamicSettings(JSON.parse(JSON.stringify(dynamicRules))), settings);
      assert.ok(dynamicRules.every(({ id }) => DYNAMIC_RULE_IDS.includes(id)));
      assert.equal(new Set(dynamicRules.map(({ id }) => id)).size, dynamicRules.length);

      const rules = [...staticRules, ...dynamicRules];
      if (enabled) {
        const rule = matchingRule(rules, profileUrl);
        assert.equal(rule?.action.redirect.transform.queryTransform.addOrReplaceParams[0].value, language);
        assert.equal(matchingRule(rules, profileUrl + "&hl=" + language)?.action.type, "allow");
      } else {
        assert.equal(matchingRule(rules, profileUrl + "&hl=de&hl=en")?.action.type, "allow");
      }
    }
  }
});

test("missing or invalid settings fall back to English and enabled", () => {
  assert.deepEqual(readDynamicSettings([]), DEFAULT_SETTINGS);
  for (const input of [undefined, null, { enabled: "false", language: "constructor" }, { language: "xyz" }]) {
    assert.deepEqual(normalizeSettings(input), DEFAULT_SETTINGS);
  }
});
