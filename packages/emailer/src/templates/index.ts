import * as Schema from "effect/Schema";
import type { ComponentType } from "react";
import { ArtifactKind } from "@avenire/contracts";

import CloudRunFailed from "./CloudRunFailed.tsx";
import MorningDigest from "./MorningDigest.tsx";
import ResetPassword from "./ResetPassword.tsx";
import VerifyEmail from "./VerifyEmail.tsx";

export const TemplatePropsSchema = {
  "verify-email": Schema.Struct({ name: Schema.String, url: Schema.String }),
  "reset-password": Schema.Struct({ name: Schema.String, url: Schema.String }),
  "morning-digest": Schema.Struct({
    name: Schema.String,
    date: Schema.String,
    itemsStudied: Schema.Number,
    artifacts: Schema.Array(Schema.Struct({ kind: ArtifactKind, title: Schema.String, url: Schema.String })),
  }),
  "cloud-run-failed": Schema.Struct({ name: Schema.String, reason: Schema.String, retryUrl: Schema.String }),
};

export type TemplateName = keyof typeof TemplatePropsSchema;
export type TemplateProps<N extends TemplateName> = typeof TemplatePropsSchema[N]["Type"];
type EmailTemplate<N extends TemplateName> = ComponentType<TemplateProps<N>> & { readonly PreviewProps: TemplateProps<N> };

export const templates: { readonly [N in TemplateName]: EmailTemplate<N> } = {
  "verify-email": VerifyEmail,
  "reset-password": ResetPassword,
  "morning-digest": MorningDigest,
  "cloud-run-failed": CloudRunFailed,
};

export const subjects: { readonly [N in TemplateName]: (props: TemplateProps<N>) => string } = {
  "verify-email": () => "Confirm your Avenire email",
  "reset-password": () => "Reset your Avenire password",
  "morning-digest": ({ date }) => `Your Avenire study digest · ${date}`,
  "cloud-run-failed": () => "Your Avenire study run needs attention",
};
