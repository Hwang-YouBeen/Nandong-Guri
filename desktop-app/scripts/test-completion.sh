#!/bin/sh

set -eu

BRIDGE="http://127.0.0.1:43119"

printf 'Bridge: '
curl -fsS "$BRIDGE/health"
printf '\nSending test completion event...\n'
curl -fsS -X POST "$BRIDGE/complete" \
  -H 'Content-Type: application/json' \
  --data '{"service":"ChatGPT","url":"https://chatgpt.com/","title":"난동구리 수동 테스트","alreadyViewing":false}'
printf '\nDone. The raccoon should appear now.\n'
