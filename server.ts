import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // State
  const officers = new Map(); // socketId -> { name, language, district }
  const pendingRequests = new Map(); // socketId -> { farmerName, language, district }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Officer joins
    socket.on("officer:join", (data) => {
      officers.set(socket.id, { ...data, socketId: socket.id });
      io.emit("officers:update", Array.from(officers.values()));
    });

    // Farmer requests connection
    socket.on("farmer:request", (data) => {
      pendingRequests.set(socket.id, { ...data, socketId: socket.id });
      io.emit("requests:update", Array.from(pendingRequests.values()));
    });

    // Farmer cancels request
    socket.on("farmer:cancel", () => {
      pendingRequests.delete(socket.id);
      io.emit("requests:update", Array.from(pendingRequests.values()));
    });

    // Officer accepts request
    socket.on("officer:accept", ({ farmerSocketId }) => {
      const farmerRequest = pendingRequests.get(farmerSocketId);
      if (farmerRequest) {
        pendingRequests.delete(farmerSocketId);
        io.emit("requests:update", Array.from(pendingRequests.values()));
        
        // Notify farmer that an officer accepted
        io.to(farmerSocketId).emit("officer:accepted", {
          officerSocketId: socket.id,
          officerName: officers.get(socket.id)?.name || "Krishi Officer"
        });
      }
    });

    // WebRTC Signaling
    socket.on("signal", ({ to, signal }) => {
      io.to(to).emit("signal", { from: socket.id, signal });
    });

    socket.on("disconnect", () => {
      if (officers.has(socket.id)) {
        officers.delete(socket.id);
        io.emit("officers:update", Array.from(officers.values()));
      }
      if (pendingRequests.has(socket.id)) {
        pendingRequests.delete(socket.id);
        io.emit("requests:update", Array.from(pendingRequests.values()));
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
