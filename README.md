# Agentic Chat

Multi-modal Agentic chat platform with intelligent query routing, semantic caching, and autonomous agent orchestration.

## Overview

A scalable conversational AI system that implements dynamic query classification and routing to specialized handlers. The architecture supports multi-modal interactions including text generation, image synthesis, document intelligence, and autonomous research capabilities while maintaining conversational state through semantic caching layers.

## Architecture

**BYOK (Bring Your Own Key) - Security First**  
Industry-leading security model where API keys never leave the user's browser. Client-side OpenAI SDK integration ensures direct browser-to-OpenAI communication with zero server exposure.

**Semantic Caching Layer**  
Implements semantic similarity-based response caching for text conversations. Supports BYOK (Bring Your Own Key) model providers including OpenAI and Gemini APIs for inference flexibility.

**Query Classification & Routing**  
Decision node analyzes incoming queries and routes to appropriate handlers based on intent classification. Supports dynamic switching between agent invocation and direct response paths.

**Document Intelligence (RAG + OCR)**  
Retrieval-Augmented Generation system with re-ranking for improved relevance. OCR pipeline processes document images and scans through async queue architecture for scalability.

**Autonomous Research Agent**  
Opt-in research mode that performs multi-step information gathering and synthesis. Operates in isolated mode with web search capabilities. Supports export to Notion API, Google Docs API, DOCX, and Markdown formats.

**Multi-Agent Workflows**  
Distributed agent orchestration framework enabling async collaboration between specialized agents. Agents maintain access to RAG, web search, and OCR subsystems with mutual exclusion from research mode.
