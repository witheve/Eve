declare interface marked {
  (md: string, options?: MarkedOptions, callback?: (err:Error, content: string) => void): string;
  setOptions: (options: MarkedOptions) => void;
  parse(md: string, options?: MarkedOptions, callback?: (err:Error, content: string) => void): string;
}

interface MarkedOptions {
  renderer?: Renderer;
  gfm?: boolean;
  tables?: boolean;
  breaks?: boolean;
  pedantic?: boolean;
  sanitize?: boolean;
  smartLists?: boolean;
  smartypants?: boolean;

  highlight?: (code: string, lang?: string,  callback?: (err:Error, code: string) => void) => string;
}

export class Renderer {
  // Block
  code: (code: string, lang?: string) => string;
  blockquote: (quote: string) => string;
  html: (html: string) => string;
  heading: (text: string, level: number) => string;
  hr: () => string;
  list: (body: string, ordered?: boolean) => string;
  listitem: (text: string) => string;
  paragraphs: (text: string) => string;
  table: (header: string, body: string) => string;
  tablerow: (content: string) => string;
  tablecell: (content: string, flags: {header?: boolean, align?: string}) => string;

  // Inline
  strong: (text: string) => string;
  em: (text: string) => string;
  codespan: (code: string) => string;
  br: (br: string) => string;
  del: (text: string) => string;
  link: (href: string, title?: string, text?: string) => string;
  image: (href: string, title?: string, text?: string) => string;
}

declare var marked:marked;
export var parse:(md: string, options?: MarkedOptions, callback?: (err:Error, content: string) => void) => string;
