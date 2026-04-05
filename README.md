# telec

Scriptable Telegram CLI on top of TDLib.

## Install

### Homebrew

```sh
brew tap buftio/tap
brew install telec
```

### npm

```sh
npm install -g telec
```

or:

```sh
npx telec --help
```

### Runtime dependency

Install TDLib first:

```sh
brew install tdlib
```

Supported prebuilt targets today:

- macOS arm64
- Linux x64

## Development

1. Install dependencies:

```sh
bun install
```

2. Run the CLI:

```sh
bun run telec --help
```

## First Launch

`telec` does not ship Telegram app credentials.

On the first command that needs Telegram access, the app will:

1. Prompt you for your own `api_id` and `api_hash`
2. Store them in your macOS Keychain
3. Generate a TDLib database encryption key
4. Store that encryption key in your macOS Keychain too

Create your Telegram app credentials here:

- [my.telegram.org/apps](https://my.telegram.org/apps)

After that, the CLI reuses the stored values automatically.

Keychain service names use the `telec.<env>` namespace.

## Development Overrides

For local development or CI, you can still provide values through environment variables or a local `.env` file:

```dotenv
TELEGRAM_APP_API_ID=12345
TELEGRAM_APP_API_HASH=your_hash
TDLIB_JSON_PATH=/opt/homebrew/opt/tdlib/lib/libtdjson.dylib
```

If `TDLIB_DATABASE_ENCRYPTION_KEY` is not provided, `telec` will create one and store it in Keychain on first interactive run.

- TDLib session data is stored under `~/Library/Application Support/telec/<env>/`.

## Build

```sh
bun run build
```

Release binaries:

```sh
bun run build:release
```

Package release assets and render the Homebrew formula:

```sh
bun run release:prepare
```

Validate the generated Homebrew formula locally:

```sh
bun run validate:homebrew
```

The compiled binaries still require TDLib to be installed, or `TDLIB_JSON_PATH` to point at `libtdjson`.

## File Attachments

Send a local file to a chat:

```sh
bun run telec send-file -c saved --file-path /absolute/path/to/file.pdf --caption "optional"
```

Download an attachment from a message to a chosen path:

```sh
bun run telec download -c saved --message-id 123456 --output-path /absolute/path/to/file.pdf
```
