# OCR Microservice

PaddleOCR-VL scoreboard extraction, hosted separately from the bot.

It is intentionally not part of the bot's process or its hosting budget. The bot calls it
over HTTP, and if it is down, result submission falls back to manual entry.

## Run

```bash
pip install -r requirements.txt
pip install paddleocr paddlepaddle
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Environment

| Variable | Purpose |
|---|---|
| `OCR_SERVICE_KEY` | Bearer token — set it, or the endpoint is open. |
| `OCR_MODEL_ID` | Defaults to `PaddlePaddle/PaddleOCR-VL` |
| `MAX_IMAGE_BYTES` | Upload ceiling, default 12 MB |

Point the bot at it with `OCR_SERVICE_URL` and `OCR_SERVICE_KEY`, then enable the pipeline
with `/config toggle screenshot_ocr_pipeline true`.

## Endpoints

`GET /health` — 503 while the model is unloaded.
`POST /extract` — `{ image_url, match_id, expected_mode? }` → the OCR JSON contract.

## What this service does not do

It does not score (`teamPointsPreview.authoritative` is always `false`), does not map
anonymous identifiers to registered players, and does not decide the winner from side
colour — only from the final score. All authoritative scoring happens in the TypeScript
backend.
