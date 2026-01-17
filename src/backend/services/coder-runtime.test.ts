import { describe, expect, test, mock } from "bun:test";
import { ProjectService } from "./project-service";
import { QuestionRegistry } from "./question-registry";

class MockDockerode {}

mock.module("dockerode", () => ({ default: MockDockerode }));

const { DockerManager } = await import("./docker-manager.ts");
const { getDockerManager, projectService, questionRegistry } = await import("./coder-runtime");

describe("coder-runtime", () => {
  test("getDockerManager returns a singleton instance", () => {
    const first = getDockerManager();
    const second = getDockerManager();

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(DockerManager);
  });

  test("exports initialized registries", () => {
    expect(projectService).toBeInstanceOf(ProjectService);
    expect(questionRegistry).toBeInstanceOf(QuestionRegistry);
  });
});
