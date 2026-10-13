# Avenire

Avenire is a TypeScript/pnpm knowledge-base monorepo with Ruth chat, background Cloud tasks, and interactive learning figures. See [AGENTS.md](AGENTS.md) for the package layout and development conventions.

## Interactive figures

Ruth's `explainer` skill combines a restrained visual language with numerical modelling. Simple physical systems such as pendulums use direct simulations; machines use their actual mechanisms and cutaways; abstract concepts use analogies when they make the causal relationship clearer. Widgets stay concise, with explanation and derivations in chat. Failed previews are repaired and previewed again before delivery.

Our figure styling, isometric components, craft principles and source examples derive from [Anatomy by Ryan / wheresryan22](https://github.com/wheresryan22/anatomy), MIT licensed, pinned at `dbf697a527bbf7d358668e1557cb1e35ff725d46`. Attribution belongs here and in the vendored README/LICENSE, rather than the model-facing skill names or bodies. The adapted pinned source toolchain lives in `packages/cloud/assets/figures/` and `/opt/avenire/figures` in snapshot v6; the browser runtime is in `packages/widget-kit/src/iso/`. See [the source license](packages/cloud/assets/figures/LICENSE) and [widget-kit attribution](packages/widget-kit/README.md).

The math runtime includes MIT-licensed [pmndrs/math](https://github.com/pmndrs/math) plus our numerical solvers; see `packages/widget-kit/src/math/LICENSE` and `packages/widget-kit/API.md`. Widget figure tokens use the neutral `--figure-*` namespace; runtime and example sources use that same namespace. App shadcn colours are separate.

Chat and Cloud have no model step-count cap. They continue until a final answer/report, approval boundary, cancellation or an existing runtime/resource limit. Sandbox commands remain bounded; Cloud spend/action and wall-clock limits remain in place. Failed previews return diagnostics and screenshots to the same model for repair, without a separate fixer agent.
