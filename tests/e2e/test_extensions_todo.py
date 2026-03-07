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


def _open_todo_app(page: Page, dashboard_url: str):
    page.goto(dashboard_url)
    page.wait_for_load_state("networkidle")

    page.locator("header").get_by_role("button", name="Apps", exact=True).click()
    expect(page.get_by_text("Installed Apps")).to_be_visible()
    expect(page.get_by_text("Todo").first).to_be_visible()

    frame_locator = page.frame_locator("iframe[title='PocketPaw Extension']")
    expect(frame_locator.get_by_role("heading", name="Todo")).to_be_visible(timeout=10000)
    page.wait_for_timeout(1500)

    return frame_locator


def _send_chat_command(page: Page, command: str, expected_text: str):
    chat_input = page.get_by_label("Chat message input")
    chat_input.fill(command)
    chat_input.press("Enter")
    expect(page.locator(".messages").get_by_text(expected_text)).to_be_visible(timeout=10000)


def _send_chat_command_no_assert(page: Page, command: str):
    chat_input = page.get_by_label("Chat message input")
    chat_input.fill(command)
    chat_input.press("Enter")
    expect(page.locator(".messages").get_by_text(command, exact=True)).to_be_visible(timeout=10000)


def _wait_for_todo_storage(
    todo_path: Path, expected: list[tuple[str, bool]], timeout: float = 10.0
):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if todo_path.exists():
            data = json.loads(todo_path.read_text(encoding="utf-8"))
            todos = data.get("todos", [])
        else:
            todos = []

        normalized = [
            (str(item.get("text") or ""), bool(item.get("done")))
            for item in todos
            if isinstance(item, dict)
        ]
        if normalized == expected:
            return
        time.sleep(0.2)

    raise AssertionError(f"Timed out waiting for todo storage state: {expected!r}")


class TestTodoExtension:
    def test_slash_menu_supports_direct_todo_entry(
        self,
        page: Page,
        dashboard_url: str,
    ):
        page.goto(dashboard_url)
        page.wait_for_load_state("networkidle")

        chat_input = page.get_by_label("Chat message input")
        chat_input.fill("/to")

        expect(page.get_by_text("Slash Commands")).to_be_visible()
        expect(page.locator("button").filter(has_text="/todo").first).to_be_visible()

        chat_input.press("Enter")

        expect(chat_input).to_have_value(re.compile(r"^/todo\s*$"))
        expect(page.get_by_text("Todo Copilot")).to_be_visible()
        expect(page.get_by_text("Direct CRUD in chat")).to_be_visible()
        expect(page.get_by_role("button", name="Add a task")).to_be_visible()
        expect(page.get_by_role("button", name="Show list")).to_be_visible()
        expect(page.get_by_text("/todo add Buy milk")).to_be_visible()
        expect(page.get_by_text("Slash Commands")).to_have_count(0)

        chat_input.fill("")
        expect(page.get_by_text("Todo Copilot")).to_have_count(0)
        expect(page.get_by_text("Direct CRUD in chat")).to_have_count(0)

    def test_todo_chat_crud_syncs_back_to_app(
        self,
        page: Page,
        dashboard_url: str,
        isolated_todo_storage: Path,
    ):
        frame = _open_todo_app(page, dashboard_url)
        expect(frame.get_by_text("No tasks yet.")).to_be_visible()

        frame.get_by_role("button", name="Open In Chat", exact=True).click()

        chat_input = page.get_by_label("Chat message input")
        expect(chat_input).to_be_visible()
        expect(chat_input).to_have_value(re.compile(r"^/todo\s*$"))
        expect(page.get_by_text("Todo Copilot")).to_be_visible()
        expect(page.get_by_text("No tasks yet").first).to_be_visible()
        expect(page.get_by_role("button", name="Add a task")).to_be_visible()
        expect(chat_input).to_be_focused()

        page.get_by_role("button", name="Add a task").click()
        expect(chat_input).to_have_value(re.compile(r"^/todo add\s*$"))

        _send_chat_command_no_assert(page, "/todo add E2E chat task")
        _wait_for_todo_storage(isolated_todo_storage, [("E2E chat task", False)])

        _send_chat_command_no_assert(page, "/todo list")
        _wait_for_todo_storage(isolated_todo_storage, [("E2E chat task", False)])

        _send_chat_command_no_assert(page, "/todo update 1 E2E updated task")
        _wait_for_todo_storage(isolated_todo_storage, [("E2E updated task", False)])

        _send_chat_command_no_assert(page, "/todo done 1")
        _wait_for_todo_storage(isolated_todo_storage, [("E2E updated task", True)])

        _send_chat_command_no_assert(page, "/todo reopen 1")
        _wait_for_todo_storage(isolated_todo_storage, [("E2E updated task", False)])

        _send_chat_command_no_assert(page, "/todo delete 1")
        _wait_for_todo_storage(isolated_todo_storage, [])

        page.locator("header").get_by_role("button", name="Apps", exact=True).click()
        expect(page.get_by_text("Installed Apps")).to_be_visible()

        frame = page.frame_locator("iframe[title='PocketPaw Extension']")
        expect(frame.get_by_text("No tasks yet.")).to_be_visible(timeout=10000)
        expect(frame.get_by_text("E2E updated task")).to_have_count(0)
