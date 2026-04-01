export interface ResolvedSubagentAgent {
	name: string;
	model?: string;
}

export interface ResolveSubagentModelOptions {
	overrideModel?: string;
	parentModel?: { provider: string; id: string };
}

export function resolveSubagentModel(
	agent: ResolvedSubagentAgent,
	options: ResolveSubagentModelOptions = {},
): string | undefined {
	const overrideModel = options.overrideModel?.trim();
	if (overrideModel) return overrideModel;

	const agentModel = agent.model?.trim();
	if (agentModel) return agentModel;

	if (options.parentModel?.provider && options.parentModel?.id) {
		return `${options.parentModel.provider}/${options.parentModel.id}`;
	}

	return undefined;
}
