declare const process: {
  env: Record<string, string | undefined>;
  cpuUsage(previousValue?: { user: number; system: number }): { user: number; system: number };
};
