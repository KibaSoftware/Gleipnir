import { describe, expect, it } from "vitest";

import { getDefaultConfig, parseConfig } from "./index.js";

describe("Gleip config", () => {
  it("returns the default config", () => {
    expect(getDefaultConfig()).toEqual({
      version: 1,
      mode: "advisory",
      principles: [],
      limits: {
        max_files_changed_warning: 12,
        max_lines_added_warning: 500,
        max_lines_deleted_warning: 250
      },
      checks: {
        skipped_tests: true,
        deleted_tests: true,
        dependency_bloat: true,
        ci_weakening: true,
        risky_files: true,
        secrets: true
      },
      risky_files: ["package.json", "pnpm-lock.yaml", ".github/**", "**/*.config.*", "**/*secret*"],
      protected_paths: [],
      allowed_paths: [],
      approval_required_for: [],
      agent_behavior: {
        minimal_scoped_changes: true,
        avoid_speculative_refactors: true,
        avoid_unnecessary_dependencies: true,
        preserve_tests_and_ci: true,
        explain_changed_files: true
      }
    });
  });

  it("parses a valid config", () => {
    expect(
      parseConfig(`
version: 1
mode: strict
principles:
  - Keep changes small.
limits:
  max_files_changed_warning: 4
  max_lines_added_warning: 120
  max_lines_deleted_warning: 80
checks:
  dependency_bloat: false
risky_files:
  - package.json
protected_paths:
  - src/security/**
allowed_paths:
  - packages/config/**
approval_required_for:
  - dependency_changes
agent_behavior:
  explain_changed_files: false
`)
    ).toMatchObject({
      version: 1,
      mode: "strict",
      principles: ["Keep changes small."],
      limits: {
        max_files_changed_warning: 4,
        max_lines_added_warning: 120,
        max_lines_deleted_warning: 80
      },
      checks: {
        dependency_bloat: false,
        skipped_tests: true
      },
      risky_files: ["package.json"],
      protected_paths: ["src/security/**"],
      allowed_paths: ["packages/config/**"],
      approval_required_for: ["dependency_changes"],
      agent_behavior: {
        explain_changed_files: false,
        minimal_scoped_changes: true
      }
    });
  });

  it("reports an invalid mode", () => {
    expect(() => parseConfig({ mode: "review-only" })).toThrow(
      "mode: Invalid enum value. Expected 'advisory' | 'strict' | 'enterprise', received 'review-only'"
    );
  });

  it("merges partial config with defaults", () => {
    expect(
      parseConfig({
        mode: "enterprise",
        limits: {
          max_files_changed_warning: 2
        },
        checks: {
          skipped_tests: false
        }
      })
    ).toMatchObject({
      version: 1,
      mode: "enterprise",
      limits: {
        max_files_changed_warning: 2,
        max_lines_added_warning: 500,
        max_lines_deleted_warning: 250
      },
      checks: {
        skipped_tests: false,
        deleted_tests: true,
        dependency_bloat: true,
        ci_weakening: true,
        risky_files: true,
        secrets: true
      },
      agent_behavior: {
        minimal_scoped_changes: true,
        avoid_speculative_refactors: true,
        avoid_unnecessary_dependencies: true,
        preserve_tests_and_ci: true,
        explain_changed_files: true
      }
    });
  });
});
