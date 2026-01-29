# Min

Min is a fast, minimal browser that protects your privacy. It includes an interface designed to minimize distractions, and features such as:

- Full-text search for visited pages
- Ad and tracker blocking
- Automatic reader view
- Tasks (tab groups)
- Bookmark tagging
- Password manager integration
- Dark theme

Download Min from the [releases page](https://github.com/minbrowser/min/releases), or learn more on the [website](https://minbrowser.org/).

[![Downloads][DownloadsBadge]][DownloadsUrl]
[![Discord][DiscordBadge]][DiscordUrl]

Min is made possible by these sponsors:

| [<img src="https://avatars.githubusercontent.com/u/6592155?v=4" width="40">](https://github.com/blackgwe) | [<img src="https://avatars.githubusercontent.com/u/49724477?v=4" width="40">](https://github.com/rafel-ioli) |[<img src="https://avatars.githubusercontent.com/u/237596?v=4" width="40">](https://github.com/idoru) |     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |--------------------------------------------------------------------------------------------------------------- | --- |
| [@blackgwe](https://github.com/blackgwe)                                                                            | [@rafel-ioli](https://github.com/rafel-ioli)                                                                        |[@idoru](https://github.com/idoru)                                                                        ||

[Become a sponsor](https://github.com/sponsors/PalmerAL)

## Screenshots

<img alt="The search bar, showing information from DuckDuckGo" src="http://minbrowser.org/tour/img/searchbar_duckduckgo_answers.png" width="650"/>

<img alt="The Tasks Overlay" src="http://minbrowser.org/tour/img/tasks.png" width="650"/>

<img alt="Reader View" src="https://user-images.githubusercontent.com/10314059/53312382-67ca7d80-387a-11e9-9ccc-88ac592c9b1c.png" width="650"/>

## Installing

You can find prebuilt binaries for Min [here](https://github.com/minbrowser/min/releases). Alternatively, skip to the section below for instructions on how to build Min directly from source.

### Installation on Linux

- To install the .deb file, use `sudo dpkg -i /path/to/download`
- To install the RPM build, use `sudo rpm -i /path/to/download --ignoreos`
- On Arch Linux install from [AUR](https://aur.archlinux.org/packages/min-browser-bin).
- On Raspberry Pi, you can install Min from [Pi-Apps](https://github.com/Botspot/pi-apps).

## Getting Started

* The [wiki](https://github.com/minbrowser/min/wiki) provides an overview of the the features available in Min, a list of available keyboard shortcuts, and answers to some [frequently asked questions](https://github.com/minbrowser/min/wiki/FAQ).
* Min supports installing userscripts to extend its functionality. See the [userscript documentation](https://github.com/minbrowser/min/wiki/userscripts) for instructions on writing userscripts, as well as a collection of scripts written by the community.
* If you have questions about using Min, need help getting started with development, or want to talk about what we're working on, join our [Discord server](https://discord.gg/bRpqjJ4).

## Developing

If you want to develop Min:

- Install [Node](https://nodejs.org).
- Run `npm install` to install dependencies.
- Start Min in development mode by running `npm run start`.
- After you make changes, press `alt+ctrl+r` (or `opt+cmd+r` on Mac) to reload the browser UI.

### Local Agent Control API

Min exposes a local-only JSON API from the Electron main process for AI agents and automation.

Configuration:

- Port: `9333` by default. Override with the `MIN_AGENT_PORT` environment variable or set `"agentApiPort"` in `settings.json`.

Base URL: `http://127.0.0.1:9333` (localhost only).

Endpoints:

- `GET /health`
- `GET /openapi.json`
- `GET /docs` (Swagger UI)
- `GET /tabs`
- `GET /tabs/active`
- `POST /tabs/new` `{ "url": "https://example.com" }` (URL optional)
- `POST /tabs/:id/close`
- `POST /tabs/:id/select`
- `GET /tabs/:id/html`
- `GET /tabs/:id/text` (returns main content text plus links/buttons/inputs/forms)
- `GET /tabs/:id/snapshot`
- `GET /tabs/:id/accessibility`
- `GET /tabs/:id/axSnapshot` (accessibility snapshot with element refs)
- `GET /tabs/:id/elements`
- `GET /tabs/:id/console`
- `GET /tabs/:id/network`
- Elements include an `id` that can be used as `elementId` in click/type.
- `POST /tabs/:id/query` `{ "selector": "...", "limit": 50 }`
- `POST /tabs/:id/waitFor` `{ "selector": ".price" }` or `{ "text": "Checkout" }`
- `GET /tabs/:id/screenshot`
- `POST /tabs/:id/navigate` `{ "url": "https://example.com" }`
- `POST /tabs/:id/back`
- `POST /tabs/:id/click` `{ "selector": "a.login" }`, `{ "elementId": "e2" }`, or `{ "x": 10, "y": 20 }`
- `POST /tabs/:id/clickByText` `{ "text": "Buy Now" }`
- `POST /tabs/:id/type` `{ "selector": "input[name=q]", "text": "hello", "clear": true }` or `{ "elementId": "e5", "text": "hello" }`
- `POST /tabs/:id/pressKey` `{ "key": "Enter" }`
- `POST /tabs/:id/hover` `{ "selector": ".menu" }`
- `POST /tabs/:id/drag` `{ "fromSelector": ".thumb", "toSelector": ".target" }`
- `POST /tabs/:id/fillForm` `{ "fields": [ { "selector": "#email", "value": "me@example.com" } ] }`
- `POST /tabs/:id/selectOption` `{ "selector": "select#size", "label": "Large" }`
- `POST /tabs/:id/scroll` `{ "deltaY": 800 }` or `{ "x": 0, "y": 1200 }`
- `POST /tabs/:id/exec` `{ "script": "document.title" }`
- `POST /tabs/:id/evaluate` `{ "script": "document.title" }`
- `POST /tabs/:id/handleDialog` `{ "accept": true }`
- `POST /tabs/:id/resize` `{ "width": 1280, "height": 720 }`
- `WS /events` (optional) emits `tab-created`, `tab-closed`, `url-changed`

Example requests:

```sh
curl http://127.0.0.1:9333/health
curl http://127.0.0.1:9333/tabs
curl http://127.0.0.1:9333/tabs/active
curl -X POST http://127.0.0.1:9333/tabs/new \\
  -d '{"url":"https://example.com"}'
curl -X POST http://127.0.0.1:9333/tabs/123/navigate \\
  -d '{"url":"https://example.com"}'
curl -X POST http://127.0.0.1:9333/tabs/123/query \\
  -d '{"selector":"a"}'
curl http://127.0.0.1:9333/tabs/123/snapshot
curl -X POST http://127.0.0.1:9333/tabs/123/waitFor \\
  -d '{"text":"Checkout","timeout":8000}'
curl -X POST http://127.0.0.1:9333/tabs/123/clickByText \\
  -d '{"text":"Buy Now"}'
curl -X POST http://127.0.0.1:9333/tabs/123/pressKey \\
  -d '{"key":"Enter"}'
curl http://127.0.0.1:9333/tabs/123/console
```

Example agent flow:

1) `GET /tabs/active` to find the active tab id  
2) `GET /tabs/:id/snapshot` to understand the page  
3) `POST /tabs/:id/waitFor` to wait for a target element  
4) `POST /tabs/:id/clickByText` or `POST /tabs/:id/click` to act  
5) `GET /tabs/:id/elements` to discover fallback selectors and element ids

### MCP Server (Embedded)

Min also exposes an embedded MCP (Model Context Protocol) server for agent integrations.

Configuration:

- Port: `9344` by default. Override with the `MIN_MCP_PORT` environment variable or set `"mcpPort"` in `settings.json`.

Endpoints:

- `POST/GET http://127.0.0.1:9344/mcp` (Streamable HTTP transport)
- `GET http://127.0.0.1:9344/health`

Tools:

- `list_tabs`, `get_active_tab`
- `page_snapshot`, `page_accessibility`, `page_elements`, `page_text`, `page_html`
- `navigate`, `click_by_text`, `execute_script`, `wait_for`, `scroll`
- `screenshot`
- `browser_tabs`, `browser_navigate`, `browser_navigate_back`
- `browser_new_tab`
- `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate`
- `browser_click`, `browser_type`, `browser_press_key`, `browser_hover`, `browser_drag`
- `browser_fill_form`, `browser_select_option`, `browser_handle_dialog`
- `browser_wait_for`, `browser_resize`

Event stream:

Notifications are emitted for `navigation-started`, `navigation-completed`, `page-changed`, and `waitFor-resolved` as MCP notifications with method `notifications/page-event`.

### Building binaries

In order to build Min from source, follow the installation instructions above, then use one of the following commands to create binaries:

- `npm run buildWindows`
- `npm run buildMacIntel`
- `npm run buildMacArm`
- `npm run buildDebian`
- `npm run buildRaspi` (for 32-bit Raspberry Pi)
- `npm run buildLinuxArm64` (for 64-bit Raspberry Pi or other ARM Linux)
- `npm run buildRedhat`

Depending on the platform you are building for, you may need to install additional dependencies:

- If you are building a macOS package, you'll need to install Xcode and the associated command-line tools. You may also need to set your default SDK to macOS 11.0 or higher, which you can do by running `export SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX11.1.sdk`. The exact command will depend on where Xcode is installed and which SDK version you're using.
- To build on Windows, you'll need to install Visual Studio. Once it's installed, you may also need to run `npm config set msvs_version 2019` (or the appropriate version).

## Contributing to Min

Thanks for taking the time to contribute to Min!

### Getting Help

If you're experiencing a bug or have a suggestion for how to improve Min, please open a [new issue](https://github.com/minbrowser/min/issues/new/choose).

### Contributing Code

- Start by following the development instructions listed above.
- The wiki has an [overview of Min's architecture](https://github.com/minbrowser/min/wiki/Architecture).
- Min uses the [Standard](https://github.com/feross/standard) code style; [most editors](https://standardjs.com/#are-there-text-editor-plugins) have plugins available to auto-format your code.
- If you see something that's missing, or run into any problems, please open an issue!

### Contributing Translations

#### Adding a new language

- Find the language code that goes with your language from [this list](https://source.chromium.org/chromium/chromium/src/+/main:ui/base/l10n/l10n_util.cc;l=68-259) (line 68 - 259).
- In the `localization/languages` directory, create a new file, and name it "[your language code].json".
- Open your new file, and copy the contents of the <a href="https://github.com/minbrowser/min/blob/master/localization/languages/en-US.json">localization/languages/en-US.json</a> file into your new file.
- Change the "identifier" field in the new file to the language code from step 1.
- Inside the file, replace each English string in the right-hand column with the equivalent translation.
- (Optional) See your translations live by following the [development instructions](#installing) above. Min will display in the same language as your operating system, so make sure your computer is set to the same language that you're translating.
- That's it! Make a pull request with your changes.

#### Updating an existing language

- Find the language file for your language in the `localization/languages` directory.
- Look through the file for any items that have a value of "null", or that have a comment saying "missing translation".
- For each of these items, look for the item with the same name in the `en-US.json` file.
- Translate the value from the English file, replace "null" with your translation, and remove the "missing translation" comment.
- Make a pull request with the updated file.

[DiscordBadge]: https://img.shields.io/discord/764269005195968512.svg?label=Discord&logo=discord&logoColor=white
[DiscordUrl]: https://discord.gg/bRpqjJ4
[DownloadsBadge]: https://img.shields.io/github/downloads/minbrowser/min/total.svg
[DownloadsUrl]: https://github.com/minbrowser/min/releases
