import { DockerManager } from "@/backend/services/docker-manager";
import { ProjectService } from "@/backend/services/project-service";
import { QuestionRegistry } from "@/backend/services/question-registry";

export const projectService = new ProjectService();
export const questionRegistry = new QuestionRegistry();

let dockerManager: DockerManager | null = null;

export function getDockerManager() {
  if (!dockerManager) dockerManager = new DockerManager();
  return dockerManager;
}
