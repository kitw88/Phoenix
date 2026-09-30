# Dataset belongs to a Workflow

A Dataset was first treated as the property of one Prompt. That split badly once Prompts formed a Workflow: the Cases are the starting Input of the chain, and later steps see the previous Output rather than those Cases. A Dataset belongs to one Workflow and is stored with that Workflow's pinned Prompt Versions and API Targets. A Prompt used on its own is a one-step Workflow, so classification still has its own Cases and product-label Expectations.
