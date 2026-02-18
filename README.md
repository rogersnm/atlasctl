# atlasctl

CLI for Atlassian workflows: Confluence pages and Jira issues.

Features:
- Get a Confluence page with all comments and nested replies
- Create a Confluence page from markdown
- Create a Jira issue with markdown description (converted to ADF)
- Inline comment metadata included when available

## Requirements

- Node.js 18+

## Install

### Global (from npm)

```bash
npm install -g atlasctl
```

### Local development

Requires [Bun](https://bun.sh) for building and testing.

```bash
bun install
```

Run directly:

```bash
bun run src/cli.ts --help
```

## Configuration

Config file path:

```text
~/.atlasctl.json
```

Set required values:

```bash
atlasctl config set site your-domain.atlassian.net
atlasctl config set email you@company.com
atlasctl config set apikey <atlassian-api-token>
```

Or run guided setup for all required fields:

```bash
atlasctl config set
```

Guided setup requires an interactive terminal.

Read values:

```bash
atlasctl config get site
atlasctl config get email
atlasctl config get apikey
```

Notes:
- `apikey` is always redacted when read (`***hidden***`).
- `config show` also redacts `apikey`.

## Commands

```text
atlasctl config set
atlasctl config set <site|email|apikey> <value>
atlasctl config get <site|email|apikey>
atlasctl config show
atlasctl confluence page get <id-or-url> [--output <file>] [--pretty]
atlasctl confluence page create --space <key> --title <title> [--parent <id-or-url>] [--body <md>] [--body-file <file>] [--pretty]
atlasctl jira issue create --project <key> --summary <text> --type <name> [--description <md>] [--description-file <file>] [--priority <name>] [--labels <csv>] [--assignee <id>] [--pretty]
atlasctl --help
atlasctl --help-llm
atlasctl --version
```

## Get a Confluence page

By page ID:

```bash
atlasctl confluence page get 22982787097 --pretty
```

By URL:

```bash
atlasctl confluence page get "https://your-domain.atlassian.net/wiki/spaces/ENG/pages/22982787097/Page+Title"
```

Or write output to disk:

```bash
atlasctl confluence page get 22982787097 --output page.json --pretty
```

## Create a Confluence page

Create a page in a space with markdown content:

```bash
atlasctl confluence page create --space ENG --title "My Page" --body "# Hello\n\nWorld" --pretty
```

Read body from a file:

```bash
atlasctl confluence page create --space ENG --title "My Page" --body-file content.md
```

Create as a child of an existing page:

```bash
atlasctl confluence page create --space ENG --title "Child Page" --parent 12345 --body "child content"
```

The `--parent` option accepts a numeric page ID or a full Confluence page URL.

Body content can also be piped via stdin when neither `--body` nor `--body-file` is provided:

```bash
cat content.md | atlasctl confluence page create --space ENG --title "Piped Page"
```

Returns JSON with `id`, `title`, `space`, and `url`.

## Create a Jira issue

Create a task:

```bash
atlasctl jira issue create --project PROJ --summary "Fix login bug" --type Task --pretty
```

With a markdown description (converted to Atlassian Document Format automatically):

```bash
atlasctl jira issue create --project PROJ --summary "Add dark mode" --type Story \
  --description "# Requirements\n\nSupport dark theme" --priority High
```

Read description from a file:

```bash
atlasctl jira issue create --project PROJ --summary "Detailed issue" --type Bug \
  --description-file desc.md
```

With labels and assignee:

```bash
atlasctl jira issue create --project PROJ --summary "Update deps" --type Task \
  --labels "tech-debt,chore" --assignee 5b10ac8d82e05b22cc7d4ef5
```

Returns JSON with `key`, `id`, `url`, and `summary`.

## URL and site matching

When using a URL input, the URL host must match configured `site`.

Example mismatch error:
- URL host: `foo.atlassian.net`
- Config site: `bar.atlassian.net`

The command will fail fast to avoid calling the wrong tenant.

## Output shape

`confluence page get` returns JSON with:
- `page`: core page metadata and body HTML
- `comments`: tree of comments and replies
- `meta`: fetch timestamp and total comment count

Inline comments include:
- `inlineContext.textSelection`
- `inlineContext.markerRef`
- `inlineContext.resolved`

## Development

Run tests:

```bash
bun test
```

Optional bundle build:

```bash
bun run build
```

## Publish to npm

```bash
bun test
npm login
npm publish --access public
```

If `atlasctl` is already taken on npm, switch to a scoped package name (for example `@your-scope/atlasctl`) while keeping the bin name as `atlasctl`.
