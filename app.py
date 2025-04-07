from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
import uuid
from typing import Dict, List

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="."), name="static")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.users: Dict[str, str] = {}  # user_id -> username
        
    async def connect(self, websocket: WebSocket, user_id: str, username: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.users[user_id] = username
        
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.users:
            del self.users[user_id]
            
    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)
            
    async def broadcast_except_sender(self, message: str, sender_id: str):
        for user_id, connection in self.active_connections.items():
            if user_id != sender_id:
                await connection.send_text(message)

manager = ConnectionManager()

# Serve the HTML file
@app.get("/", response_class=HTMLResponse)
async def get():
    with open("index.html", "r") as f:
        return f.read()

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = str(uuid.uuid4())
    username = None
    
    try:
        await websocket.accept()
        
        # First message should be a join message with username
        data = await websocket.receive_text()
        data = json.loads(data)
        
        if data["type"] == "join":
            username = data["username"]
            await manager.connect(websocket, user_id, username)
            
            # Notify all clients about the new user
            await manager.broadcast(
                json.dumps({
                    "type": "user_joined",
                    "userId": user_id,
                    "username": username,
                    "timestamp": "now"  # In a real app, use a proper timestamp
                })
            )
            
            # Send current users to the new client
            for uid, uname in manager.users.items():
                if uid != user_id:
                    await websocket.send_text(
                        json.dumps({
                            "type": "user_joined",
                            "userId": uid,
                            "username": uname,
                            "timestamp": "now"
                        })
                    )
        
        # Handle messages
        while True:
            data = await websocket.receive_text()
            data_json = json.loads(data)
            
            # Broadcast the message to all clients except the sender
            await manager.broadcast_except_sender(data, user_id)
            
    except WebSocketDisconnect:
        if username:
            manager.disconnect(user_id)
            
            # Notify all clients about the user leaving
            await manager.broadcast(
                json.dumps({
                    "type": "user_left",
                    "userId": user_id,
                    "username": username,
                    "timestamp": "now"
                })
            )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

