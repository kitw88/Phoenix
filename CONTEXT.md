# Prompt Evaluation

The record of how a prompt is worded, which model endpoint it runs on, and which cases decide whether a new wording passes.

## Language

### System

**Prompt Evaluation System**:
The record of Prompts, Workflows, Datasets, and Runs.
_Avoid_: Postman, manual client

**Manual client**:
A hand-operated client that holds a copy of one Prompt's text and one API Target. Postman is the manual client.
_Avoid_: Prompt Evaluation System, Dataset

### Prompts and endpoints

**API Target**:
One callable model endpoint, identified by its model version. DeepSeek 4.0 and DeepSeek 4.1 are two API Targets.
_Avoid_: Prompt Version, model version as a kind of Prompt

**Prompt**:
A stable task, such as structured-product classification.
_Avoid_: Prompt Version, Draft, API Target

**Prompt Version**:
The immutable wording of a Prompt after it is published.
_Avoid_: Draft, API Target

**Draft**:
The editable wording of a Prompt before publication.
_Avoid_: Prompt Version

### Execution

**Run**:
One execution of one Prompt Version on one API Target against one Input.
_Avoid_: Workflow Run

**Output**:
The model's answer on a Run. Comparison uses Output.
_Avoid_: Reasoning

**Reasoning**:
The model's thinking trace on a Run, kept for inspection.
_Avoid_: Output, Expectation

**Expectation**:
The Output field a Prompt names for comparison. For classification, that field is the product label.
_Avoid_: matched features, the whole JSON document

**A/B Test**:
An optional comparison of two Prompt Versions of the same Prompt, on one API Target, over the same labeled Cases.
_Avoid_: a comparison of two API Targets

### Workflow and cases

**Workflow**:
An ordered list of steps. Each step pins one Prompt Version and one API Target. A single Prompt is a one-step Workflow.
_Avoid_: an unpinned latest version

**Workflow Run**:
One pass through a Workflow. A step's Input is the previous step's Output.
_Avoid_: Run

**Dataset**:
The Cases that belong to one Workflow, stored with that Workflow's pinned steps.
_Avoid_: a Dataset per Prompt, a Dataset in the manual client

**Case**:
One Dataset entry: an Input and, when set, an Expectation.
_Avoid_: Run

**Input**:
The text or page images a Run sends to the model. Page images stand in when a document yields no text, or when a person marks the extraction incomplete.
_Avoid_: the stored original file, Reasoning
