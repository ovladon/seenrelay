export const SEENRELAY_SKILL_DESCRIPTION: string;

export interface SeenRelayAgentSkillEntry {
  name: string;
  type: 'skill-md';
  description: string;
  url: string;
  digest: string;
}

export interface SeenRelayAgentSkillIndex {
  $schema: string;
  skills: SeenRelayAgentSkillEntry[];
}

export function agentSkillMarkdown(): string;
export function agentSkillIndex(origin: string): Promise<SeenRelayAgentSkillIndex>;
