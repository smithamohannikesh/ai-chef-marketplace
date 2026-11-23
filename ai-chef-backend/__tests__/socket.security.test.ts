import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type { Server as SocketIOServer } from "socket.io";
import { initializeSocket } from "../socket";

const secret = () => process.env.JWT_SECRET!;

function accessToken() {
  return jwt.sign({ userId: 41 }, secret(), { expiresIn: "1h" });
}

function refreshToken() {
  return jwt.sign({ userId: 41, type: "refresh" }, secret(), {
    expiresIn: "7d",
  });
}

describe("Socket.IO authentication", () => {
  let httpServer: HttpServer;
  let socketServer: SocketIOServer;
  let socketClient: ClientSocket | undefined;
  let socketUrl: string;

  beforeEach(async () => {
    httpServer = createServer();
    socketServer = initializeSocket(httpServer);
    socketServer.on("connection", (socket) => {
      socket.emit("authenticated", socket.data.userId);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address() as AddressInfo;
    socketUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    socketClient?.disconnect();
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  });

  test("accepts an existing access token and exposes its user ID to the server", async () => {
    socketClient = createClient(socketUrl, {
      autoConnect: false,
      auth: { token: accessToken() },
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
    });

    const authenticatedUserId = new Promise<number>((resolve) => {
      socketClient!.once("authenticated", resolve);
    });
    socketClient.connect();

    await expect(authenticatedUserId).resolves.toBe(41);
  });

  test.each([
    ["missing", undefined],
    ["invalid", "not-a-jwt"],
    ["refresh", refreshToken()],
  ])("rejects a %s token", async (_kind, token) => {
    socketClient = createClient(socketUrl, {
      autoConnect: false,
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
    });

    const connectionError = new Promise<Error>((resolve) => {
      socketClient!.once("connect_error", resolve);
    });
    socketClient.connect();

    await expect(connectionError).resolves.toMatchObject({
      message: "Unauthorized",
    });
  });
});
