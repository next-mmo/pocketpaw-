"""
E2E tests for the Todo extension.

Tests the /todo slash-command flow in the dashboard chat and verifies
that CRUD operations correctly mutate the shared extension storage file.
"""

import json
import re
import time
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

from pocketpaw.config import get_config_dir


@pytest.fixture
def isolated_todo_storage():
    """Preserve the user's Todo extension storage while the E2E test runs."""
    todo_path = get_config_dir() / "extension-data" / "todo.json"
    todo_path.parent.mkdir(parents=True, exist_ok=True)

    original = todo_path.read_bytes() if todo_path.exists() else None
    if todo_path.exists():
        todo_path.unlink()

    yield todo_path

    if original is None:
        if todo_path.exists():
            todo_path.unlink()
    else:
        todo_path.write_bytes(original)


def _navigate_to_chat(page: Page, dashboard_url: str):
    """Navigate to the dashboard and ensure chat view is visible."""
    page.goto(dashboard_url)
    page.wait_for_load_state("networkidle")
    # The default view is 'chat', verify the input is available
    expect(page.get_by_label("Chat message input")).to_be_visible(timeout=10000)


def _send_chat_command(page: Page, command: str):
    """Type a command into the chat input and press Enter."""
    chat_input = page.get_by_label("Chat message input")
    chat_input.fill(command)
    chat_input.press("Enter")
    # Wait for the user message bubble to appear
    page.wait_for_timeout(500)


def _wait_for_todo_storage(
    todo_path: Path,
    expected: list[tuple[str, bool]],
    timeout: float = 10.0,
):
    """Poll the extension storage file until it matches the expected state."""
    deadline = time.time() + timeout
    last_normalized = None
    while time.time() < deadline:
        if todo_path.exists():
            try:
                data = json.loads(todo_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                time.sleep(0.2)
                continue
            todos = data.get("todos", [])
        else:
            todos = []

        last_normalized = [
            (str(item.get("text") or ""), bool(item.get("done")))
            for item in todos
            if isinstance(item, dict)
        ]
        if last_normalized == expected:
            return
        time.sleep(0.2)

    raise AssertionError(
        f"Timed out waiting for todo storage.\n"
        f"  Expected: {expected!r}\n"
        f"  Got:      {last_normalized!r}"
    )


class TestTodoExtension:
    """E2E tests for the Todo extension's chat integration."""

    def test_slash_menu_supports_direct_todo_entry(
        self,
        page: Page,
        dashboard_url: str,
    ):
        """Typing /to should show the slash-command picker with a /todo entry.

        Selecting /todo should insert it into the input field and open the
        'Todo Copilot' composer-assist panel with action buttons and examples.
        """
        _navigate_to_chat(page, dashboard_url)

        chat_input = page.get_by_label("Chat message input")
        chat_input.fill("/to")

        # Slash picker should open and contain /todo
        expect(page.get_by_text("Slash Commands")).to_be_visible()
        expect(
            page.locator("button").filter(has_text="/todo").first
        ).to_be_visible()

        # Select /todo via Enter
        chat_input.press("Enter")

        # Input should now contain "/todo " (with trailing space)
        expect(chat_input).to_have_value(re.compile(r"^/todo\s*$"))

        # The "Todo Copilot" composer-assist panel should be visible
        expect(page.get_by_text("Todo Copilot")).to_be_visible(timeout=3000)
        expect(page.get_by_text("Direct CRUD in chat")).to_be_visible()
        expect(
            page.get_by_role("button", name="Add a task")
        ).to_be_visible()
        expect(
            page.get_by_role("button", name="Show list")
        ).to_be_visible()
        expect(page.get_by_text("/todo add Buy milk")).to_be_visible()

        # Slash picker should be closed
        expect(page.get_by_text("Slash Commands")).to_have_count(0)

        # Clearing input should dismiss the composer-assist
        chat_input.fill("")
        page.wait_for_timeout(300)
        expect(page.get_by_text("Todo Copilot")).to_have_count(0)

    def test_todo_chat_crud_syncs_back_to_app(
        self,
        page: Page,
        dashboard_url: str,
        isolated_todo_storage: Path,
    ):
        """CRUD via /todo chat commands should persist to extension storage.

        This tests addition, listing, updating, marking done/reopen, and
        deletion — all verifiable via the shared JSON storage file.
        """
        _navigate_to_chat(page, dashboard_url)

        # ADD — create a todo item
        _send_chat_command(page, "/todo add E2E chat task")
        _wait_for_todo_storage(
            isolated_todo_storage, [("E2E chat task", False)]
        )

        # LIST — verify listing works (chat should respond)
        _send_chat_command(page, "/todo list")
        # The storage should still be the same after list
        _wait_for_todo_storage(
            isolated_todo_storage, [("E2E chat task", False)]
        )

        # UPDATE — rename the task
        _send_chat_command(page, "/todo update 1 E2E updated task")
        _wait_for_todo_storage(
            isolated_todo_storage, [("E2E updated task", False)]
        )

        # DONE — mark it complete
        _send_chat_command(page, "/todo done 1")
        _wait_for_todo_storage(
            isolated_todo_storage, [("E2E updated task", True)]
        )

        # REOPEN — mark it incomplete again
        _send_chat_command(page, "/todo reopen 1")
        _wait_for_todo_storage(
            isolated_todo_storage, [("E2E updated task", False)]
        )

        # DELETE — remove it
        _send_chat_command(page, "/todo delete 1")
        # After delete prompt, confirm
        page.wait_for_timeout(500)
        _send_chat_command(page, "/todo confirm")
        _wait_for_todo_storage(isolated_todo_storage, [])
