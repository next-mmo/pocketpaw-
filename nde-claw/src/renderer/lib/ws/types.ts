// --------------------------------------------------------------------------
// WebSocket event types — mirrors the PocketPaw backend event model
// --------------------------------------------------------------------------

export interface WSNotification {
  type: 'notification';
  content: string;
}

export interface WSError {
  type: 'error';
  content: string;
}

export interface WSHealthUpdate {
  type: 'health_update';
  data: {
    status: string;
    check_count: number;
    issues: unknown[];
    error?: string;
  };
}

export interface WSReminders {
  type: 'reminders';
  reminders: Array<{
    id: string;
    text: string;
    trigger_at: string;
    created_at: string;
    time_remaining: string;
  }>;
}

export interface WSReminderAdded {
  type: 'reminder_added';
  reminder: {
    id: string;
    text: string;
    trigger_at: string;
    created_at: string;
    time_remaining: string;
  };
}

export interface WSReminderDeleted {
  type: 'reminder_deleted';
  id: string;
}

export interface WSSkills {
  type: 'skills';
  skills: Array<{
    name: string;
    description: string;
    argument_hint: string;
  }>;
}

export interface WSMCTaskStarted {
  type: 'mc_task_started';
  task_id: string;
  agent_id: string;
  agent_name: string;
  task_title: string;
  timestamp: string;
}

export interface WSMCTaskOutput {
  type: 'mc_task_output';
  task_id: string;
  content: string;
  output_type: 'message' | 'tool_use' | 'tool_result';
  timestamp: string;
}

export interface WSMCTaskCompleted {
  type: 'mc_task_completed';
  task_id: string;
  agent_id: string;
  status: 'completed' | 'error' | 'stopped' | 'timeout';
  error?: string;
  timestamp: string;
}

export interface WSOpenPath {
  type: 'open_path';
  path: string;
  action: 'navigate' | 'view';
}

export type WSEvent =
  | WSNotification
  | WSError
  | WSHealthUpdate
  | WSReminders
  | WSReminderAdded
  | WSReminderDeleted
  | WSSkills
  | WSMCTaskStarted
  | WSMCTaskOutput
  | WSMCTaskCompleted
  | WSOpenPath;

// Typed event map for strongly-typed on() handlers
export type WSEventMap = {
  notification: WSNotification;
  error: WSError;
  health_update: WSHealthUpdate;
  reminders: WSReminders;
  reminder_added: WSReminderAdded;
  reminder_deleted: WSReminderDeleted;
  skills: WSSkills;
  mc_task_started: WSMCTaskStarted;
  mc_task_output: WSMCTaskOutput;
  mc_task_completed: WSMCTaskCompleted;
  open_path: WSOpenPath;
};

// Actions the client can send to the server
export type WSAction = { action: 'authenticate'; token: string } | { action: 'ping' };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
