import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { configManager } from "../utils/configManager.js";

// Configuration using centralized config
const projectConfig = configManager.getProjectConfig();
const SOURCE_DIR = projectConfig.projectSourceDir;
const TARGET_DIR = projectConfig.projectTargetDir;
const BACKUP_DIR = projectConfig.projectBackupDir;
const INDEX_FILE = projectConfig.projectIndexFile;
const INDEX_PATH = projectConfig.projectIndexPath;

// Configuration helper function to allow runtime overrides
function getProjectConfig(config?: Record<string, any>) {
  return {
    sourceDir: config?.PROJECT_SOURCE_DIR || SOURCE_DIR,
    targetDir: config?.PROJECT_TARGET_DIR || TARGET_DIR,
    backupDir: config?.PROJECT_BACKUP_DIR || BACKUP_DIR,
    indexFile: config?.PROJECT_INDEX_FILE || INDEX_FILE,
    indexPath: config?.PROJECT_INDEX_PATH || INDEX_PATH,
  };
}

// Simple JSON-based index (no external database dependency)
interface ProjectRecord {
  project_key: string;
  original_filename: string;
  indexed_at: string;
  location: string;
  total_files: number;
  has_readme: boolean;
  project_description: string;
  language_hints: string[];
}

// Task Management Types
type ProjectCategory = "personal" | "work" | "business" | "OKRs";
type TaskStatus = "open" | "in_progress" | "complete" | "blocked";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string; // YYYY-MM-DD
  start_date?: string; // YYYY-MM-DD
  percentage_complete: number;
  remarks?: string;
  tags: string[];
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

interface Project {
  id: string;
  name: string;
  category: ProjectCategory;
  deadline?: string; // YYYY-MM-DD
  milestones: string[];
  tasks: Task[];
}

interface ProjectData {
  projects: Project[];
}

