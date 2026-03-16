"""Test the Pinokio adapter using the whisper-webui source files."""

import json
import tempfile
from pathlib import Path

import pytest


# ── Fixtures: simulated Pinokio repo files ──

_PINOKIO_JS = """\
const path = require('path')
module.exports = {
  version: "3.7",
  title: "Whisper-WebUI",
  description: "A Web UI for easy subtitle using whisper model.",
  icon: "icon.png",
  menu: async (kernel, info) => {
    let installed = info.exists("app/env")
    if (installed) {
      return [{ default: true, icon: "fa-solid fa-rocket", text: "Open Web UI", href: "start.js" }]
    } else {
      return [{ default: true, icon: "fa-solid fa-plug", text: "Install", href: "install.js" }]
    }
  }
}
"""

_INSTALL_JS = """\
module.exports = {
  requires: {
    bundle: "ai",
  },
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "git clone https://github.com/jhj0517/Whisper-WebUI app",
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        venv: "env",
        path: "app",
        message: [
          "uv pip install -r requirements.txt",
        ]
      }
    },
    {
      method: "script.start",
      params: {
        uri: "torch.js",
        params: {
          venv: "env",
          path: "app",
        }
      }
    }
  ]
}
"""

_START_JS = """\
module.exports = {
  requires: {
    bundle: "ai",
  },
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        venv: "env",
        env: { },
        path: "app",
        message: [
          "python app.py --inbrowser False",
        ],
        on: [{
          "event": "/http:\\\\/\\\\/\\\\S+/",
          "done": true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        url: "{{input.event[0]}}"
      }
    }
  ]
}
"""

_TORCH_JS = """\
module.exports = {
  run: [
    {
      "when": "{{platform === 'win32' && gpu === 'nvidia'}}",
      "method": "shell.run",
      "params": {
        "venv": "{{args && args.venv ? args.venv : null}}",
        "path": "{{args && args.path ? args.path : '.'}}",
        "message": "uv pip install torch==2.7.0 --index-url https://download.pytorch.org/whl/cu128"
      },
      "next": null
    }
  ]
}
"""


@pytest.fixture
def pinokio_dir(tmp_path: Path) -> Path:
    """Create a temporary Pinokio-format project directory."""
    (tmp_path / "pinokio.js").write_text(_PINOKIO_JS)
    (tmp_path / "install.js").write_text(_INSTALL_JS)
    (tmp_path / "start.js").write_text(_START_JS)
    (tmp_path / "torch.js").write_text(_TORCH_JS)
    (tmp_path / "icon.png").write_bytes(b"fake-icon")
    (tmp_path / "requirements.txt").write_text("faster-whisper==1.1.1\n")
    return tmp_path


class TestPinokioDetection:
    def test_is_pinokio_project(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import is_pinokio_project

        assert is_pinokio_project(pinokio_dir) is True

    def test_not_pinokio_project(self, tmp_path: Path):
        from pocketpaw.extensions.pinokio_adapter import is_pinokio_project

        assert is_pinokio_project(tmp_path) is False


class TestMetadataExtraction:
    def test_extracts_title(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["name"] == "Whisper-WebUI"

    def test_extracts_description(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert "subtitle" in manifest["description"].lower()

    def test_extracts_icon(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["icon"] == "icon.png"

    def test_generates_valid_id(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        import re

        assert re.match(r"^[a-z0-9][a-z0-9_-]{1,63}$", manifest["id"])

    def test_type_is_plugin(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["type"] == "plugin"

    def test_autostart_is_false(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["autostart"] is False


class TestInstallSteps:
    def test_has_git_clone_step(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        steps = manifest["install"]["steps"]
        git_steps = [s for s in steps if s.get("run", "").startswith("git clone")]
        assert len(git_steps) == 1
        assert "Whisper-WebUI" in git_steps[0]["run"]

    def test_has_pip_step(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        steps = manifest["install"]["steps"]
        pip_steps = [s for s in steps if "pip" in s]
        assert len(pip_steps) >= 1
        assert pip_steps[0]["pip"] == "requirements.txt"

    def test_has_torch_step(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        steps = manifest["install"]["steps"]
        torch_steps = [s for s in steps if s.get("torch")]
        assert len(torch_steps) == 1


class TestStartConfig:
    def test_has_start_config(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert "start" in manifest

    def test_daemon_is_true(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["start"]["daemon"] is True

    def test_command_is_correct(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert "python app.py" in manifest["start"]["command"]
        assert "--inbrowser False" in manifest["start"]["command"]

    def test_has_ready_pattern(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["start"].get("ready_pattern") is not None
        assert "http" in manifest["start"]["ready_pattern"]

    def test_start_path_is_app(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert manifest["start"].get("path") == "app"


class TestSandboxConfig:
    def test_has_sandbox(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        assert "sandbox" in manifest
        assert manifest["sandbox"]["python"] == "3.11"

    def test_venv_path(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import convert_pinokio_to_manifest

        manifest = convert_pinokio_to_manifest(pinokio_dir)
        # venv should be inside the app subdirectory
        assert "app" in manifest["sandbox"]["venv"]
        assert "env" in manifest["sandbox"]["venv"]


class TestSynthesizeFile:
    def test_writes_extension_json(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import synthesize_extension_json

        path = synthesize_extension_json(pinokio_dir)
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["name"] == "Whisper-WebUI"
        assert data["type"] == "plugin"

    def test_raises_if_exists(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import synthesize_extension_json

        synthesize_extension_json(pinokio_dir)
        with pytest.raises(FileExistsError):
            synthesize_extension_json(pinokio_dir, overwrite=False)

    def test_overwrite_flag(self, pinokio_dir: Path):
        from pocketpaw.extensions.pinokio_adapter import synthesize_extension_json

        synthesize_extension_json(pinokio_dir)
        # Should not raise
        path = synthesize_extension_json(pinokio_dir, overwrite=True)
        assert path.exists()


class TestSlugify:
    def test_basic(self):
        from pocketpaw.extensions.pinokio_adapter import _slugify

        assert _slugify("Whisper-WebUI") == "whisper-webui"

    def test_spaces(self):
        from pocketpaw.extensions.pinokio_adapter import _slugify

        assert _slugify("My Cool App") == "my-cool-app"

    def test_special_chars(self):
        from pocketpaw.extensions.pinokio_adapter import _slugify

        result = _slugify("App (v2.0)")
        assert result[0].isalnum()
        assert all(c in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in result)
