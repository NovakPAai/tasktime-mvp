/**
 * GitHub Issue Reporter for Playwright.
 *
 * On CI (CI=true) + main branch (GITHUB_REF=refs/heads/main):
 * - For each failed test, create a GitHub issue with label `e2e-bug`.
 * - Deduplication: if an open issue with the same title already exists,
 *   add a comment instead of creating a new issue.
 *
 * Requires:
 *   - GH_TOKEN env var (GITHUB_TOKEN in CI is sufficient)
 *   - gh CLI installed in CI runner (actions/github-cli is included in ubuntu-latest)
 *   - permissions: issues: write
 */
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import { execSync } from 'child_process';

interface FailureRecord {
  title: string;
  location: string;
  error: string;
  screenshotPath?: string;
}

class GitHubIssueReporter implements Reporter {
  private failures: FailureRecord[] = [];
  private readonly repo: string;

  constructor(options?: { repo?: string }) {
    this.repo = options?.repo ?? process.env.GITHUB_REPOSITORY ?? '';
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    const titlePath = test.titlePath();
    // Remove the file-level segment, keep describe + test name
    const title = `[e2e] ${titlePath.slice(1).join(' › ')}`;

    const errorMessage = result.error?.message
      ? result.error.message.split('\n').slice(0, 10).join('\n')
      : 'No error message';

    const screenshot = result.attachments.find(
      (a) => a.name === 'screenshot' && a.path,
    );

    this.failures.push({
      title,
      location: `${test.location.file}:${test.location.line}`,
      error: errorMessage,
      screenshotPath: screenshot?.path,
    });
  }

  async onEnd(_result: FullResult) {
    const isCI = process.env.CI === 'true';
    const isMain = process.env.GITHUB_REF === 'refs/heads/main';
    const hasToken = !!process.env.GH_TOKEN;

    if (!isCI || !isMain || !hasToken) {
      if (this.failures.length > 0) {
        console.log(
          `[github-issue-reporter] Skipping issue creation (CI=${isCI}, main=${isMain}, token=${hasToken}). ` +
          `${this.failures.length} failure(s) detected.`,
        );
      }
      return;
    }

    const sha = process.env.GITHUB_SHA ?? 'unknown';
    const runId = process.env.GITHUB_RUN_ID ?? '';
    const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    const runUrl = this.repo && runId
      ? `${serverUrl}/${this.repo}/actions/runs/${runId}`
      : 'N/A';

    for (const f of this.failures) {
      try {
        await this.upsertIssue(f, sha, runUrl);
      } catch (err) {
        console.error(`[github-issue-reporter] Failed to create/update issue for "${f.title}":`, err);
      }
    }
  }

  private async upsertIssue(
    f: FailureRecord,
    sha: string,
    runUrl: string,
  ): Promise<void> {
    // Search for existing open issue with same title
    const searchCmd = `gh issue list --state open --label e2e-bug --search "${f.title.replace(/"/g, '\\"')} in:title" --json number --jq '.[0].number' ${this.repo ? `--repo ${this.repo}` : ''}`;

    let existingNumber: string | null = null;
    try {
      const result = execSync(searchCmd, { encoding: 'utf-8' }).trim();
      // Validate strictly numeric to prevent shell injection
      if (result && /^\d+$/.test(result)) {
        existingNumber = result;
      }
    } catch {
      // ignore search errors — will create a new issue
    }

    const baseBody = [
      `## E2E Test Failure`,
      ``,
      `**Test:** \`${f.title}\``,
      `**Location:** \`${f.location}\``,
      `**Commit:** \`${sha}\``,
      `**Run:** ${runUrl}`,
      `**Staging:** http://5.129.242.171:8080`,
      ``,
      `### Error`,
      `\`\`\``,
      f.error,
      `\`\`\``,
      ``,
      `### Artifacts`,
      `See artifact \`playwright-report\` in the workflow run for screenshots and traces.`,
      ``,
      `---`,
      `🤖 Auto-reported by Playwright E2E on \`main\` after merge.`,
    ].join('\n');

    if (existingNumber) {
      // Add comment to existing issue
      const commentCmd = `gh issue comment ${existingNumber} --body ${JSON.stringify(`### Повторное падение на \`${sha}\`\n\n${baseBody}`)} ${this.repo ? `--repo ${this.repo}` : ''}`;
      execSync(commentCmd, { encoding: 'utf-8' });
      console.log(`[github-issue-reporter] Added comment to issue #${existingNumber}: ${f.title}`);
    } else {
      // Create new issue
      const repoFlag = this.repo ? `--repo ${this.repo}` : '';
      const createCmd = `gh issue create --title ${JSON.stringify(f.title)} --label "e2e-bug,auto-reported" --body ${JSON.stringify(baseBody)} ${repoFlag}`;
      const output = execSync(createCmd, { encoding: 'utf-8' }).trim();
      console.log(`[github-issue-reporter] Created issue: ${output}`);
    }
  }
}

export default GitHubIssueReporter;
