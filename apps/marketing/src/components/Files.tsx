import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@avenire/ui/components/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@avenire/ui/components/table";
import youtube from "../assets/source-youtube.png";
import { files } from "../content.ts";
import { DocIcon, PdfIcon } from "./Icons.tsx";
import { Column, Section } from "./Section.tsx";
import { Eyebrow, TwoTone } from "./Type.tsx";

function FileIcon({ kind }: { kind: (typeof files.rows)[number]["icon"] }) {
  if (kind === "youtube")
    return <img src={youtube.src} alt="" width={16} height={16} className="size-4 rounded-sm" />;
  const Icon = kind === "pdf" ? PdfIcon : DocIcon;
  return <Icon className="text-foreground-soft size-4" />;
}

export function Files() {
  const [root, current] = files.path;
  return (
    <Section id={files.id} className="pt-24 pb-24">
      <Column className="flex flex-col justify-between gap-12 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-5 lg:w-115">
          <Eyebrow>{files.eyebrow}</Eyebrow>
          <TwoTone size="subhead" dim={files.dim} bright={files.bright} />
          <p data-reveal="" className="text-foreground-soft text-body-lg">
            {files.copy}
          </p>
        </div>
        <div
          data-reveal=""
          className="border-input bg-surface-2 overflow-clip rounded-sm border lg:w-160"
        >
          <Breadcrumb className="border-border bg-surface-3 flex h-10 items-center border-b px-4">
            <BreadcrumbList>
              <BreadcrumbItem>{root}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{current}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                {files.columns.map((column, index) => (
                  <TableHead key={column} className={index === 0 ? "pl-4" : "w-27.5 max-md:hidden"}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="text-foreground pl-4">
                    <span className="flex items-center gap-2.5">
                      <FileIcon kind={row.icon} />
                      {row.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground-subtle max-md:hidden">{row.kind}</TableCell>
                  <TableCell className="text-foreground-subtle max-md:hidden">
                    {row.modified}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Column>
    </Section>
  );
}
