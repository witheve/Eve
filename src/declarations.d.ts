/// <reference path="../typings/codemirror/codemirror.d.ts" />
/// <reference path="../typings/commonmark/commonmark.d.ts" />

declare module "uuid";

declare module "microReact" {
  export interface Handler<T extends Event> {
    (evt:T, elem:Element): void
  }
  export interface RenderHandler {
    (node:HTMLElement, elem:Element): void
  }

  export interface Element {
    t?:string
    c?:string
    id?:string
    parent?:string
    children?:(Element|undefined)[]
    ix?:number
    key?:string
    dirty?:boolean
    semantic?:string
    debug?:any

    // Content
    contentEditable?:boolean
    checked?:boolean
    draggable?:boolean
    href?:string
    placeholder?:string
    selected?:boolean
    tabindex?:number
    text?:string
    type?:string
    value?:string

    // Styles (Structure)
    flex?:number|string
    left?:number|string
    top?:number|string
    width?:number|string
    height?:number|string
    textAlign?:string
    transform?:string
    verticalAlign?:string
    zIndex?:number

    // Styles (Aesthetic)
    backgroundColor?:string
    backgroundImage?:string
    border?:string
    borderColor?:string
    borderWidth?:number|string
    borderRadius?:number|string
    color?:string
    colspan?:number
    fontFamily?:string
    fontSize?:string
    opacity?:number

    // Svg
    svg?:boolean
    x?:number|string
    y?:number|string
    dx?:number|string
    dy?:number|string
    cx?:number|string
    cy?:number|string
    r?:number|string
    d?:number|string
    fill?:string
    stroke?:string
    strokeWidth?:string
    startOffset?:number|string
    textAnchor?:string
    viewBox?:string
    xlinkhref?:string

    // Events
    dblclick?:Handler<MouseEvent>
    click?:Handler<MouseEvent>
    contextmenu?:Handler<MouseEvent>
    mousedown?:Handler<MouseEvent>
    mousemove?:Handler<MouseEvent>
    mouseup?:Handler<MouseEvent>
    mouseover?:Handler<MouseEvent>
    mouseout?:Handler<MouseEvent>
    mouseleave?:Handler<MouseEvent>
    mousewheel?:Handler<MouseEvent>
    dragover?:Handler<MouseEvent>
    dragstart?:Handler<MouseEvent>
    dragend?:Handler<MouseEvent>
    drag?:Handler<MouseEvent>
    drop?:Handler<MouseEvent>
    scroll?:Handler<MouseEvent>
    focus?:Handler<FocusEvent>
    blur?:Handler<FocusEvent>
    input?:Handler<Event>
    change?:Handler<Event>
    keyup?:Handler<KeyboardEvent>
    keydown?:Handler<KeyboardEvent>

    postRender?:RenderHandler

    [attr:string]: any
  }

  class Renderer {
    content:HTMLElement;
    render(elems:Element[]);
  }
}
