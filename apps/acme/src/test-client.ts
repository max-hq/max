import type { AcmeClient } from "./client.ts";
import { Tenant } from "./tenant.ts";
import type {
  Workspace, WorkspaceInput, WorkspacePatch,
  User, UserInput, UserPatch, UserRole,
  Project, ProjectInput, ProjectPatch,
  Task, TaskInput, TaskPatch,
  File, FileInput, FilePatch,
  ChangeEvent, TaskHistoryEntry,
  WebhookRegistration,
  SeedOptions, SeedResult,
} from "./types.ts";

// -------------------------------------------------------------------------
// Config & Fixture types
// -------------------------------------------------------------------------

export interface AcmeTestClientConfig {
  seed?: SeedOptions;
  tenantName?: string;
}

export interface TestFixture {
  workspaces?: Array<{
    id?: string;
    name: string;
    users?: Array<{ id?: string; displayName: string; email?: string; role?: UserRole }>;
    projects?: Array<{ id?: string; name: string; description?: string }>;
  }>;
}

export class AcmeTestClient implements AcmeClient {
  readonly tenant: Tenant;

  constructor(config?: AcmeTestClientConfig) {
    this.tenant = Tenant.create({
      name: config?.tenantName ?? "test",
      storage: "memory",
    });
  }

  /** Create a test client pre-populated with declarative fixture data. */
  static withData(fixture: TestFixture): AcmeTestClient {
    const client = new AcmeTestClient();
    for (const wsData of fixture.workspaces ?? []) {
      const ws = client.addWorkspace(wsData);
      for (const userData of wsData.users ?? []) {
        client.addUser(ws.id, userData);
      }
      for (const projData of wsData.projects ?? []) {
        client.addProject(ws.id, projData);
      }
    }
    return client;
  }

  async seed(options?: SeedOptions): Promise<SeedResult> {
    return this.tenant.seed(options);
  }

  dispose(): void {
    this.tenant.dispose();
  }

  // -------------------------------------------------------------------------
  // Ergonomic test helpers (not part of AcmeClient interface)
  // -------------------------------------------------------------------------

  addWorkspace(data: { id?: string; name: string }): Workspace {
    return this.tenant.createWorkspace({ name: data.name });
  }

  addUser(workspaceId: string, data: { id?: string; displayName: string; email?: string; role?: UserRole }): User {
    const email = data.email ?? `${data.displayName.toLowerCase().replace(/\s+/g, ".")}@test.local`;
    return this.tenant.createUser({
      workspaceId,
      displayName: data.displayName,
      email,
      role: data.role ?? "member",
    });
  }

  addProject(workspaceId: string, data: { id?: string; name: string; description?: string; ownerId?: string }): Project {
    let ownerId = data.ownerId;
    if (!ownerId) {
      const users = this.tenant.listUsers(workspaceId);
      ownerId = users[0]?.id;
      if (!ownerId) {
        const user = this.addUser(workspaceId, { displayName: "Default User" });
        ownerId = user.id;
      }
    }
    return this.tenant.createProject({
      workspaceId,
      name: data.name,
      description: data.description,
      ownerId,
    });
  }

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  async listWorkspaces(): Promise<Workspace[]> {
    return this.tenant.listWorkspaces();
  }

  async getWorkspace(id: string): Promise<Workspace> {
    const ws = this.tenant.getWorkspace(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);
    return ws;
  }

  async createWorkspace(input: WorkspaceInput): Promise<Workspace> {
    return this.tenant.createWorkspace(input);
  }

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    return this.tenant.updateWorkspace(id, patch);
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.tenant.deleteWorkspace(id);
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async listUsers(workspaceId?: string): Promise<User[]> {
    return this.tenant.listUsers(workspaceId);
  }

  async getUser(id: string): Promise<User> {
    const u = this.tenant.getUser(id);
    if (!u) throw new Error(`User "${id}" not found`);
    return u;
  }

  async createUser(input: UserInput): Promise<User> {
    return this.tenant.createUser(input);
  }

  async updateUser(id: string, patch: UserPatch): Promise<User> {
    return this.tenant.updateUser(id, patch);
  }

  async deleteUser(id: string): Promise<void> {
    this.tenant.deleteUser(id);
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  async listProjects(workspaceId?: string): Promise<Project[]> {
    return this.tenant.listProjects(workspaceId);
  }

  async getProject(id: string): Promise<Project> {
    const p = this.tenant.getProject(id);
    if (!p) throw new Error(`Project "${id}" not found`);
    return p;
  }

  async createProject(input: ProjectInput): Promise<Project> {
    return this.tenant.createProject(input);
  }

  async updateProject(id: string, patch: ProjectPatch): Promise<Project> {
    return this.tenant.updateProject(id, patch);
  }

  async deleteProject(id: string): Promise<void> {
    this.tenant.deleteProject(id);
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  async listTasks(projectId?: string): Promise<Task[]> {
    return this.tenant.listTasks(projectId);
  }

  async getTask(id: string): Promise<Task> {
    const t = this.tenant.getTask(id);
    if (!t) throw new Error(`Task "${id}" not found`);
    return t;
  }

  async createTask(input: TaskInput): Promise<Task> {
    return this.tenant.createTask(input);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    return this.tenant.updateTask(id, patch);
  }

  async deleteTask(id: string): Promise<void> {
    this.tenant.deleteTask(id);
  }

  async getTaskHistory(
    taskId: string,
    opts?: { before?: number; limit?: number },
  ): Promise<{ entries: TaskHistoryEntry[]; nextCursor: number | null }> {
    return this.tenant.getTaskHistory(taskId, opts);
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  async listFiles(projectId?: string): Promise<File[]> {
    return this.tenant.listFiles(projectId);
  }

  async getFile(id: string): Promise<File> {
    const f = this.tenant.getFile(id);
    if (!f) throw new Error(`File "${id}" not found`);
    return f;
  }

  async createFile(input: FileInput): Promise<File> {
    return this.tenant.createFile(input);
  }

  async updateFile(id: string, patch: FilePatch): Promise<File> {
    return this.tenant.updateFile(id, patch);
  }

  async deleteFile(id: string): Promise<void> {
    this.tenant.deleteFile(id);
  }

  // -------------------------------------------------------------------------
  // Changelog
  // -------------------------------------------------------------------------

  async getChanges(opts?: {
    since?: number;
    limit?: number;
  }): Promise<{ events: ChangeEvent[]; nextCursor: number }> {
    return this.tenant.getChanges(opts?.since, opts?.limit);
  }

  async getRecentChanges(limit?: number): Promise<ChangeEvent[]> {
    return this.tenant.getRecentChanges(limit);
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  async listWebhooks(): Promise<WebhookRegistration[]> {
    return this.tenant.listWebhooks();
  }

  async registerWebhook(url: string): Promise<WebhookRegistration> {
    return this.tenant.registerWebhook(url);
  }

  async deleteWebhook(id: string): Promise<void> {
    this.tenant.unregisterWebhook(id);
  }
}
