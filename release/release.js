'use strict';

// release-please drops commits that are not conventional (`fix:`, `feat:`, ...).
// Echo libraries do not use that convention. Treat leftover commits as patch
// fixes so always-bump-patch actually bumps.
const commitMod = require('release-please/build/src/commit');
const originalParse = commitMod.parseConventionalCommits;
commitMod.parseConventionalCommits = function parseWithFallback(commits, logger) {
  const list = commits || [];
  const parsed = originalParse.call(this, list, logger);
  const seen = new Set(parsed.map((c) => c.sha));
  let fallbacks = 0;
  for (const commit of list) {
    if (seen.has(commit.sha)) {
      continue;
    }
    const firstLine = String(commit.message || '').split('\n')[0].trim();
    parsed.push({
      sha: commit.sha,
      message: `fix: ${firstLine}`,
      files: commit.files,
      pullRequest: commit.pullRequest,
      author: commit.author,
      type: 'fix',
      scope: null,
      bareMessage: firstLine,
      notes: [],
      references: [],
      breaking: false,
    });
    seen.add(commit.sha);
    fallbacks += 1;
  }
  if (fallbacks > 0) {
    console.log(
      `treated ${fallbacks} non-conventional commit(s) as patch fixes`
    );
  }
  return parsed;
};

const fs = require('fs');
const { GitHub, Manifest } = require('release-please');

// what a caller's next job needs to attach files to the release just cut.
// a release made with GITHUB_TOKEN fires no `release` event, so this is
// the only way that job hears about it.
function writeOutputs(release) {
  const lines = [
    `release-created=${release ? 'true' : 'false'}`,
    `tag-name=${release ? release.tagName : ''}`,
    `version=${release ? release.version : ''}`,
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
}

// more files carrying `x-release-please-version`, one per line or comma
function extraFiles() {
  return String(process.env.EXTRA_FILES || '')
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && p !== 'module.eco')
    .map((path) => ({ type: 'generic', path }));
}

async function hasReleaseTag(github) {
  for await (const tag of github.tagIterator()) {
    if (tag && tag.name) {
      return true;
    }
  }
  return false;
}

function patchBump(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return '0.1.0';
  }
  return `${match[1]}.${match[2]}.${parseInt(match[3], 10) + 1}`;
}

async function initialVersionFromModule(github, branch) {
  try {
    const file = await github.getFileContentsOnBranch('module.eco', branch);
    const raw = file.parsedContent || '';
    const match = String(raw).match(/#\[version:\s*"(\d+\.\d+\.\d+)"\]/);
    if (match) {
      return patchBump(match[1]);
    }
  } catch (_err) {
    // no module.eco, fall through
  }
  return '0.1.0';
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.REPO;
  const branch = process.env.BRANCH;
  const changelog = process.env.CHANGELOG === 'true';
  if (!token) {
    throw new Error('GITHUB_TOKEN is missing');
  }
  if (!repo || !repo.includes('/')) {
    throw new Error(`REPO must be owner/name, got ${repo}`);
  }
  if (!branch) {
    throw new Error('BRANCH is missing');
  }

  const [owner, name] = repo.split('/');
  const github = await GitHub.create({ owner, repo: name, token });
  const config = {
    releaseType: 'simple',
    versioning: 'always-bump-patch',
    extraFiles: [{ type: 'generic', path: 'module.eco' }, ...extraFiles()],
    includeVInTag: true,
    includeComponentInTag: false,
    skipChangelog: !changelog,
    pullRequestHeader: 'This PR bumps the patch.',
    pullRequestFooter: 'Merge it and the tag goes out.',
  };

  // No tags: release-please's simple strategy starts at 1.0.0. Echo libs
  // already declare 0.1.0 in module.eco, so patch-bump that instead.
  if (!(await hasReleaseTag(github))) {
    config.initialVersion = await initialVersionFromModule(github, branch);
    console.log(`no tags found, first release will be ${config.initialVersion}`);
  }

  const manifest = await Manifest.fromConfig(github, branch, config);

  // Tag first. Opening the next PR before that treats the merged bump as
  // already released, then dies generating notes against a tag that does
  // not exist yet.
  try {
    const releases = await manifest.createReleases();
    console.log('github releases:', JSON.stringify(releases, null, 2));
    writeOutputs((releases || []).find((r) => r && r.tagName));
  } catch (err) {
    if (err && err.constructor && err.constructor.name === 'DuplicateReleaseError') {
      console.log('no new github release to tag');
      writeOutputs(null);
    } else {
      throw err;
    }
  }

  try {
    const prs = await manifest.createPullRequests();
    console.log('release pull requests:', JSON.stringify(prs, null, 2));
  } catch (err) {
    const apiMessage =
      err && err.response && err.response.data && err.response.data.message;
    if (
      err &&
      err.status === 403 &&
      String(apiMessage).includes('not permitted to create or approve pull requests')
    ) {
      console.error(
        'GitHub Actions cannot open pull requests in this organization.\n' +
          'Org Settings > Actions > General > Allow GitHub Actions to create and approve pull requests.\n' +
          'The release branch was still updated: release-please--branches--master'
      );
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
