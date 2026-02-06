# atlasctl

A Bun-based CLI for Atlassian workflows.

Initial scope:
- Get a Confluence page
- Include all comments and nested replies
- Include inline comment metadata when available

## Requirements

- Bun 1.3+

## Install

### Local development

```bash
bun install
```

Run directly:

```bash
bun run src/cli.ts --help
```

### Global (from npm)

```bash
npm install -g atlasctl
```

The CLI entrypoint uses Bun (`#!/usr/bin/env bun`), so Bun must be installed on the target machine.

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
