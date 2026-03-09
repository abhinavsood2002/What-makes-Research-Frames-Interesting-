# Handlers 
Any class/file in the Handlers module "handles" interaction with external api's and or frameworks to produce output for functions/algorithms in the program.

At the time of writing this document (7th May 2025), there are four proposed handlers:
1. ExternalLiteratureHandler to handle links to any external literature. Initially will be limited to OpenAlex
2. EmbeddingsHandler to handle the generation of embeddings from text. Confined to sentence transformers library, will need to support OpenAI
3. LLMHandler to handle any requests made to an llm. Initially will support vLLM and then anything extra.
4. ObsidianHandler, different to other handlers, collection of functions handle recieved data from obsidian into usable formats.