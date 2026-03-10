# Chat Integration — Controlling Extensions via Chat

Extensions can integrate with PocketPaw's chat interface in two directions. The `host.open_chat` scope must be declared in [extension.json](manifest.md#available-scopes). See [api.md](api.md#sdk-runtime-token-scoped) for the chat API endpoints.

Extensions can integrate with PocketPaw's chat interface in two directions:

1. **Extension → Chat**: The extension opens the chat pane with pre-filled commands and context (via `sdk.host.openChat()`)
2. **Chat → Extension**: Slash commands in the chat handler directly read/write extension storage (via `CommandHandler` in `bus/commands.py`)

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  Extension UI (iframe)                                  │
│                                                         │
│  sdk.host.openChat({                                    │
│    text: "/todo ",                                      │
│    composer_assist: { ... }  ← quick actions, context   │
│  })                                                     │
│       │                                                 │
│       │ postMessage                                     │
└───────┼─────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│  PocketPaw Dashboard (parent window)                    │
│                                                         │
│  _handleExtensionOpenChat()                             │
│    → navigateToView("chat")                             │
│    → openComposerAssist(assist)  ← shows quick actions  │
│    → inputText = text            ← pre-fills composer   │
└─────────────────────────────────────────────────────────┘
        ↓ user sends message
┌─────────────────────────────────────────────────────────┐
│  CommandHandler (bus/commands.py)                        │
│                                                         │
│  /todo list  → _load_todos()  → format + respond        │
│  /todo add X → _load_todos()  → append + _save_todos()  │
│  /todo done N → modify + _save_todos()                  │
│                                                         │
│  Storage: get_extension_storage().get_item("todo", key) │
│           get_extension_storage().set_item("todo", key) │
└─────────────────────────────────────────────────────────┘
```

## Pattern 1: Extension → Chat (Frontend)

The extension triggers the chat pane from its UI using `sdk.host.openChat()`. This requires the `host.open_chat` scope.

### Basic: Pre-fill chat text

Requires the `host.open_chat` scope — see [manifest.md](manifest.md#available-scopes). For the SDK script, see [ui-stack.md](ui-stack.md#legacy-sdk-lightweight-alternative).

```javascript
// Simple — just put text in the composer
sdk.host.openChat("/todo add ");
```

### Advanced: Composer Assist (Quick Actions + Context)

The `composer_assist` payload creates a rich overlay in the chat composer with quick action buttons, examples, and contextual data:

```javascript
sdk.host.openChat({
  text: "/todo ",
  composer_assist: {
    source: "todo", // Extension ID
    icon: "list-todo", // Lucide icon
    title: "Todo Copilot", // Header text
    subtitle: "Manage your list from chat.",
    summary: "3 open · 1 done", // Status badge
    prompt_prefix: "/todo ", // Auto-prefixed to user input

    // Quick action buttons
    actions: [
      {
        key: "add",
        label: "Add a task",
        description: "Insert /todo add into chat",
        command: "/todo add ",
        behavior: "insert", // "insert" or "send"
      },
      {
        key: "list",
        label: "Show list",
        description: "Run /todo list right away",
        command: "/todo list",
        behavior: "send", // Sends immediately
      },
    ],

    // Example commands shown in the overlay
    examples: ["/todo add Buy milk", "/todo list", "/todo done 1"],

    // Snapshot data attached to the message for the AI
    context: {
      kind: "todo",
      source: "todo",
      open_todos: [{ id: "1", text: "Buy milk" }],
      done_todos: [],
      total_count: 1,
      open_count: 1,
      done_count: 0,
    },
  },
});
```

### Action Behaviors

| Behavior   | Effect                                                     |
| ---------- | ---------------------------------------------------------- |
| `"insert"` | Inserts the command text into the composer (user can edit) |
| `"send"`   | Immediately sends the command as a chat message            |

### Composer Assist Fields

| Field           | Type       | Description                                      |
| --------------- | ---------- | ------------------------------------------------ |
| `source`        | `string`   | Extension ID (for tracking)                      |
| `icon`          | `string`   | Lucide icon name for the overlay header          |
| `title`         | `string`   | Overlay title                                    |
| `subtitle`      | `string`   | Description text below the title                 |
| `summary`       | `string`   | Short status badge (e.g. "3 open · 1 done")      |
| `prompt_prefix` | `string`   | Auto-prefixed to user input                      |
| `actions`       | `Action[]` | Quick action buttons                             |
| `examples`      | `string[]` | Example commands shown in the overlay            |
| `context`       | `object`   | Data snapshot attached to the message for the AI |

## Pattern 2: Chat → Extension (Backend)

Slash commands in the `CommandHandler` class can directly read/write extension storage. This lets the AI (or user) control extensions via chat without the extension UI being open.

### How It Works

1. User types `/todo add Buy milk` in the chat
2. `CommandHandler._parse_command()` matches `/todo` as a known command
3. `_parse_todo_action("add Buy milk")` extracts the action and argument
4. `_cmd_todo()` loads data from extension storage, performs the action, saves, and responds
5. The response is a plain text `OutboundMessage` — displayed in chat

### Storage Bridge

The command handler uses the same storage API as the extension SDK:

```python
from pocketpaw.extensions.storage import get_extension_storage

