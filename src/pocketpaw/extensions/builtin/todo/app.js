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
                key: 'next',
                label: 'What should I do next?',
                description: 'Ask PocketPaw to prioritize the current list.',
                command: '/todo what should I do next based on my current tasks?',
            },
            {
                key: 'plan',
                label: 'Plan my day',
                description: 'Turn the list into a realistic plan for today.',
                command: '/todo turn these tasks into a practical plan for today.',
            },
            {
                key: 'summarize',
                label: 'Summarize tasks',
                description: 'Get a quick view of scope, progress, and focus.',
                command: '/todo summarize my current tasks and progress.',
            },
            {
                key: 'update',
                label: 'Draft progress update',
                description: 'Prepare a short status update from the list.',
                command: '/todo draft a short progress update based on my current tasks.',
            },
        ];
    }

    return [
        {
            key: 'starter',
            label: 'Create a starter list',
            description: 'Ask PocketPaw what a useful starter todo list looks like.',
            command: '/todo help me create a starter todo list for today.',
        },
        {
            key: 'workflow',
            label: 'How do I use this?',
            description: 'Get a quick explanation of the Todo + chat workflow.',
            command: '/todo teach me how to use the Todo app and chat workflow well.',
        },
        {
            key: 'capture',
            label: 'Turn ideas into tasks',
            description: 'Ask PocketPaw to convert rough notes into actionable tasks.',
            command: '/todo help me turn rough ideas into actionable tasks.',
        },
        {
            key: 'review',
            label: 'Review my system',
            description: 'Ask for suggestions before tasks start piling up.',
            command: '/todo suggest a simple task system I can stick with.',
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
                ? 'Pick a quick action or type after /todo. The current Todo snapshot will be carried into the next chat turn.'
                : 'Start with a quick action or type after /todo. PocketPaw can help you set up the list before you fill it in.',
            summary,
            prompt_prefix: '/todo ',
            actions: createQuickActions(snapshot),
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
