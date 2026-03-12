import { useState, useEffect, useCallback } from "react";
import { Button, Input, Tag } from "antd";
import { sdk } from "../sdk";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>(["Initialized todo module"]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    const data = await sdk.storage.get("todos");
    const list = data || [];
    setTodos(list);
    addLog(`Loaded ${list.length} todos from sdk.storage`);
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const persist = async (list: Todo[]) => {
    await sdk.storage.set("todos", list);
    setTodos(list);
    addLog(`Persisted ${list.length} todos`);
  };

  const addTodo = async () => {
    const text = input.trim();
    if (!text) return;
    const newTodo: Todo = { id: `todo-${Date.now()}`, text, done: false };
    await persist([newTodo, ...todos]);
    setInput("");
    addLog(`Added: "${text}"`);
  };

  const toggle = async (id: string) => {
    const updated = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    await persist(updated);
  };

  const remove = async (id: string) => {
    await persist(todos.filter((t) => t.id !== id));
    addLog(`Removed todo ${id}`);
  };

  const setReminder = async (todo: Todo) => {
    const time = prompt(`When to remind? (e.g. "in 30 minutes", "at 3pm")`);
    if (!time) return;
    try {
      const result = await sdk.reminders.create(`${time} to ${todo.text}`);
      addLog(`✅ Reminder set: ${result.time_remaining || "ok"}`);
    } catch (err: any) {
      addLog(`❌ Reminder failed: ${err.message}`);
    }
  };

  const askAI = () => {
    const open = todos.filter((t) => !t.done);
    const done = todos.filter((t) => t.done);
    sdk.host.openChat({
      text: `/todo list`,
      composer_assist: {
        source: "todo",
        icon: "list-todo",
        title: "Todo Copilot",
        summary: `${open.length} open • ${done.length} done`,
        context: { open_todos: open, done_todos: done },
      },
    });
    addLog("Opened chat with Todo context");
  };

  return (
    <>
      <div className="page-header">
        <h2>📝 Todos — <code>sdk.storage</code></h2>
        <p>CRUD with scoped key-value storage. Demonstrates <code>storage.read</code>, <code>storage.write</code>, <code>reminders.write</code>, and <code>host.open_chat</code>.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="What needs to be done?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={addTodo}
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={addTodo}>Add</Button>
        <Button onClick={askAI}>💬 Ask AI</Button>
      </div>

      {todos.length === 0 ? (
        <p style={{ color: "#555", padding: 20, textAlign: "center" }}>No tasks yet — add one above!</p>
      ) : (
        <ul className="todo-list">
          {todos.map((t) => (
            <li key={t.id} className={`todo-item ${t.done ? "done" : ""}`}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
              <span className="todo-text">{t.text}</span>
              <div className="todo-actions">
                {!t.done && (
                  <Button size="small" onClick={() => setReminder(t)}>⏰</Button>
                )}
                <Button size="small" danger onClick={() => remove(t.id)}>✕</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <Tag color="blue">{todos.filter((t) => !t.done).length} open</Tag>
        <Tag color="green">{todos.filter((t) => t.done).length} done</Tag>
      </div>

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((line, i) => (
          <div key={i} className={`log-line ${line.includes("✅") ? "success" : line.includes("❌") ? "error" : "info"}`}>
            {line}
          </div>
        ))}
      </div>
    </>
  );
}