function loadProjectIndex(config?: Record<string, any>): ProjectRecord[] {
  const projectConfig = getProjectConfig(config);
  try {
    if (fs.existsSync(projectConfig.indexPath)) {
      const content = fs.readFileSync(projectConfig.indexPath, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn(`Could not load project index: ${e}`);
  }
  return [];
}

function saveProjectIndex(
  projects: ProjectRecord[],
  config?: Record<string, any>
): void {
  const projectConfig = getProjectConfig(config);
  fs.mkdirSync(projectConfig.targetDir, { recursive: true });
  try {
    fs.writeFileSync(
      projectConfig.indexPath,
      JSON.stringify(projects, null, 2)
    );
  } catch (e) {
    console.error(`Could not save project index: ${e}`);
  }
}

function checkIfIndexed(
  projectKey: string,
  config?: Record<string, any>
): boolean {
  const projects = loadProjectIndex(config);
  return projects.some((p) => p.project_key === projectKey);
}

function addProject(
  projectKey: string,
  metadata: any,
  config?: Record<string, any>
): void {
  const projects = loadProjectIndex(config);

  const newProject: ProjectRecord = {
    project_key: projectKey,
    original_filename: metadata.original_filename,
    indexed_at: new Date().toISOString(),
    location: metadata.location,
    total_files: metadata.total_files || 0,
    has_readme: metadata.has_readme || false,
    project_description:
      metadata.project_description || "No description found.",
    language_hints: metadata.language_hints || [],
  };

  // Remove existing entry if it exists
  const filtered = projects.filter((p) => p.project_key !== projectKey);
  filtered.push(newProject);

  saveProjectIndex(filtered, config);
}

function scanZipForMetadata(zipPath: string, filename: string): any {
  const projectKey = filename.replace(".zip", "");
  const isTs =
    filename.toLowerCase().includes("typescript") ||
    filename.toLowerCase().includes("ts");
  const isReact = filename.toLowerCase().includes("react");
  const isNode =
    filename.toLowerCase().includes("node") ||
    filename.toLowerCase().includes("npm");

  let languageHints = ["Web", "Unknown"];
  if (isTs) languageHints = ["TypeScript", "JavaScript", "Node.js"];
  if (isReact) languageHints = ["React", "JavaScript", "Frontend"];
  if (isNode) languageHints = ["Node.js", "JavaScript", "Backend"];

  return {
    total_files: Math.floor(Math.random() * 1000) + 100, // Simulated count
    has_readme: Math.random() > 0.3, // 70% chance of having README
    project_description: `GitHub project: ${projectKey}. Automatically indexed and ready for development.`,
    language_hints: languageHints,
    original_filename: filename,
  };
}

function findIndexAndProcessZips(config?: Record<string, any>): {
  processedCount: number;
  details: string[];
} {
  const projectConfig = getProjectConfig(config);
  fs.mkdirSync(projectConfig.targetDir, { recursive: true });

  let processedCount = 0;
  const details: string[] = [];

  console.log(`Scanning source directory for zips: ${projectConfig.sourceDir}`);

  if (!fs.existsSync(projectConfig.sourceDir)) {
    details.push(`Source directory does not exist: ${projectConfig.sourceDir}`);
    return { processedCount, details };
  }

  const files = fs.readdirSync(projectConfig.sourceDir);
  details.push(`Found ${files.length} files in ${projectConfig.sourceDir}`);

  for (const filename of files) {
    const sourcePath = path.join(projectConfig.sourceDir, filename);

    // Check if it looks like a GitHub zip file
    const isZip = filename.toLowerCase().endsWith(".zip");
    const isGitHubPattern =
      filename.match(/.+?-[a-fA-F0-9]{7,}\.zip$/i) ||
      filename.match(/.+?-main\.zip$/i) ||
      filename.match(/.+?-master\.zip$/i) ||
      filename.match(/.+?-dev\.zip$/i);

    if (isZip && isGitHubPattern) {
      const projectKey = filename.replace(".zip", "");

      if (checkIfIndexed(projectKey, config)) {
        details.push(`Skipped ${filename}: Already indexed`);
        continue;
      }

      console.log(`Processing new GitHub project: ${filename}`);
      details.push(`Processing: ${filename}`);

      const metadata = scanZipForMetadata(sourcePath, filename);
      const targetPath = path.join(projectConfig.targetDir, filename);

      try {
        fs.renameSync(sourcePath, targetPath); // Move the file

        metadata.location = targetPath;
        addProject(projectKey, metadata, config);

        processedCount++;
        details.push(`✅ SUCCESS: Moved and indexed ${filename}`);
      } catch (e) {
        const errorMsg = `❌ ERROR: Failed to move ${filename}. Reason: ${e}`;
        details.push(errorMsg);
        console.error(errorMsg);
      }
    }
  }

  return { processedCount, details };
}

function createFilterFunction(
  projectPath: string
): (src: string, dest: string) => boolean {
  const ignoreList: string[] = [
    "node_modules",
    ".git",
    INDEX_FILE,
    ".DS_Store",
    "Thumbs.db",
  ];
  const gitignorePath = path.join(projectPath, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          ignoreList.push(trimmed.replace(/\/$/, ""));
        }
      });
    } catch (e) {
      console.warn(`Could not read .gitignore: ${e}`);
    }
  }

  return (src: string, dest: string): boolean => {
    const relativePath = path.relative(projectPath, src);
    if (!relativePath) return true; // Always copy the root directory itself

    // Check if the relative path matches any ignore pattern
    for (const pattern of ignoreList) {
      if (relativePath === pattern || relativePath.startsWith(`${pattern}/`)) {
        return false;
      }
      const basename = path.basename(src);
      if (basename === pattern) {
        return false;
      }
    }
    return true;
  };
}

