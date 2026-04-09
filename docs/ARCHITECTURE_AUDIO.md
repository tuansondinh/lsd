# LSD Architecture — Audio Overview Source

## What is LSD?

LSD stands for "Looks Sort of Done" — it's an AI coding agent that lives in your terminal. You install it globally with npm, type `lsd` in any project folder, and you get a full AI coding assistant that can read your files, write code, run commands, browse the web, take screenshots, and even remember things about you between sessions.

Under the hood, LSD is actually two things layered on top of each other. The bottom layer is a core coding agent engine called pi, which handles all the heavy lifting — talking to AI models, rendering the terminal interface, managing conversations, and executing tools. The top layer is the LSD brand layer, which wraps that core engine, adds extensions, configures the experience, and ships everything as a single npm package. So when you're working on the LSD codebase, you're mostly working on that top layer in the `src/` folder, while the core engine lives in a `packages/` directory that you treat almost like a third-party dependency.

## How it starts up

When you type `lsd` in your terminal, the first file that runs is called `loader.js`. This is a smart bootstrapper that does a few critical things before the main application even loads. First, it checks that you have Node.js version 22 or higher and that git is installed — if either is missing, it gives you a clear error message and exits immediately rather than crashing mysteriously later. Then it sets up a bunch of environment variables that tell the system where everything lives. The most important one is a path to your LSD home directory, which defaults to a hidden folder called `.lsd` inside your home directory. That's where all your API keys, conversation history, extensions, and memory files are stored.

The loader also does something clever with extensions. It scans a folder called `resources/extensions` inside the LSD package, discovers every extension that exists there, and serializes their file paths into an environment variable. This front-loads the work so that later, when the main agent needs those extensions, it doesn't have to scan the filesystem again. Finally, the loader dynamically imports the main `cli.js` file and hands control over to it.

The CLI file is where all the routing happens. It parses your command-line arguments and figures out what mode to run in. If you just typed `lsd` with no arguments in a terminal, you get the full interactive experience. If you typed `lsd --print "write me a function"`, you get a single-shot response with no interface. If you typed `lsd auto`, you get headless mode, which is designed for automation and CI/CD pipelines. There are also special subcommands like `lsd sessions` to browse your conversation history, `lsd worktree` to manage isolated git branches, and `lsd config` to re-run the setup wizard.

For the normal interactive startup, the CLI initializes several key components. It creates an auth storage object that reads your API keys from a file called `auth.json`. It creates a model registry that looks at which API keys you have and figures out which AI models are available to you. It creates a settings manager that reads your preferences from a `settings.json` file. It syncs all the bundled extensions from inside the npm package into your `.lsd` home directory, which is how updates get delivered to you — every time LSD starts, it checks if the files in your home directory match the current version, and if not, it copies over the new ones. Then it loads all the extensions, creates the agent session, and finally hands control to the interactive mode, which takes over your terminal and starts the familiar LSD interface.

## The extension system

Extensions are the most important concept to understand in LSD, because they're how almost every feature is implemented. An extension is just a TypeScript file that exports a single function. That function receives an API object — called `pi` — that gives it access to everything in the system. With that API, an extension can listen to lifecycle events, register slash commands that appear in the interface, and register new tools that the AI model can call during a conversation.

The lifecycle events are what make extensions powerful. There's a `session_start` event that fires when a new conversation begins. There's a `before_agent_start` event that fires just before the AI model is called — and crucially, extensions can return a modified system prompt from this event, which is how the memory extension injects everything the agent remembers about you. There's a `turn_end` event after each response, a `tool_call` event that fires before any tool is executed (and extensions can block that tool call if needed), and a `session_shutdown` event when you exit.

Extensions are loaded through a system called jiti, which is a runtime TypeScript compiler. This means extensions can be written in TypeScript and loaded directly without any build step — LSD just compiles them on the fly the first time they run. Extensions also go through a registry system where each extension can have a manifest file describing whether it's a core extension that can never be disabled, a bundled extension that ships with LSD, or a community extension. The registry stores which extensions you've enabled or disabled, and LSD filters the loaded extensions accordingly.

