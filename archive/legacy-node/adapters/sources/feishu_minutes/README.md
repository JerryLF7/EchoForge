# Feishu Minutes Source Adapter

This adapter is responsible for discovering Feishu Minutes recordings and normalizing them into EchoForge source items.

Implementation notes:
- discovery and download logic can be imported from `feishu_minutes_sync` later
- this adapter should emit stable source records, not full pipeline outputs
- authentication and secrets stay outside the repository