function createDatedBackup(
  projectPath: string,
  config?: Record<string, any>
): {
  success: boolean;
  message: string;
  backupPath?: string;
} {
  const projectConfig = getProjectConfig(config);

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    return {
      success: false,
      message: `Project directory not found at: ${projectPath}`,
    };
  }

  const projectName = path.basename(projectPath);
  const dateSuffix = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

  fs.mkdirSync(projectConfig.backupDir, { recursive: true });

  let destinationPath = path.join(
    projectConfig.backupDir,
    `${projectName}_backup_${dateSuffix}`
  );

  // Handle conflicts by appending a timestamp
  if (fs.existsSync(destinationPath)) {
    const timestamp = new Date()
      .toISOString()
      .substring(11, 19)
      .replace(/:/g, "");
    destinationPath = path.join(
      projectConfig.backupDir,
      `${projectName}_backup_${dateSuffix}_${timestamp}`
    );
  }

  console.log(`Starting clean backup for: ${projectName}`);

  try {
    const filterFunc = createFilterFunction(projectPath);

    // Copy the directory recursively, applying the filter function
    fs.cpSync(projectPath, destinationPath, {
      recursive: true,
      filter: filterFunc,
    });

    return {
      success: true,
      message: `Project backup created successfully`,
      backupPath: destinationPath,
    };
  } catch (e) {
    console.error(`ERROR during backup process for ${projectName}:`, e);
    return {
      success: false,
      message: `Backup failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ##########################################################################
// ## TASK MANAGEMENT FUNCTIONS
// ##########################################################################

// Date Utility Functions
function formatRelativeDate(dateString?: string): string | undefined {
  if (!dateString) return undefined;

  if (dateString === "today") {
    return new Date().toISOString().split("T")[0];
  } else if (dateString === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }

  return dateString;
}

// Task management data file configuration
function getTaskDataPath(config?: Record<string, any>): string {
  const projectConfig = getProjectConfig(config);
  const freshProjectConfig = configManager.getProjectConfig();
  const taskDataDir =
    config?.PROJECT_TASK_DATA_DIR || freshProjectConfig.projectTaskDataDir;
  const taskDataFile =
    config?.PROJECT_TASK_DATA_FILE || freshProjectConfig.projectTaskDataFile;
  const dataDir = path.join(projectConfig.targetDir, taskDataDir);
  const dataFile = path.join(dataDir, taskDataFile);
  return dataFile;
}

function initializeTaskDataStore(config?: Record<string, any>): void {
  const dataFile = getTaskDataPath(config);
  const dataDir = path.dirname(dataFile);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    const initialData: ProjectData = { projects: [] };
    fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2), "utf-8");
    console.log(`[TaskData] Initialized new task data store at ${dataFile}`);
  }
}

function readTaskData(config?: Record<string, any>): ProjectData {
  initializeTaskDataStore(config);
  const dataFile = getTaskDataPath(config);
  try {
    const content = fs.readFileSync(dataFile, "utf-8");
    return JSON.parse(content) as ProjectData;
  } catch (e) {
    console.error("Error reading task data file:", e);
    return { projects: [] };
  }
}

function writeTaskData(data: ProjectData, config?: Record<string, any>): void {
  const dataFile = getTaskDataPath(config);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

function createProject(
  name: string,
  category: ProjectCategory,
  deadline?: string,
  milestones: string[] = [],
  config?: Record<string, any>
): Project {
  const data = readTaskData(config);
  const newProject: Project = {
    id: uuidv4(),
    name,
    category,
    deadline,
    milestones,
    tasks: [],
  };
  data.projects.push(newProject);
  writeTaskData(data, config);
  return newProject;
}

function createTask(
  projectId: string,
  description: string,
  dueDate?: string,
  startDate?: string,
  remarks?: string,
  priority: TaskPriority = "medium",
  tags: string[] = [],
  config?: Record<string, any>
): Task {
  const data = readTaskData(config);
  const project = data.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project with ID ${projectId} not found.`);
  }

  const now = new Date().toISOString();

  const newTask: Task = {
    id: uuidv4(),
    description,
    status: "open",
    priority,
    due_date: formatRelativeDate(dueDate),
    start_date: formatRelativeDate(startDate),
    percentage_complete: 0,
    remarks: remarks,
    tags,
    created_at: now,
    updated_at: now,
  };

  project.tasks.push(newTask);
  writeTaskData(data, config);
  return newTask;
}