## The memory system

One of the most distinctive features of LSD is its persistent memory. The memory system is itself an extension, and it gives the agent the ability to remember things about you and your projects across completely separate conversations.

Memory files live inside your `.lsd` home directory, organized by project. For each project you work in, there's a memory directory that contains individual Markdown files — one file per memory — plus a central index file called `MEMORY.md`. Every time a new conversation starts, the memory extension reads that index file and injects its contents into the AI's system prompt, so the agent starts the conversation already knowing your preferences, your project's architecture decisions, and any feedback you've given in the past.

There are four types of memories: user memories for your personal preferences and habits, feedback memories for corrections or instructions you've given the agent about how to behave, project memories for architectural decisions and codebase conventions, and reference memories for facts, links, or documentation you want the agent to be able to recall.

The memory system also has an auto-extract feature that runs in the background when you close a conversation. It spawns a separate background process that reviews the conversation transcript and automatically extracts new memories from it, so you don't have to manually tell the agent to remember things. There's also a dream feature — named after the way humans consolidate memories during sleep — that periodically runs a background consolidation pass to review, prune, and reorganize the memory files as they grow over time.

## How the AI conversation actually works

When you type a message and press enter, here's what happens inside the system. The interactive mode takes your text and passes it to the agent loop. The agent loop first fires the `before_agent_start` event so extensions can modify the system prompt. Then it sends your message along with the full conversation history and the system prompt to the AI model, using an abstraction layer called `pi-ai` that supports Anthropic Claude, OpenAI, Google Gemini, AWS Bedrock, Mistral, and Vertex AI through a unified interface.

The AI model streams back its response in chunks. If the model decides it needs to use a tool — like reading a file, running a bash command, or searching the web — it emits a tool-use block in its response. The agent loop intercepts that, fires the `tool_call` event so extensions can inspect or block it, and then executes the tool. The result goes back to the model, and the model continues streaming. This tool-call loop can repeat many times in a single turn before the model gives its final text response. Everything streams in real time to your terminal through the TUI renderer.

## Headless and automation mode

For use in scripts, CI/CD pipelines, or automated workflows, LSD has a headless mode. The key insight is that headless mode uses a two-process architecture. The headless orchestrator is the parent process — it manages the overall workflow, handles timeouts, and formats output for machines. It spawns a child process running in RPC mode, which is LSD without any terminal interface, just a JSON-RPC server listening on standard input and standard output.

The orchestrator sends prompts to the child over this RPC connection, and the child sends back a stream of events — things like "tool execution started", "text chunk received", "cost update", and "session complete". The orchestrator can forward these as JSON lines to standard output for machine consumption, or format them as human-readable progress messages to standard error. When the child asks a question that normally requires user input, the orchestrator automatically answers it using sensible defaults, so the whole process can run completely unattended. The exit code tells the caller whether the task succeeded, failed, was blocked waiting for human input, or timed out.

## The worktree system

Finally, LSD has a worktree feature that lets you run the agent on an isolated copy of your codebase without touching your main working branch. When you run `lsd -w`, it creates a new git worktree in a subdirectory of your project's `.lsd` folder, checks out a fresh branch, and re-launches LSD inside that isolated environment. The agent can make experimental changes, run tests, and iterate freely without any risk to your main branch. When you're happy with the result, you run `lsd worktree merge` to merge the branch back, and the worktree is cleaned up automatically.

## Putting it all together

So the complete picture is this: LSD is a terminal coding agent built by layering a brand and extension system on top of a vendored core engine. The core handles the AI communication, the terminal interface, and the conversation persistence. The LSD layer adds persistent memory, dozens of bundled extensions for things like browser automation, web search, and remote notifications, a clean configuration system, and the worktree isolation feature. Extensions are the primary extension point — they're TypeScript files that hook into lifecycle events, register commands, and add tools — and they're loaded at runtime without any build step. The whole thing is designed to work interactively in your terminal, in fully automated headless pipelines, and as an MCP server that other AI tools can connect to.
