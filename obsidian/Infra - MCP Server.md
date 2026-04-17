---
tags: [infra, mcp, ai, claude]
---

# Infra — MCP Server

Path: `backend/src/mcp/`

## Что такое MCP

Model Context Protocol — стандарт для интеграции AI-клиентов (Claude, Cursor) с внешними сервисами.

Зависимость: `@modelcontextprotocol/sdk ^1.29.0`

## Назначение

MCP-сервер TaskTime позволяет AI-клиентам (например Claude Code):
- Читать задачи, проекты, спринты
- Создавать и обновлять задачи
- Логировать время
- Менять статусы через workflow engine

## Связи

- [[Module - AI]] — AI-модуль, использует Claude API
- [[Module - Issues]] — задачи доступны через MCP
- [[Module - Time Tracking]] — тайм-логи через MCP
- [[Backend Architecture]] — MCP как часть backend
