# Research Frames — Obsidian Plugin

The user-facing interface for Research Frames. A React/TypeScript Obsidian plugin that lets researchers set their research interest, select notes and PDFs from their vault, and browse AI-generated research frames in real time.

## Setup

### Prerequisites
- Node.js (v16+)
- Backend services running (see `obsidian_plugin_backend/`)

### Install

**Development:**
```bash
# Clone into your vault's plugin directory
cd <vault>/.obsidian/plugins/
git clone <repo> research-frames
cd research-frames/obsidian_plugin
npm install
npm run dev
```

**Manual:**
Copy `main.js`, `styles.css`, and `manifest.json` into `<vault>/.obsidian/plugins/research-frames/`.

### Run
1. Enable the plugin in Obsidian → Settings → Community Plugins.
2. Configure the backend URL in the plugin settings.
3. Log in, set your research interest, select notes/PDFs, and generate frames.
