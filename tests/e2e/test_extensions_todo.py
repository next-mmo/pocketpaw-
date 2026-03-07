import re
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


class TestTodoExtension:
    def test_todo_crud_and_chat_handoff(
        self,
        page: Page,
        dashboard_url: str,
        isolated_todo_storage: Path,
    ):
        frame = _open_todo_app(page, dashboard_url)

        todo_input = frame.get_by_placeholder("Add a task...")
        add_button = frame.get_by_role("button", name="Add", exact=True)

        tasks = {
            "done": "E2E Buy milk",
            "open": "E2E Call dentist",
            "delete": "E2E Fix bug #42",
        }

        for task in tasks.values():
            todo_input.fill(task)
            add_button.click()
            expect(frame.get_by_text(task)).to_be_visible()

        done_item = frame.locator("li.todo-item").filter(has_text=tasks["done"])
        done_item.locator('input[type="checkbox"]').check()
        expect(done_item.locator('input[type="checkbox"]')).to_be_checked()

        delete_item = frame.locator("li.todo-item").filter(has_text=tasks["delete"])
        delete_item.get_by_role("button", name="Remove", exact=True).click()
        expect(frame.get_by_text(tasks["delete"])).to_have_count(0)

        frame.get_by_role("button", name="Open In Chat", exact=True).click()

        chat_input = page.get_by_label("Chat message input")
        expect(chat_input).to_be_visible()
        expect(chat_input).to_have_value(re.compile(r"^/todo\s*$"))
        expect(page.get_by_text("Todo Copilot")).to_be_visible()
        expect(page.get_by_text("1 open • 1 done")).to_be_visible()
        expect(page.get_by_role("button", name="What should I do next?")).to_be_visible()
        expect(chat_input).to_be_focused()

        page.get_by_role("button", name="What should I do next?").click()
        expect(
            page.locator(".messages").get_by_text(
                "/todo what should I do next based on my current tasks?",
                exact=True,
            )
        ).to_be_visible()
        expect(page.get_by_text("Todo Copilot")).to_have_count(0)
