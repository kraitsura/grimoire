import { describe, test, expect } from "bun:test";
import {
  FormatService,
  FormatServiceLive,
  FormatError,
  type FormattingConfig,
  type FormatResult,
  type LintResult,
  type LintIssue,
  type FrontmatterResult,
} from "../src/services";

describe("FormatService exports", () => {
  test("exports FormatService tag", () => {
    expect(FormatService).toBeDefined();
  });

  test("exports FormatServiceLive layer", () => {
    expect(FormatServiceLive).toBeDefined();
  });

  test("exports FormatError", () => {
    expect(FormatError).toBeDefined();
  });

  test("exports types", () => {
    // This test just ensures types compile
    const config: FormattingConfig = {
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
      indentSize: 2,
      normalizeXmlTags: true,
    };
    expect(config).toBeDefined();

    const formatResult: FormatResult = {
      content: "test",
      changes: 0,
    };
    expect(formatResult).toBeDefined();

    const lintIssue: LintIssue = {
      line: 1,
      column: 1,
      severity: "error",
      message: "test",
      rule: "test-rule",
    };
    expect(lintIssue).toBeDefined();

    const lintResult: LintResult = {
      isValid: true,
      issues: [],
    };
    expect(lintResult).toBeDefined();

    const frontmatterResult: FrontmatterResult = {
      isValid: true,
      errors: [],
    };
    expect(frontmatterResult).toBeDefined();
  });
});
