import { Plugin, App, PluginSettingTab, Setting, WorkspaceLeaf, ItemView } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AsyncResearchApi, ApiSettings } from './src/api';
import { AppProvider } from './src/contexts/AppContext';
import { AsyncResearchView } from './src/components/AsyncResearchView';
import 'katex/dist/katex.min.css';

interface ResearchFramesSettings extends ApiSettings {
	backendUrl: string;
	username: string;
	password: string;
	token: string;
}

const DEFAULT_SETTINGS: ResearchFramesSettings = {
	backendUrl: 'http://localhost:8000',
	username: '',
	password: '',
	token: ''
};

const VIEW_TYPE_RESEARCH_FRAMES = 'research-frames-view';

class ResearchFramesView extends ItemView {
	private root: Root | null = null;
	private plugin: ResearchFramesPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: ResearchFramesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_RESEARCH_FRAMES;
	}

	getDisplayText(): string {
		return 'Research Frames';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		
		const rootEl = container.createDiv();
		this.root = createRoot(rootEl);
		
		const api = new AsyncResearchApi(this.plugin.settings);
		
		this.root.render(
			React.createElement(AppProvider, {
				app: this.app,
				plugin: this.plugin,
				api: api,
				children: React.createElement(AsyncResearchView)
			})
		);
	}

	getIcon(): string {
		return 'brain-circuit';
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}
}

export default class ResearchFramesPlugin extends Plugin {
	settings: ResearchFramesSettings;

	async onload() {
		await this.loadSettings();

		// Register view
		this.registerView(
			VIEW_TYPE_RESEARCH_FRAMES,
			(leaf) => new ResearchFramesView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('brain-circuit', 'Research Frames', () => {
			this.activateView();
		});

		// Add command
		this.addCommand({
			id: 'open-research-frames',
			name: 'Open Research Frames',
			callback: () => {
				this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new ResearchFramesSettingTab(this.app, this));
	}

	onunload() {
		// Clean up
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_RESEARCH_FRAMES);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_RESEARCH_FRAMES, active: true });
		}

		workspace.revealLeaf(leaf!);
	}
}

class ResearchFramesSettingTab extends PluginSettingTab {
	plugin: ResearchFramesPlugin;

	constructor(app: App, plugin: ResearchFramesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Backend URL')
			.setDesc('URL of the research frames backend API')
			.addText(text => text
				.setPlaceholder('http://localhost:8000')
				.setValue(this.plugin.settings.backendUrl)
				.onChange(async (value) => {
					this.plugin.settings.backendUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Username')
			.setDesc('Your username for the research frames service')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Password')
			.setDesc('Your password for the research frames service')
			.addText(text => {
				text.inputEl.type = 'password';
				return text
					.setPlaceholder('Enter your password')
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
					});
			});
	}
}