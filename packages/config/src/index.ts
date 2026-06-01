import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { z, type ZodIssue } from "zod";

const nonEmptyString = z.string().trim().min(1, "Expected a non-empty string.");

const limitsSchema = z
  .object({
    max_files_changed_warning: z.number().int().positive().default(12),
    max_lines_added_warning: z.number().int().nonnegative().default(500),
    max_lines_deleted_warning: z.number().int().nonnegative().default(250)
  })
  .default({});

const checksSchema = z
  .object({
    skipped_tests: z.boolean().default(true),
    deleted_tests: z.boolean().default(true),
    dependency_bloat: z.boolean().default(true),
    ci_weakening: z.boolean().default(true),
    risky_files: z.boolean().default(true),
    secrets: z.boolean().default(true)
  })
  .default({});

const agentBehaviorSchema = z
  .object({
    minimal_scoped_changes: z.boolean().default(true),
    avoid_speculative_refactors: z.boolean().default(true),
    avoid_unnecessary_dependencies: z.boolean().default(true),
    preserve_tests_and_ci: z.boolean().default(true),
    explain_changed_files: z.boolean().default(true)
  })
  .default({});

export const GleipConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    mode: z.enum(["advisory", "strict", "enterprise"]).default("advisory"),
    principles: z.array(nonEmptyString).default([]),
    limits: limitsSchema,
    checks: checksSchema,
    risky_files: z
      .array(nonEmptyString)
      .default(["package.json", "pnpm-lock.yaml", ".github/**", "**/*.config.*", "**/*secret*"]),
    protected_paths: z.array(nonEmptyString).default([]),
    allowed_paths: z.array(nonEmptyString).default([]),
    approval_required_for: z.array(nonEmptyString).default([]),
    agent_behavior: agentBehaviorSchema
  })
  .strict();

export type GleipConfig = z.infer<typeof GleipConfigSchema>;

export class GleipConfigValidationError extends Error {
  readonly issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super(`Invalid Gleip config:\n${formatIssues(issues)}`);
    this.name = "GleipConfigValidationError";
    this.issues = issues;
  }
}

export function getDefaultConfig(): GleipConfig {
  return parseConfig({});
}

export function parseConfig(raw: string | unknown): GleipConfig {
  const value = typeof raw === "string" ? parseRawConfig(raw) : raw;
  const result = GleipConfigSchema.safeParse(value ?? {});

  if (!result.success) {
    throw new GleipConfigValidationError(result.error.issues);
  }

  return result.data;
}

export function loadConfig(cwd: string): GleipConfig {
  const configPath = join(cwd, ".gleip.yml");

  if (!existsSync(configPath)) {
    return getDefaultConfig();
  }

  return parseConfig(readFileSync(configPath, "utf8"));
}

function parseRawConfig(raw: string): unknown {
  try {
    return parseYaml(raw) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse YAML.";
    throw new Error(`Invalid Gleip config YAML: ${message}`);
  }
}

function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
