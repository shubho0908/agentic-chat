# Agentic Chat

Multi-modal Agentic chat platform with intelligent query routing, semantic caching, and autonomous agent orchestration.

## Overview

A scalable conversational AI system that implements dynamic query classification and routing to specialized handlers. The architecture supports multi-modal interactions including text generation, image synthesis, document intelligence, and autonomous research capabilities while maintaining conversational state through semantic caching layers.

## Architecture

**BYOK (Bring Your Own Key) - Enterprise-Grade Security**  
Production-ready security architecture with AES-256-GCM encrypted API key storage in PostgreSQL. Server-side proxy handles all OpenAI communications, eliminating client-side key exposure and enabling rate limiting, usage tracking, and cost management.

**Semantic Caching Layer**  
Implements semantic similarity-based response caching for text conversations. Supports BYOK (Bring Your Own Key) with OpenAI API for flexible model selection and inference.

**Query Classification & Routing**  
Decision node analyzes incoming queries and routes to appropriate handlers based on intent classification. Supports dynamic switching between agent invocation and direct response paths.

**Document Intelligence (RAG + OCR)**  
Retrieval-Augmented Generation system with re-ranking for improved relevance. OCR pipeline processes document images and scans through async queue architecture for scalability.

**Autonomous Research Agent**  
Opt-in research mode that performs multi-step information gathering and synthesis. Operates in isolated mode with web search capabilities. Supports export to Notion API, Google Docs API, DOCX, and Markdown formats.

**Multi-Agent Workflows**  
Distributed agent orchestration framework enabling async collaboration between specialized agents. Agents maintain access to RAG, web search, and OCR subsystems with mutual exclusion from research mode.
