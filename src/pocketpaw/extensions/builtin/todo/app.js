const STORAGE_KEY = 'todos';

const listEl = document.getElementById('todo-list');
const emptyEl = document.getElementById('empty-state');
const formEl = document.getElementById('todo-form');
const inputEl = document.getElementById('todo-input');
const summaryButton = document.getElementById('chat-summary');

let todos = [];

function createSnapshot() {
    const openTodos = todos
        .filter((todo) => !todo.done)
        .map((todo) => ({ id: todo.id, text: todo.text }));
    const doneTodos = todos
        .filter((todo) => todo.done)
        .map((todo) => ({ id: todo.id, text: todo.text }));

    return {
        kind: 'todo',
        source: 'todo',
        open_todos: openTodos,
        done_todos: doneTodos,
        total_count: todos.length,
        open_count: openTodos.length,
        done_count: doneTodos.length,
    };
}

function createQuickActions(snapshot) {
    if (snapshot.open_count > 0) {
        return [
            {
                key: 'add',
                label: 'Add a task',
                description: 'Insert /todo add into chat and keep the current snapshot attached.',
                command: '/todo add ',
                behavior: 'insert',
            },
            {
                key: 'list',
                label: 'Show list',
                description: 'Run /todo list right away.',
                command: '/todo list',
                behavior: 'send',
            },
            {
                key: 'done',
                label: 'Mark done',
                description: 'Insert a template like /todo done 1.',
                command: '/todo done ',
                behavior: 'insert',
            },
            {
                key: 'update',
                label: 'Update task',
                description: 'Insert a template like /todo update 2 Rewrite copy.',
                command: '/todo update ',
                behavior: 'insert',
            },
            {
                key: 'delete',
                label: 'Delete task',
                description: 'Insert a template like /todo delete 3.',
                command: '/todo delete ',
                behavior: 'insert',
            },
        ];
    }

    return [
        {
            key: 'add',
            label: 'Add a task',
            description: 'Insert /todo add so you can create the first task from chat.',
            command: '/todo add ',
            behavior: 'insert',
        },
        {
            key: 'list',
            label: 'Show list',
            description: 'Run /todo list to confirm the list is empty or see existing tasks.',
            command: '/todo list',
            behavior: 'send',
        },
        {
            key: 'update',
            label: 'Update task',
            description: 'Insert a template for editing a task once you have items.',
            command: '/todo update ',
            behavior: 'insert',
        },
        {
            key: 'delete',
            label: 'Delete task',
            description: 'Insert a template for removing a task by number.',
            command: '/todo delete ',
            behavior: 'insert',
        },
    ];
}

function createAssistPayload() {
    const snapshot = createSnapshot();
    const summary = snapshot.open_count > 0
        ? `${snapshot.open_count} open${snapshot.done_count ? ` • ${snapshot.done_count} done` : ''}`
        : snapshot.done_count > 0
            ? `All caught up • ${snapshot.done_count} done`
            : 'No tasks yet';

    return {
        text: '/todo ',
        composer_assist: {
            source: 'todo',
            icon: 'list-todo',
            title: 'Todo Copilot',
            subtitle: snapshot.open_count > 0
                ? 'Manage the list directly from chat. The current Todo snapshot will be attached to the next /todo turn if you need it.'
                : 'Start with /todo add, /todo list, /todo update, /todo done, or /todo delete.',
            summary,
            prompt_prefix: '/todo ',
            actions: createQuickActions(snapshot),
            examples: [
                '/todo add Buy milk',
                '/todo list',
                '/todo update 1 Buy oat milk',
                '/todo done 1',
                '/todo delete 1',
            ],
            context: snapshot,
        },
    };
}

function render() {
    listEl.innerHTML = '';
    emptyEl.style.display = todos.length === 0 ? 'block' : 'none';

    todos.forEach((todo) => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.done ? 'done' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!todo.done;
        checkbox.addEventListener('change', async () => {
            todo.done = checkbox.checked;
            await persist();
            render();
        });

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = todo.text;

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
            todos = todos.filter((item) => item.id !== todo.id);
            await persist();
            render();
        });

        li.append(checkbox, label, remove);
        listEl.appendChild(li);
    });
}

async function persist() {
    await window.PocketPawExtensionSDK.storage.set(STORAGE_KEY, todos);
}

async function loadTodos() {
    todos = await window.PocketPawExtensionSDK.storage.get(STORAGE_KEY) || [];
    render();
}

formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    todos.unshift({
        id: `todo-${Date.now()}`,
        text,
        done: false,
    });
    inputEl.value = '';
    await persist();
    render();
});

summaryButton.addEventListener('click', () => {
    window.PocketPawExtensionSDK.host.openChat(createAssistPayload());
});

window.PocketPawExtensionSDK.ready().then(() => {
    loadTodos();
});

document.addEventListener('pocketpaw-extension:ready', () => {
    loadTodos();
});
