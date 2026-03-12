/**
 * PocketPaw JavaScript SDK — shared helper for all frontend extensions.
 *
 * Canonical source: src/pocketpaw/frontend/js/extensions-sdk.js
 * Served at: /static/js/extensions-sdk.js
 *
 * This file is a reference copy kept alongside python_sdk.py so both SDKs
 * are co-located in the extensions/ directory for discoverability.
 *
 * ── Usage from any extension's index.html ────────────────────────────────
 *
 *   <script src="/static/js/extensions-sdk.js"></script>
 *   <script>
 *     const sdk = window.PocketPawExtensionSDK;
 *     const ctx = await sdk.ready();
 *   </script>
 *
 * ── Available sub-clients (mirrors python_sdk.py 1:1) ───────────────────
 *
 *   sdk.storage       .list()  .get(key)  .set(key, value)  .delete(key)
 *   sdk.chat          .send(content, options)  .stream(content, options, handlers)
 *   sdk.sessions      .list(limit)
 *   sdk.reminders     .list()  .create(message)  .delete(id)
 *   sdk.intentions    .list()  .create(data)  .update(id, data)  .delete(id)
 *                     .toggle(id)  .run(id)
 *   sdk.memory        .list(limit)  .delete(id)
 *   sdk.skills        .list()
 *   sdk.health        .status()  .version()
 *   sdk.events        .subscribe(handlers)               → { abort() }
 *   sdk.notifications .send(title, message, level, dur)  .broadcast(event, data)
 *   sdk.commands      .list()  .register(data)  .unregister(name)
 *   sdk.tools         .list()  .register(data)  .unregister(name)
 *   sdk.settings      .get()  .update(data)
 *   sdk.config        .get()  .set(config)
 *   sdk.host          .navigate(route)  .openChat(text)
 *
 * ── Scopes ──────────────────────────────────────────────────────────────
 *
 *   storage.read, storage.write, chat.send, chat.stream, sessions.read,
 *   reminders.read, reminders.write, intentions.read, intentions.write,
 *   memory.read, memory.write, skills.read, health.read, events.read,
 *   notifications.write, commands.read, commands.write, tools.read,
 *   tools.write, settings.read, settings.write, host.navigate, host.open_chat
 *
 * ── For Python plugins ──────────────────────────────────────────────────
 *
 *   See python_sdk.py in this same directory for the server-side equivalent.
 *
 * ────────────────────────────────────────────────────────────────────────
 *
 * NOTE: This file is NOT executed directly. It is a documentation reference.
 * The actual SDK is served from /static/js/extensions-sdk.js by the
 * PocketPaw dashboard's static file server.
 *
 * To modify the SDK, edit:
 *   src/pocketpaw/frontend/js/extensions-sdk.js
 */
