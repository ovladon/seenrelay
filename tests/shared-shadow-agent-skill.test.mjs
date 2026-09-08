import test from 'node:test';
import assert from 'node:assert/strict';
import { agentSkillMarkdown } from '../shared/agent-skill.mjs';

const skill = agentSkillMarkdown();

test('Agent Skill separates local shadow from shared-evidence shadow', () => {
  assert.match(skill, /local\/Ambient shadow/i);
  assert.match(skill, /shared-evidence shadow/i);
  assert.match(skill, /may produce no hosted SeenRelay activity/i);
});

test('shared-evidence shadow never turns measurement into authorization', () => {
  assert.match(skill, /classic client without a `reuse` policy/i);
  assert.match(skill, /original authoritative validation still runs/i);
  assert.match(skill, /fresh independent result may the client OBSERVE/i);
  assert.match(skill, /CHECK result never authorizes skipping validation in shadow mode/i);
});

test('Agent Skill forbids manufactured shared identity and requires economic evidence', () => {
  assert.match(skill, /Do not manufacture a shared fact identity merely to exercise the relay/i);
  assert.match(skill, /no economic advantage over stronger existing controls/i);
  assert.match(skill, /leave shared reuse disabled/i);
});
