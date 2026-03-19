from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List
import uvicorn
import os

app = FastAPI(title="Embedding Service")

MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
model: SentenceTransformer = None


@app.on_event("startup")
async def load_model():
    global model
    print(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    print("Embedding model loaded.")


class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: List[str]


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "ready": model is not None}


@app.post("/embed")
def embed(req: EmbedRequest):
    vector = model.encode(req.text, normalize_embeddings=True).tolist()
    return {"embedding": vector, "dims": len(vector)}


@app.post("/embed/batch")
def embed_batch(req: EmbedBatchRequest):
    if not req.texts:
        return {"embeddings": [], "dims": 0}
    vectors = model.encode(req.texts, normalize_embeddings=True).tolist()
    return {"embeddings": vectors, "dims": len(vectors[0])}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)