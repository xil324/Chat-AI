from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
from typing import List
import uvicorn
import os

app = FastAPI(title="Reranker Service")

MODEL_NAME = os.getenv(
    "RERANKER_MODEL",
    "cross-encoder/ms-marco-MiniLM-L-6-v2",
)
model: CrossEncoder = None


@app.on_event("startup")
async def load_model():
    global model
    print(f"Loading reranker model: {MODEL_NAME}")
    model = CrossEncoder(MODEL_NAME)
    print("Reranker model loaded.")


class RerankRequest(BaseModel):
    query: str
    passages: List[str]
    top_k: int = 5


class RerankResult(BaseModel):
    index: int
    passage: str
    score: float


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "ready": model is not None}


@app.post("/rerank")
def rerank(req: RerankRequest):
    if not req.passages:
        return {"results": []}

    pairs = [(req.query, p) for p in req.passages]
    scores = model.predict(pairs).tolist()

    results = [
        {"index": i, "passage": req.passages[i], "score": scores[i]}
        for i in range(len(req.passages))
    ]
    results.sort(key=lambda x: x["score"], reverse=True)

    return {"results": results[: req.top_k]}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port)