import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CONFIGURATION_COMMANDS, isConfigurationCommand } from "./configuration-service.js";

test("configuration Runtime Gateway advertises only the exact bounded command matrix", () => {
  assert.deepEqual(CONFIGURATION_COMMANDS, {
    "models.configure": ["replace"],
    "plugins.configure": ["plugin_action"],
    "skills.configure": ["toggle_model_invocation", "install", "update"],
    "mcp.configure": ["set_disabled", "set_lifecycle"],
    "keybinds.configure": ["replace"],
    "project_trust.configure": ["trust"],
  });
  assert.equal(isConfigurationCommand("skills.configure", "toggle_model_invocation"), true);
  assert.equal(isConfigurationCommand("mcp.configure", "set_disabled"), true);
  assert.equal(isConfigurationCommand("mcp.configure", "set_lifecycle"), true);
  assert.equal(isConfigurationCommand("project_trust.configure", "replace"), false);
  assert.equal(isConfigurationCommand("plugins.configure", "install"), false);
  assert.equal(isConfigurationCommand("models.configure", "merge"), false);
});

test("components avoid retained mutation URLs and retained routes only translate", async () => {
  const [models, plugins, skills, modelRoute, pluginRoute, skillRoute, installRoute, updateRoute] = await Promise.all([
    readFile("src/web/components/ModelsConfig.tsx", "utf8"),
    readFile("src/web/components/PluginsConfig.tsx", "utf8"),
    readFile("src/web/components/SkillsConfig.tsx", "utf8"),
    readFile("src/web/app/api/models-config/route.ts", "utf8"),
    readFile("src/web/app/api/plugins/route.ts", "utf8"),
    readFile("src/web/app/api/skills/route.ts", "utf8"),
    readFile("src/web/app/api/skills/install/route.ts", "utf8"),
    readFile("src/web/app/api/skills/update/route.ts", "utf8"),
  ]);
  assert.doesNotMatch(models, /fetch\("\/api\/models-config"[\s\S]*?method:\s*"PUT"/);
  assert.doesNotMatch(plugins, /fetch\("\/api\/plugins"[\s\S]*?method:\s*"POST"/);
  assert.doesNotMatch(skills, /fetch\("\/api\/skills(?:\/install|\/update)?"[\s\S]*?method:\s*"(?:POST|PATCH)"/);
  for (const route of [modelRoute, pluginRoute, skillRoute, installRoute, updateRoute]) assert.match(route, /translateConfigurationRoute/);
  assert.doesNotMatch(modelRoute, /writeModelsConfig/);
  assert.doesNotMatch(installRoute, /runNpx/);
  assert.doesNotMatch(updateRoute, /runNpx/);
  assert.doesNotMatch(skillRoute, /writeFile/);
});

test("foreground composition owns the service seam without opening an official session", async () => {
  const source = await readFile("src/web/server/foreground-composition.ts", "utf8");
  assert.match(source, /registry\.create\(configurationIdentity/);
  assert.match(source, /opaqueHandle\("configuration", options\.privateSalt/);
  assert.match(source, /ConfigurationMutationService/);
  assert.match(source, /currentSessionLeaf:\s*"configuration"/);
  assert.doesNotMatch(source, /configurationService[\s\S]{0,120}createOfficialSession/);
});