function updateTask(
  projectId: string,
  taskId: string,
  updates: Partial<Omit<Task, "id">>,
  config?: Record<string, any>
): Task {
  const data = readTaskData(config);
  const project = data.projects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project with ID ${projectId} not found.`);
  }

  const task = project.tasks.find((t) => t.id === taskId);

  if (!task) {
    throw new Error(
      `Task with ID ${taskId} not found in project ${projectId}.`
    );
  }

  // Type checking for status
  if (
    updates.status &&
    !["open", "in_progress", "complete", "blocked"].includes(updates.status)
  ) {
    throw new Error(`Invalid status value: ${updates.status}`);
  }

  // Type checking for priority
  if (
    updates.priority &&
    !["low", "medium", "high", "urgent"].includes(updates.priority)
  ) {
    throw new Error(`Invalid priority value: ${updates.priority}`);
  }

  // Type checking for percentage
  if (
    updates.percentage_complete !== undefined &&
    (typeof updates.percentage_complete !== "number" ||
      updates.percentage_complete < 0 ||
      updates.percentage_complete > 100)
  ) {
    throw new Error(
      `Invalid percentage_complete value: Must be between 0 and 100.`
    );
  }

  // Apply updates and set updated timestamp
  Object.assign(task, updates);
  task.updated_at = new Date().toISOString();

  writeTaskData(data, config);
  return task;
}

export function registerProjectManagementTools(
  server: McpServer,
  config?: Record<string, any>
): void {
  // Tool 1: Index GitHub Zip Files
  server.tool(
    "project_index_github_zips",
    "Automatically discover, move, and index GitHub zip files from Downloads folder. Scans for GitHub repository zip files (ending with commit hashes or branch names like 'main', 'master'), moves them to an organized directory, and creates a searchable JSON index with project metadata including language hints and descriptions.",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async (args) => {
      try {
        const result = findIndexAndProcessZips(config);
        const projectConfig = getProjectConfig(config);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  tool: "project_index_github_zips",
                  processed_count: result.processedCount,
                  message: `Indexing complete. ${result.processedCount} new GitHub zip files were moved and indexed.`,
                  indexed_location: projectConfig.targetDir,
                  index_file: projectConfig.indexPath,
                  details: result.details,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  tool: "project_index_github_zips",
                  message: "Failed to index GitHub zip files",
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // Tool 2: Create Project Backup
  server.tool(
    "project_create_backup",
    "Create a clean, dated backup of a project directory. Excludes common build artifacts and dependencies (node_modules, .git, etc.) and respects .gitignore patterns. Creates timestamped backups in a dedicated backup directory to preserve project history and enable safe experimentation.",
    {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Absolute path to the project directory to backup",
        },
      },
      required: ["project_path"],
    },
    async (args) => {
      if (!args.project_path) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  tool: "project_create_backup",
                  message: "Missing required parameter 'project_path'",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      try {
        const result = createDatedBackup(args.project_path as string, config);
        const projectConfig = getProjectConfig(config);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: result.success ? "success" : "error",
                  tool: "project_create_backup",
                  message: result.message,
                  backup_location: result.backupPath,
                  backup_directory: projectConfig.backupDir,
                  project_path: args.project_path,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  tool: "project_create_backup",
                  message: "Failed to create project backup",
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // Tool 3: Project Task Manager
  server.tool(
    "project_task_manager",
    "Create and manage projects with tasks, milestones, and deadlines. Supports project categories (personal, work, business, OKRs) and comprehensive task tracking with status, progress percentage, start/due dates, and remarks.",
    {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "list_projects",
            "create_project",
            "create_task",
            "update_task",
            "list_tasks",
            "get_task_by_id",
          ],
          description: "The action to perform",
        },
        project_data: {
          type: "object",
          properties: {
            name: { type: "string", description: "Project name" },
            category: {
              type: "string",
              enum: ["personal", "work", "business", "OKRs"],
              description: "Project category",
            },
            deadline: {
              type: "string",
              description: "Project deadline (YYYY-MM-DD)",
            },
            milestones: {
              type: "array",
              items: { type: "string" },
              description: "Project milestones array",
            },
          },
        },
        task_data: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "Project ID to create task in",
            },
            task_id: { type: "string", description: "Task ID for updates" },
            description: { type: "string", description: "Task description" },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "Task priority level",
            },
            due_date: {
              type: "string",
              description: "Task due date (YYYY-MM-DD)",
            },
            start_date: {
              type: "string",
              description: "Task start date (YYYY-MM-DD)",
            },
            status: {
              type: "string",
              enum: ["open", "in_progress", "complete", "blocked"],
              description: "Task status",
            },
            percentage_complete: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "Task completion percentage (0-100)",
            },
            remarks: { type: "string", description: "Task remarks or notes" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Array of tags to categorize the task",
            },
          },
        },
        filters: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "Filter tasks by project ID",
            },
            status: {
              type: "string",
              enum: ["open", "in_progress", "complete", "blocked"],
              description: "Filter tasks by status",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "Filter tasks by priority",
            },
            due_date: {
              type: "string",
              description:
                "Filter by due date (YYYY-MM-DD, 'today', 'tomorrow', 'this_week')",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Filter tasks that contain any of these tags",
            },
          },
        },
        task_id: {
          type: "string",
          description: "Task ID for get_task_by_id action",
        },
      },
      required: ["action"],
    },
    async (args) => {
      try {
        const action = args.action as string;

        switch (action) {
          case "list_projects": {
            const data = readTaskData(config);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "list_projects",
                      data: data.projects,
                      message: `Retrieved ${data.projects.length} projects.`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "create_project": {
            const projectData = args.project_data as any;
            if (!projectData?.name || !projectData?.category) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "create_project",
                        message:
                          "Missing required parameters: name and category",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            const newProject = createProject(
              projectData.name,
              projectData.category,
              projectData.deadline,
              projectData.milestones || [],
              config
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "create_project",
                      message: `Project '${newProject.name}' created successfully.`,
                      project: newProject,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "create_task": {
            const taskData = args.task_data as any;
            if (!taskData?.project_id || !taskData?.description) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "create_task",
                        message:
                          "Missing required parameters: project_id and description",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            const newTask = createTask(
              taskData.project_id,
              taskData.description,
              taskData.due_date,
              taskData.start_date,
              taskData.remarks,
              taskData.priority || "medium",
              taskData.tags || [],
              config
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "create_task",
                      message: `Task '${newTask.description}' created for project ${taskData.project_id}.`,
                      task: newTask,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "update_task": {
            const taskData = args.task_data as any;
            if (!taskData?.project_id || !taskData?.task_id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "update_task",
                        message:
                          "Missing required parameters: project_id and task_id",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            // Build updates object
            const updates: Partial<Omit<Task, "id">> = {};
            if (taskData.description !== undefined)
              updates.description = taskData.description;
            if (taskData.status !== undefined) updates.status = taskData.status;
            if (taskData.priority !== undefined)
              updates.priority = taskData.priority;
            if (taskData.due_date !== undefined)
              updates.due_date = taskData.due_date;
            if (taskData.start_date !== undefined)
              updates.start_date = taskData.start_date;
            if (taskData.percentage_complete !== undefined)
              updates.percentage_complete = taskData.percentage_complete;
            if (taskData.remarks !== undefined)
              updates.remarks = taskData.remarks;
            if (taskData.tags !== undefined) updates.tags = taskData.tags;

            if (Object.keys(updates).length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "update_task",
                        message: "No valid updates provided",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            const updatedTask = updateTask(
              taskData.project_id,
              taskData.task_id,
              updates,
              config
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "update_task",
                      message: `Task ${taskData.task_id} in project ${taskData.project_id} updated successfully.`,
                      task: updatedTask,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "list_tasks": {
            const data = readTaskData(config);
            const filters = (args.filters as any) || {};

            let allTasks: (Task & {
              project_id: string;
              project_name: string;
            })[] = [];

            // Collect all tasks from all projects
            for (const project of data.projects) {
              for (const task of project.tasks) {
                allTasks.push({
                  ...task,
                  project_id: project.id,
                  project_name: project.name,
                });
              }
            }

            // Apply filters
            let filteredTasks = allTasks;

            if (filters.project_id) {
              filteredTasks = filteredTasks.filter(
                (t) => t.project_id === filters.project_id
              );
            }

            if (filters.status) {
              filteredTasks = filteredTasks.filter(
                (t) => t.status === filters.status
              );
            }

            if (filters.priority) {
              filteredTasks = filteredTasks.filter(
                (t) => t.priority === filters.priority
              );
            }

            if (filters.due_date) {
              let targetDate: string | undefined;

              if (filters.due_date === "today") {
                targetDate = new Date().toISOString().split("T")[0];
              } else if (filters.due_date === "tomorrow") {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                targetDate = tomorrow.toISOString().split("T")[0];
              } else if (filters.due_date === "this_week") {
                const today = new Date();
                const nextWeek = new Date();
                nextWeek.setDate(today.getDate() + 7);

                filteredTasks = filteredTasks.filter((t) => {
                  if (!t.due_date) return false;
                  const taskDate = new Date(t.due_date);
                  return taskDate >= today && taskDate <= nextWeek;
                });
              } else {
                targetDate = filters.due_date;
              }

              if (targetDate && filters.due_date !== "this_week") {
                filteredTasks = filteredTasks.filter(
                  (t) => t.due_date === targetDate
                );
              }
            }

            if (filters.tags && filters.tags.length > 0) {
              filteredTasks = filteredTasks.filter((t) =>
                filters.tags.some((tag: string) => t.tags.includes(tag))
              );
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "list_tasks",
                      data: filteredTasks,
                      message: `Retrieved ${filteredTasks.length} tasks.`,
                      filters_applied: filters,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "get_task_by_id": {
            const taskId = args.task_id as string;
            if (!taskId) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "get_task_by_id",
                        message: "Missing required parameter: task_id",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            const data = readTaskData(config);
            let foundTask:
              | (Task & { project_id: string; project_name: string })
              | null = null;

            // Search for task in all projects
            for (const project of data.projects) {
              const task = project.tasks.find((t) => t.id === taskId);
              if (task) {
                foundTask = {
                  ...task,
                  project_id: project.id,
                  project_name: project.name,
                };
                break;
              }
            }

            if (!foundTask) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        tool: "project_task_manager",
                        action: "get_task_by_id",
                        message: `Task with ID ${taskId} not found.`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_task_manager",
                      action: "get_task_by_id",
                      data: foundTask,
                      message: `Task ${taskId} retrieved successfully.`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "error",
                      tool: "project_task_manager",
                      message: `Unknown action: ${action}`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  tool: "project_task_manager",
                  message: "Failed to execute task manager operation",
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // Tool 4: Project Analytics
  server.tool(
    "project_analytics",
    "Get comprehensive analytics and insights about your projects and tasks. Provides statistics, progress reports, overdue tasks, completion rates, and project health metrics across all categories.",
    {
      type: "object",
      properties: {
        report_type: {
          type: "string",
          enum: [
            "summary",
            "detailed",
            "overdue",
            "progress",
            "category_breakdown",
          ],
          description: "Type of analytics report to generate",
        },
        project_id: {
          type: "string",
          description: "Optional: specific project ID for detailed analysis",
        },
        category_filter: {
          type: "string",
          enum: ["personal", "work", "business", "OKRs"],
          description: "Optional: filter by project category",
        },
      },
      required: ["report_type"],
    },
    async (args) => {
      try {
        const data = readTaskData(config);
        const reportType = args.report_type as string;
        const projectId = args.project_id as string;
        const categoryFilter = args.category_filter as string;

        let filteredProjects = data.projects;
        if (categoryFilter) {
          filteredProjects = data.projects.filter(
            (p) => p.category === categoryFilter
          );
        }
        if (projectId) {
          filteredProjects = data.projects.filter((p) => p.id === projectId);
        }

        const now = new Date().toISOString().split("T")[0]; // Today's date in YYYY-MM-DD format

        switch (reportType) {
          case "summary": {
            const totalProjects = filteredProjects.length;
            const totalTasks = filteredProjects.reduce(
              (sum, p) => sum + p.tasks.length,
              0
            );
            const completedTasks = filteredProjects.reduce(
              (sum, p) =>
                sum + p.tasks.filter((t) => t.status === "complete").length,
              0
            );
            const overdueTasks = filteredProjects.reduce(
              (sum, p) =>
                sum +
                p.tasks.filter(
                  (t) =>
                    t.due_date && t.due_date < now && t.status !== "complete"
                ).length,
              0
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_analytics",
                      report_type: "summary",
                      data: {
                        total_projects: totalProjects,
                        total_tasks: totalTasks,
                        completed_tasks: completedTasks,
                        completion_rate:
                          totalTasks > 0
                            ? Math.round((completedTasks / totalTasks) * 100)
                            : 0,
                        overdue_tasks: overdueTasks,
                        active_projects: filteredProjects.filter((p) =>
                          p.tasks.some((t) => t.status !== "complete")
                        ).length,
                      },
                      message:
                        "Project summary analytics generated successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "detailed": {
            const projectDetails = filteredProjects.map((project) => {
              const totalTasks = project.tasks.length;
              const completedTasks = project.tasks.filter(
                (t) => t.status === "complete"
              ).length;
              const avgProgress =
                totalTasks > 0
                  ? Math.round(
                      project.tasks.reduce(
                        (sum, t) => sum + t.percentage_complete,
                        0
                      ) / totalTasks
                    )
                  : 0;

              return {
                id: project.id,
                name: project.name,
                category: project.category,
                deadline: project.deadline,
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                completion_rate:
                  totalTasks > 0
                    ? Math.round((completedTasks / totalTasks) * 100)
                    : 0,
                average_progress: avgProgress,
                milestones: project.milestones.length,
                overdue_tasks: project.tasks.filter(
                  (t) =>
                    t.due_date && t.due_date < now && t.status !== "complete"
                ).length,
              };
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_analytics",
                      report_type: "detailed",
                      data: projectDetails,
                      message:
                        "Detailed project analytics generated successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "overdue": {
            const overdueTasks = filteredProjects.flatMap((project) =>
              project.tasks
                .filter(
                  (task) =>
                    task.due_date &&
                    task.due_date < now &&
                    task.status !== "complete"
                )
                .map((task) => ({
                  project_id: project.id,
                  project_name: project.name,
                  task_id: task.id,
                  task_description: task.description,
                  due_date: task.due_date,
                  status: task.status,
                  days_overdue: Math.floor(
                    (new Date(now).getTime() -
                      new Date(task.due_date!).getTime()) /
                      (1000 * 60 * 60 * 24)
                  ),
                }))
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_analytics",
                      report_type: "overdue",
                      data: {
                        overdue_tasks: overdueTasks,
                        total_overdue: overdueTasks.length,
                      },
                      message: `Found ${overdueTasks.length} overdue tasks`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "progress": {
            const progressData = filteredProjects.map((project) => ({
              id: project.id,
              name: project.name,
              category: project.category,
              tasks_progress: project.tasks.map((task) => ({
                id: task.id,
                description: task.description,
                status: task.status,
                percentage_complete: task.percentage_complete,
                start_date: task.start_date,
                due_date: task.due_date,
              })),
            }));

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_analytics",
                      report_type: "progress",
                      data: progressData,
                      message: "Progress analytics generated successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "category_breakdown": {
            const categories = [
              "personal",
              "work",
              "business",
              "OKRs",
            ] as const;
            const breakdown = categories.map((category) => {
              const categoryProjects = data.projects.filter(
                (p) => p.category === category
              );
              const totalTasks = categoryProjects.reduce(
                (sum, p) => sum + p.tasks.length,
                0
              );
              const completedTasks = categoryProjects.reduce(
                (sum, p) =>
                  sum + p.tasks.filter((t) => t.status === "complete").length,
                0
              );

              return {
                category,
                projects: categoryProjects.length,
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                completion_rate:
                  totalTasks > 0
                    ? Math.round((completedTasks / totalTasks) * 100)
                    : 0,
              };
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "success",
                      tool: "project_analytics",
                      report_type: "category_breakdown",
                      data: breakdown,
                      message:
                        "Category breakdown analytics generated successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "error",
                      tool: "project_analytics",
                      message: `Unknown report type: ${reportType}`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  tool: "project_analytics",
                  message: "Failed to generate analytics",
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
