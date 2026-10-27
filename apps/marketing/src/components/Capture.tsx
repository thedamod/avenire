import arxiv from "../assets/source-arxiv.png";
import capturePoster from "../assets/shot-capture.webp";
import wikipedia from "../assets/source-wikipedia.png";
import youtube from "../assets/source-youtube.png";
import { capture } from "../content.ts";
import { AudioIcon, DocIcon, MarkdownIcon, PdfIcon, WebIcon } from "./Icons.tsx";
import { Column, Feature, Frame, Section, SectionHeader } from "./Section.tsx";

const favicons = [
  { image: arxiv, name: "arXiv", className: "" },
  { image: youtube, name: "YouTube", className: "" },
  { image: wikipedia, name: "Wikipedia", className: "bg-foreground" },
];
const fileIcons = [
  { Icon: WebIcon, name: "web" },
  { Icon: PdfIcon, name: "pdf" },
  { Icon: DocIcon, name: "doc" },
  { Icon: AudioIcon, name: "audio" },
  { Icon: MarkdownIcon, name: "markdown" },
];

export function Capture() {
  return (
    <Section id={capture.id}>
      <Column className="flex flex-col gap-14">
        <SectionHeader {...capture} />
        <div className="flex flex-col gap-6 lg:flex-row">
          <Frame className="lg:w-200 lg:shrink-0">
            <img
              src={capturePoster.src}
              alt={capture.screenshotAlt}
              width={capturePoster.width}
              height={capturePoster.height}
              loading="lazy"
              className="h-auto w-full"
            />
          </Frame>
          <div className="border-border flex grow flex-col border-t">
            <Feature title={capture.sources.title} className="border-border gap-3.5 border-b py-6">
              <div className="flex items-center gap-3.5">
                {favicons.map(({ image, name, className }) => (
                  <img
                    key={name}
                    src={image.src}
                    alt={name}
                    width={20}
                    height={20}
                    className={`size-5 rounded-sm ${className}`}
                  />
                ))}
                {fileIcons.map(({ Icon, name }) => (
                  <Icon key={name} className="text-foreground-soft size-5" />
                ))}
              </div>
              <p className="text-foreground-subtle text-sm">{capture.sources.copy}</p>
            </Feature>
            {capture.features.map((feature) => (
              <Feature
                key={feature.title}
                title={feature.title}
                className="border-border border-b py-6"
              >
                <p className="text-foreground-subtle text-sm">{feature.copy}</p>
              </Feature>
            ))}
          </div>
        </div>
      </Column>
    </Section>
  );
}
