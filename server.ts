import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  
  // High-fidelity Socket.IO setup
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });

  const PORT = 3000;
  let activeUsers = 0;

  app.use(express.json());

  // Real-time Event Relays
  // These endpoints can be used by the client to trigger global UI updates
  // while the persistent data stays in Firestore.
  app.post("/api/realtime/sync-bookings", (req, res) => {
    io.emit("bookingsUpdated");
    res.json({ success: true });
  });

  app.post("/api/realtime/sync-tournaments", (req, res) => {
    io.emit("tournamentsUpdated");
    res.json({ success: true });
  });

  // Socket.io connection logic for Presence
  io.on("connection", (socket) => {
    activeUsers++;
    io.emit("presenceUpdate", { count: activeUsers });
    console.log(`[Socket] Client connected. Active: ${activeUsers}`);
    
    // Relay broadcast messages from one client to others
    socket.on("bookingChanged", () => {
      socket.broadcast.emit("bookingsUpdated");
    });

    socket.on("disconnect", () => {
      activeUsers = Math.max(0, activeUsers - 1);
      io.emit("presenceUpdate", { count: activeUsers });
      console.log(`[Socket] Client disconnected. Active: ${activeUsers}`);
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
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Georgopol Full-Stack Bridge running on http://localhost:${PORT}`);
  });
}

startServer();
