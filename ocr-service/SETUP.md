# Getting `OCR_SERVICE_URL` and `OCR_SERVICE_KEY`

These two values are not issued by anyone. There is no signup, no dashboard, no API console.

- **`OCR_SERVICE_KEY`** is a password **you invent**. You put the same string in two places:
  the OCR service's environment and the bot's environment.
- **`OCR_SERVICE_URL`** is wherever **you deploy** `ocr-service/`.

With both values blank, `/matchresult` accepts the screenshot and tells staff to record the
result with `/matchscore`. Everything else works without OCR.

## Step 1 — Generate the key

```bash
openssl rand -hex 32
```

## Step 2 — Pick where the service runs

PaddleOCR-VL is a vision-language model and wants a GPU. It runs on CPU, but slowly.
The bot's own free-tier VM is not a candidate — the model must run as a separate service.

| Option | Roughly | Good for |
|---|---|---|
| RunPod / Vast.ai serverless GPU | ~$0.20–0.60/hr while active | Real leagues |
| Hugging Face Spaces (GPU tier) | ~$0.60/hr, free CPU tier exists | Trying it out |
| A second VPS with a GPU | ~€180+/mo | High volume |
| Your own machine + Cloudflare Tunnel | free | Testing |
| Railway / Render / Fly.io (CPU) | ~$5–20/mo | Low volume, patient staff |

## Step 3 — Deploy

```bash
cd ocr-service
pip install -r requirements.txt
pip install paddleocr paddlepaddle
export OCR_SERVICE_KEY=<the key from step 1>
uvicorn main:app --host 0.0.0.0 --port 8000
```

Confirm: `curl http://localhost:8000/health` → `{"status":"ok", "modelLoaded":true}`.

Docker option — build a `Dockerfile` with `python:3.12-slim`, install `libgl1 libglib2.0-0`,
`pip install -r requirements.txt paddleocr paddlepaddle`, `EXPOSE 8000`,
`CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]`.

## Step 4 — Verify from outside

```bash
curl https://your-ocr-host/health
curl -X POST https://your-ocr-host/extract -H "Content-Type: application/json" \
  -d '{"image_url":"https://example.com/x.png","match_id":"TEST"}'
# Expect 401 without the key, a valid response with it.
```

## Step 5 — Point the bot at it

```dotenv
OCR_SERVICE_URL=https://your-ocr-host
OCR_SERVICE_KEY=<same key>
OCR_TIMEOUT_MS=60000
```

Restart: `sudo systemctl restart uml-bot`

## Step 6 — Turn the pipeline on

```
/config toggle key:screenshot_ocr_pipeline value:true
```

## Step 7 — Test end to end

Register two teams, `/matchregister`, `/matchconfirm`, then
`/matchresult match_id:<id> screenshot:<scoreboard>`, then `/matchapprove`.

## Troubleshooting

- **"OCR is not enabled on this server"** — toggle is off, or `OCR_SERVICE_URL` is blank.
- **"The OCR service could not be reached"** — check `/health`, confirm the URL is public.
- **HTTP 401** — the keys differ between bot and service.
- **HTTP 503** — the model hasn't loaded; check service logs.
- **"Not a CODM scoreboard" always** — usually a cropped/low-res screenshot.
- **Slow** — you're on CPU; raise `OCR_TIMEOUT_MS` or move to GPU.

## Security notes

Rotate by changing the key on the service, then the bot, then restarting both — there's no
revocation list, the key *is* the access. The service is stateless: a compromise leaks
compute, not data. The bot never logs the key.
