# Hidden Hours

The Claude API integration is done. Patterns live in lib/claude.js (client, provider detection, streaming), lib/research.js (tool loops) and lib/dossier.js (JSON output). Copy those patterns for routine edits.

Do not load the /claude-api skill unless the task needs an API feature the code doesn't use yet (new tool type, new model parameter, a new provider). It is large and expensive to load.
