from fastapi import FastAPI
app = FastAPI()
@app.get("/")
async def index():
    return{"message": "Hello from Coding Crane. Hope you like the video"}