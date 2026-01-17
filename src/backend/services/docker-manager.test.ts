import { describe, expect, test, beforeEach, mock } from "bun:test";
import { PassThrough } from "stream";

interface ExecStartOptions {
  hijack: boolean;
  stdin: boolean;
}

interface ExecInspectResult {
  ExitCode?: number | null;
}

interface ExecResizeOptions {
  h: number;
  w: number;
}

interface ExecConfig {
  Cmd: string[];
  AttachStdout: boolean;
  AttachStderr: boolean;
  WorkingDir: string;
}

interface ContainerCreateOptions {
  Image: string;
  Cmd: string[];
  WorkingDir: string;
  AttachStdout: boolean;
  AttachStderr: boolean;
  Tty: boolean;
  HostConfig: {
    AutoRemove: boolean;
  };
}

interface MockExec {
  start: (options: ExecStartOptions) => Promise<NodeJS.ReadableStream>;
  inspect: () => Promise<ExecInspectResult>;
  resize: (size: ExecResizeOptions) => Promise<void>;
}

interface MockContainer {
  id: string;
  modem?: {
    demuxStream: (source: NodeJS.ReadableStream, stdout: PassThrough, stderr: PassThrough) => void;
  };
  start: () => Promise<void>;
  exec: (opts: ExecConfig) => Promise<MockExec>;
  stop: (opts: { t: number }) => Promise<void>;
  remove: (opts: { force: boolean }) => Promise<void>;
  putArchive: (stream: NodeJS.ReadableStream, opts: { path: string }) => Promise<void>;
  getArchive: (opts: { path: string }) => Promise<NodeJS.ReadableStream>;
}

type CreateContainerFn = (opts: ContainerCreateOptions) => Promise<MockContainer>;

const createContainerMock = mock<CreateContainerFn>(async (_opts) => {
  throw new Error("mock not configured");
});

class MockDockerode {
  createContainer = createContainerMock;
}

mock.module("dockerode", () => ({ default: MockDockerode }));

const { DockerManager } = await import("./docker-manager.ts");

describe("DockerManager", () => {
  let mockContainer: MockContainer;
  let execMock: ReturnType<typeof mock>;
  let execStartMock: ReturnType<typeof mock>;
  let execInspectMock: ReturnType<typeof mock>;
  let stopMock: ReturnType<typeof mock>;
  let removeMock: ReturnType<typeof mock>;
  let demuxStream: (
    source: NodeJS.ReadableStream,
    stdout: PassThrough,
    stderr: PassThrough,
  ) => void;

  beforeEach(() => {
    const stream = new PassThrough();
    execStartMock = mock(async (_options: ExecStartOptions) => stream);
    execInspectMock = mock(async () => ({ ExitCode: 0 }));
    const resizeMock = mock(async (_size: ExecResizeOptions) => {});

    const execInstance: MockExec = {
      start: execStartMock,
      inspect: execInspectMock,
      resize: resizeMock,
    };

    execMock = mock(async (_opts: ExecConfig) => execInstance);

    stopMock = mock(async (_opts: { t: number }) => {});
    removeMock = mock(async (_opts: { force: boolean }) => {});

    demuxStream = (_source: NodeJS.ReadableStream, stdout: PassThrough, stderr: PassThrough) => {
      stdout.write("hello");
      stdout.end();
      stderr.write("oops");
      stderr.end();
    };

    mockContainer = {
      id: "container-id",
      modem: { demuxStream },
      start: mock(async () => {}),
      exec: execMock,
      stop: stopMock,
      remove: removeMock,
      putArchive: mock(async () => {}),
      getArchive: mock(async () => new PassThrough()),
    };

    createContainerMock.mockClear();
    createContainerMock.mockImplementation(async (_opts: ContainerCreateOptions) => mockContainer);
  });

  test("getOrCreateContainer caches containers", async () => {
    const manager = new DockerManager();

    const first = await manager.getOrCreateContainer("conv-1");
    const second = await manager.getOrCreateContainer("conv-1");

    expect(first).toBe(second);
    expect(createContainerMock).toHaveBeenCalledTimes(1);
  });

  test("execCommand captures stdout and stderr", async () => {
    const manager = new DockerManager();

    const result = await manager.execCommand({
      conversationId: "conv-2",
      command: "echo hi",
    });

    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("oops");
    expect(result.exitCode).toBe(0);

    const execCall = execMock.mock.calls[0]?.[0];
    if (!execCall) throw new Error("Expected exec to be called");
    expect(execCall.WorkingDir).toBe("/workspace");
  });

  test("cleanupExpired destroys idle containers", async () => {
    const manager = new DockerManager();

    await manager.getOrCreateContainer("conv-3");
    const internal = manager as unknown as {
      containers: Map<string, { lastUsedAt: number }>;
    };
    const entry = internal.containers.get("conv-3");
    if (!entry) throw new Error("Expected container entry");
    entry.lastUsedAt = Date.now() - 31 * 60 * 1000;

    await manager.cleanupExpired();

    expect(stopMock).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();
    expect(internal.containers.has("conv-3")).toBe(false);
  });
});
