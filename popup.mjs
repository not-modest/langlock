import {
  buildDynamicRules,
  DYNAMIC_RULE_IDS,
  LANGUAGES,
  readDynamicSettings,
} from "./rules.mjs";

const controls = document.querySelector("#settings");
const enabled = document.querySelector("#enabled");
const language = document.querySelector("#language");
const status = document.querySelector("#status");
const networkRules = chrome.declarativeNetRequest;

for (const [code, name] of Object.entries(LANGUAGES)) {
  language.add(new Option(name, code));
}

function display(settings) {
  enabled.checked = settings.enabled;
  language.value = settings.language;
  language.disabled = !settings.enabled;
}

try {
  let saved = readDynamicSettings(await networkRules.getDynamicRules());
  display(saved);
  controls.disabled = false;

  controls.addEventListener("change", async () => {
    const settings = { enabled: enabled.checked, language: language.value };
    controls.disabled = true;
    try {
      await networkRules.updateDynamicRules({
        removeRuleIds: DYNAMIC_RULE_IDS,
        addRules: buildDynamicRules(settings),
      });
      saved = settings;
      status.textContent = "Saved. Reload Scholar to apply the change.";
    } catch (error) {
      console.error(error);
      status.textContent = "Couldn’t save your settings. Try again.";
    } finally {
      display(saved);
      controls.disabled = false;
    }
  });
} catch (error) {
  console.error(error);
  status.textContent = "Couldn’t load your settings. Reopen this popup to try again.";
}
