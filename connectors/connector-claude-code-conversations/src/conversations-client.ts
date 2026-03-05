/**
 * ConversationsClient — Reads Claude Code conversation data from the filesystem.
 *
 * Scans ~/.claude/projects/ for project directories, session .jsonl files,
 * and session memory summaries. No network access required.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";

// ============================================================================
// Types
// ============================================================================

interface SessionLine {
  type: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
    model?: string;
  };
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  gitBranch?: string;
  cwd?: string;
  version?: string;
  isSidechain?: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export interface SessionMetadata {
  title: string;
  summary: string;
  firstMessage: string;
  model: string;
  gitBranch: string;
  cwd: string;
  version: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
}

export interface MessageData {
  uuid: string;
  type: string;
  content: string;
  timestamp: string;
  model: string;
}

// ============================================================================
// Composite ID helpers
// ============================================================================

const ID_SEP = "::";

export function sessionId(projectDir: string, sessionUuid: string): string {
  return `${projectDir}${ID_SEP}${sessionUuid}`;
}

export function messageId(projectDir: string, sessionUuid: string, messageUuid: string): string {
  return `${projectDir}${ID_SEP}${sessionUuid}${ID_SEP}${messageUuid}`;
}

export function parseSessionId(id: string): { projectDir: string; sessionUuid: string } {
  const sep = id.indexOf(ID_SEP);
  return { projectDir: id.slice(0, sep), sessionUuid: id.slice(sep + ID_SEP.length) };
}

export function parseMessageId(id: string): { projectDir: string; sessionUuid: string; messageUuid: string } {
  const first = id.indexOf(ID_SEP);
  const second = id.indexOf(ID_SEP, first + ID_SEP.length);
  return {
    projectDir: id.slice(0, first),
    sessionUuid: id.slice(first + ID_SEP.length, second),
    messageUuid: id.slice(second + ID_SEP.length),
  };
}

// ============================================================================
// Client
// ============================================================================

export class ConversationsClient {
  private readonly projectsDir: string;

  constructor(private readonly claudeDir: string) {
    this.projectsDir = join(claudeDir, "projects");
  }

  /** List all project directory names that contain at least one session. */
  async listProjects(): Promise<string[]> {
    const entries = await readdir(this.projectsDir, { withFileTypes: true });
    const projects: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = join(this.projectsDir, entry.name);
      const files = await readdir(projectPath);
      if (files.some((f) => f.endsWith(".jsonl"))) {
        projects.push(entry.name);
      }
    }

    return projects;
  }

  /** Derive project name and original path from the first session's cwd. */
  async getProjectInfo(projectDirName: string): Promise<ProjectInfo> {
    const projectPath = join(this.projectsDir, projectDirName);
    const files = await readdir(projectPath);
    const firstJsonl = files.find((f) => f.endsWith(".jsonl"));

    if (firstJsonl) {
      const firstLine = await this.readFirstLine(join(projectPath, firstJsonl));
      if (firstLine?.cwd) {
        return { name: basename(firstLine.cwd), path: firstLine.cwd };
      }
    }

    // Fallback: use the directory name as-is
    return { name: projectDirName, path: projectDirName };
  }

  /** List session UUIDs for a project. */
  async listSessions(projectDirName: string): Promise<string[]> {
    const projectPath = join(this.projectsDir, projectDirName);
    const files = await readdir(projectPath);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(".jsonl", ""));
  }

  /** Extract metadata from a session's .jsonl file. */
  async getSessionMetadata(projectDirName: string, sessionUuid: string): Promise<SessionMetadata> {
    const lines = await this.readSessionLines(projectDirName, sessionUuid);

    let firstMessage = "";
    let model = "";
    let gitBranch = "";
    let cwd = "";
    let version = "";
    let startedAt = "";
    let endedAt = "";
    let messageCount = 0;

    for (const line of lines) {
      if (line.type === "user" || line.type === "assistant") {
        messageCount++;
      }

      if (!startedAt && line.timestamp) {
        startedAt = line.timestamp;
      }
      if (line.timestamp) {
        endedAt = line.timestamp;
      }

      if (!firstMessage && line.type === "user") {
        firstMessage = extractContent(line);
      }

      if (!model && line.type === "assistant" && line.message?.model) {
        model = line.message.model;
      }

      if (!gitBranch && line.gitBranch) gitBranch = line.gitBranch;
      if (!cwd && line.cwd) cwd = line.cwd;
      if (!version && line.version) version = line.version;
    }

    const summary = await this.readSessionSummary(projectDirName, sessionUuid);

    let title = "";
    if (summary) {
      const titleMatch = summary.match(/^#\s+(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim();
    }
    if (!title) {
      title = firstMessage.slice(0, 200);
    }

    return {
      title,
      summary: summary ?? "",
      firstMessage,
      model,
      gitBranch,
      cwd,
      version,
      startedAt,
      endedAt,
      messageCount,
    };
  }

  /** Extract user and assistant messages from a session. */
  async getSessionMessages(projectDirName: string, sessionUuid: string): Promise<MessageData[]> {
    const lines = await this.readSessionLines(projectDirName, sessionUuid);
    const messages: MessageData[] = [];

    for (const line of lines) {
      if (line.type !== "user" && line.type !== "assistant") continue;
      if (!line.uuid) continue;

      messages.push({
        uuid: line.uuid,
        type: line.type,
        content: extractContent(line),
        timestamp: line.timestamp ?? "",
        model: line.type === "assistant" ? (line.message?.model ?? "") : "",
      });
    }

    return messages;
  }

  /** Find a single message by UUID within a session. */
  async getMessage(
    projectDirName: string,
    sessionUuid: string,
    messageUuid: string,
  ): Promise<MessageData | null> {
    const lines = await this.readSessionLines(projectDirName, sessionUuid);

    for (const line of lines) {
      if (line.uuid !== messageUuid) continue;
      if (line.type !== "user" && line.type !== "assistant") continue;

      return {
        uuid: line.uuid,
        type: line.type,
        content: extractContent(line),
        timestamp: line.timestamp ?? "",
        model: line.type === "assistant" ? (line.message?.model ?? "") : "",
      };
    }

    return null;
  }

  /** Verify the projects directory exists and is readable. */
  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      const s = await stat(this.projectsDir);
      return s.isDirectory()
        ? { ok: true }
        : { ok: false, error: "projects directory is not a directory" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async readSessionLines(projectDirName: string, sessionUuid: string): Promise<SessionLine[]> {
    const filePath = join(this.projectsDir, projectDirName, `${sessionUuid}.jsonl`);
    const text = await readFile(filePath, "utf-8");
    const lines: SessionLine[] = [];

    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      try {
        lines.push(JSON.parse(raw));
      } catch {
        // Skip malformed lines
      }
    }

    return lines;
  }

  private async readFirstLine(filePath: string): Promise<SessionLine | null> {
    try {
      const text = await readFile(filePath, "utf-8");
      const newline = text.indexOf("\n");
      const firstLine = newline > 0 ? text.slice(0, newline) : text;
      if (!firstLine.trim()) return null;
      return JSON.parse(firstLine);
    } catch {
      return null;
    }
  }

  private async readSessionSummary(projectDirName: string, sessionUuid: string): Promise<string | null> {
    const summaryPath = join(
      this.projectsDir,
      projectDirName,
      sessionUuid,
      "session-memory",
      "summary.md",
    );
    try {
      return await readFile(summaryPath, "utf-8");
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Content extraction
// ============================================================================

function extractContent(line: SessionLine): string {
  const content = line.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}
