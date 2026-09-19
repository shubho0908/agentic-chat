# RAG quality and evaluation

The production ranking path uses semantic retrieval plus PostgreSQL lexical retrieval, RRF fusion, and Cohere reranking. Query rewrites are fused with RRF instead of short-circuiting. `RAG_LEXICAL_LANGUAGE` selects PostgreSQL's text-search configuration and defaults to `english`.

`npm run eval:rag` reports Recall@K, MRR, and nDCG@10 from a labeled JSON fixture. The checked-in fixture is a deterministic harness smoke test, not a production-quality claim. Add representative queries and stable chunk IDs from the application's document domains before setting release thresholds.

The Jev passage gate is a separate post-rerank seam. `JEV_PASSAGE_GATE_MODE=shadow` records relevance, usable-evidence, contradiction, and prompt-injection decisions without filtering. `active` filters confident failures, fails open on provider errors. If all passages are rejected, retrieval returns no evidence rather than reintroducing unsafe passages. Default is `off`. Store `TYPESAFE_API_KEY` only in deployment secrets.