# Read extension's data
storage = get_extension_storage()
exists, value = storage.get_item("todo", "todos")   # (extension_id, key)

# Write back
storage.set_item("todo", "todos", updated_todos)
```

This means **data is shared** between the extension UI and the chat commands — changes made via `/todo` are immediately visible in the extension's UI (and vice versa).

### Command Registry

All slash commands are registered in `COMMAND_REGISTRY`:

```python
COMMAND_REGISTRY: dict[str, str] = {
    "new": "Start a fresh conversation",
    "sessions": "List your conversation sessions",
    "todo": "Manage your todo list",
    # ... etc
}
```

Adapters (Telegram, Discord, Slack) import this registry to auto-register their platform-specific command menus.

### Adding a New Extension Command

To add chat control for a new extension:

1. **Define the command** in `COMMAND_REGISTRY` in `bus/commands.py`
2. **Add a dispatch entry** in `CommandHandler._dispatch()`
3. **Implement the handler** method (e.g. `_cmd_myext()`) that reads/writes storage
4. **Add the `host.open_chat` scope** to `extension.json` if the extension needs to open the chat pane
5. **(Optional)** Create a `composer_assist` payload in the extension UI for rich quick actions

### Example: Todo Extension

The Todo extension demonstrates the full pattern:

**`extension.json`** — declares `host.open_chat` scope:

```json
{
  "id": "todo",
  "scopes": ["storage.read", "storage.write", "host.open_chat"]
}
```

**Frontend (`app.js`)** — creates a snapshot and opens chat:

```javascript
summaryButton.addEventListener("click", () => {
  sdk.host.openChat(createAssistPayload());
});
```

**Backend (`commands.py`)** — handles `/todo` commands:

```python
def _cmd_todo(self, message, args):
    action, remainder = _parse_todo_action(args)
    todos = self._load_todos()  # reads from extension storage

    if action == "list":
        return self._build_todo_response(message, self._format_todo_list(todos))
    elif action == "add":
        todos.insert(0, {"id": f"todo-{uuid4().hex[:10]}", "text": remainder, "done": False})
        self._save_todos(todos)
        return self._build_todo_response(message, f"Added: {remainder}")
    # ... done, delete, update, etc.
```

## Required Scopes

| Scope            | Required For                                      |
| ---------------- | ------------------------------------------------- |
| `storage.read`   | Chat commands reading extension data              |
| `storage.write`  | Chat commands writing extension data              |
| `host.open_chat` | Extension UI opening the chat pane                |
| `chat.send`      | Extension sending messages to AI programmatically |
| `chat.stream`    | Extension streaming AI responses                  |
