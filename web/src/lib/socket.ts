import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  const token = getAccessToken();

  if (!socketInstance || socketInstance.disconnected) {
    socketInstance = io(SOCKET_URL, {
      auth: {
        token: token ? `Bearer ${token}` : "",
      },
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
