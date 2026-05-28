#!/bin/bash
curl -X POST http://localhost:3001/api/requirements \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary '{"title":"中文测试","desc":"内容"}'
